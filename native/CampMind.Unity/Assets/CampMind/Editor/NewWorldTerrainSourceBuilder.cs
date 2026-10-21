using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldTerrainSourceBuilder
    {
        private static Mesh Save(string id,Mesh mesh)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }
        private static float Cross(Vector2 a,Vector2 b,Vector2 c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
        private static Vector2[] Hull(IEnumerable<Vector3> vertices)
        {
            var points=vertices.Select(v=>new Vector2(v.x,v.z)).Distinct().OrderBy(p=>p.x).ThenBy(p=>p.y).ToArray();var hull=new List<Vector2>();
            foreach(var p in points){while(hull.Count>1&&Cross(hull[hull.Count-2],hull.Last(),p)<=0)hull.RemoveAt(hull.Count-1);hull.Add(p);}int lower=hull.Count;
            foreach(var p in points.Reverse().Skip(1)){while(hull.Count>lower&&Cross(hull[hull.Count-2],hull.Last(),p)<=0)hull.RemoveAt(hull.Count-1);hull.Add(p);}hull.RemoveAt(hull.Count-1);return hull.ToArray();
        }
        private static bool Inside(Vector3 point,Vector2[] hull)
        {var p=new Vector2(point.x,point.z);for(int i=0;i<hull.Length;i++)if(Cross(hull[i],hull[(i+1)%hull.Length],p)<-.001f)return false;return true;}
        public static JObject Build(Camera camera,JObject layout)
        {
            var data=layout["terrainRegistrationInferences"];if(data==null)return new JObject{["status"]="Terrain source not registered"};
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/terrain/terrain-base.glb");if(!source)throw new InvalidOperationException("Approved terrain source absent");
            var groundConstraints=new NewWorldGroundConstraints(camera,layout);
            var controls=data["controls"].ToArray();float scale=(float)data["heightScale"],datum=(float)data["sourceDatum"];
            var sourceControls=controls.Select(c=>new Vector2(-(float)c["sourceGltfXZ"][0],(float)c["sourceGltfXZ"][1])).ToArray();
            var targets=controls.Select(c=>{var p=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)c["targetPixel"][0],(float)c["targetPixel"][1]),(float)c["targetHeight"]);p.y-=((float)c["sourceSurfaceHeight"]-datum)*scale;return p;}).ToArray();
            var warp=new NewWorldTerrainRegistration(sourceControls,targets);var instance=UnityEngine.Object.Instantiate(source);var root=new GameObject("Reference terrain — locally registered source geometry");var all=new List<Vector3>();var colliders=new List<MeshCollider>();int part=0,folded=0,total=0;float minimumJacobian=float.PositiveInfinity,foldedArea=0,totalArea=0;
            var stair=layout["stairs"];Vector3 At(JToken p,float h)=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),h);
            var tl=At(stair["topLeft"],10);var tr=At(stair["topRight"],10);var bl=At(stair["bottomLeft"],0);var br=At(stair["bottomRight"],0);var cuts=new List<Bounds>();
            int steps=(int)stair["stepCount"];for(int i=0;i<steps;i++){float t0=i/(float)steps,t1=(i+1)/(float)steps;var corners=new[]{Vector3.Lerp(bl,tl,t0),Vector3.Lerp(br,tr,t0),Vector3.Lerp(bl,tl,t1),Vector3.Lerp(br,tr,t1)};var cut=new Bounds(corners[0],Vector3.zero);foreach(var p in corners)cut.Encapsulate(p);var min=cut.min;var max=cut.max;min.y=10*t1-.04f;max.y=100;cut.SetMinMax(min,max);cut.Expand(new Vector3(.03f,0,.03f));cuts.Add(cut);}
            var bridgeEnd=At(layout["bridge"]["villageEnd"],.37f);var gate=(At(layout["gate"]["left"],0)+At(layout["gate"]["right"],0))*.5f;
            var direction=(gate-bridgeEnd);direction.y=0;direction.Normalize();var side=Vector3.Cross(Vector3.up,direction)*1.8f;var accessStart=bridgeEnd-direction*4;var accessEnd=gate+direction*3;
            var accessVertices=new List<Vector3>();var accessIndices=new List<int>();
            for(int i=0;i<=16;i++){float t=i/16f;var p=Vector3.Lerp(accessStart,accessEnd,t);p.y=Mathf.Lerp(.37f,0,Mathf.Clamp01((Vector3.Dot(p-bridgeEnd,direction))/Vector3.Distance(bridgeEnd,gate)));accessVertices.Add(p-side);accessVertices.Add(p+side);if(i==0)continue;int a=(i-1)*2;accessIndices.AddRange(new[]{a,a+2,a+3,a,a+3,a+1});var cut=new Bounds(accessVertices[a],Vector3.zero);for(int j=a;j<=a+3;j++)cut.Encapsulate(accessVertices[j]);var min=cut.min;var max=cut.max;min.y=Mathf.Min(accessVertices[a].y,p.y)-.04f;max.y=100;cut.SetMinMax(min,max);cuts.Add(cut);}
            var wall=layout["wall"]["footline"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
            bool InVillage(Vector2 p){bool inside=false;for(int i=0,j=wall.Length-1;i<wall.Length;j=i++)if((wall[i].y>p.y)!=(wall[j].y>p.y)&&p.x<(wall[j].x-wall[i].x)*(p.y-wall[i].y)/(wall[j].y-wall[i].y)+wall[i].x)inside=!inside;return inside;}
            // Entrance rock ramp is changed only within the observed access corridor.
            Vector3 CorrectEntrance(Vector3 p,float sourceY){var axis=new Vector2(gate.x-bridgeEnd.x,gate.z-bridgeEnd.z);var offset=new Vector2(p.x-bridgeEnd.x,p.z-bridgeEnd.z);float t=Mathf.Clamp01(Vector2.Dot(offset,axis)/axis.sqrMagnitude);float distance=Vector2.Distance(offset,axis*t);if(sourceY>datum-.025f&&distance<3.2f){float blend=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(1.7f,3.2f,distance));p.y=Mathf.Lerp(p.y,Mathf.Lerp(.37f,0,t)-.03f,blend);}return p;}
            foreach(var filter in instance.GetComponentsInChildren<MeshFilter>()){
                var original=filter.sharedMesh;var old=original.vertices.Select(filter.transform.TransformPoint).ToArray();var changed=old.Select(v=>{var coordinate=new Vector2(v.x,v.z);minimumJacobian=Mathf.Min(minimumJacobian,warp.JacobianXZ(coordinate));var p=warp.Map(coordinate);p.y+=(v.y-datum)*scale;if(p.y<0&&p.y> -4&&InVillage(NewWorldCalibrationBuilder.Project(camera,p))){float blend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(-4,-2,p.y));p.y*=1-.72f*blend;}return CorrectEntrance(groundConstraints.Shape(p),v.y);}).ToArray();
                var indices=original.triangles;for(int i=0;i<indices.Length;i+=3){var a=indices[i];var b=indices[i+1];var c=indices[i+2];float before=Vector3.Cross(old[b]-old[a],old[c]-old[a]).y,after=Vector3.Cross(changed[b]-changed[a],changed[c]-changed[a]).y;if(Mathf.Abs(before)<1e-8f)continue;total++;totalArea+=Mathf.Abs(before);if(before*after<0){folded++;foldedArea+=Mathf.Abs(before);}}
                var mesh=UnityEngine.Object.Instantiate(original);mesh.name="Terrain source registered to overview controls";mesh.vertices=changed;mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();
                var clipped=StaticMeshClip.Subtract(mesh,cuts);UnityEngine.Object.DestroyImmediate(mesh);
                mesh=NewWorldSourceModules.Compact(clipped);UnityEngine.Object.DestroyImmediate(clipped);all.AddRange(mesh.vertices);
                var go=new GameObject("Registered terrain section "+part);go.transform.SetParent(root.transform,false);go.AddComponent<MeshFilter>().sharedMesh=Save("registered-terrain-"+part++,mesh);go.AddComponent<MeshRenderer>().sharedMaterials=filter.GetComponent<Renderer>().sharedMaterials;var collider=go.AddComponent<MeshCollider>();collider.sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;colliders.Add(collider);
            }
            UnityEngine.Object.DestroyImmediate(instance);
            var materialBounds=new Bounds(all[0],Vector3.zero);foreach(var p in all)materialBounds.Encapsulate(p);var authored=source.GetComponentInChildren<Renderer>().sharedMaterial;var groundMaterial=groundConstraints.BuildMaterial(authored,materialBounds);foreach(var renderer in root.GetComponentsInChildren<Renderer>())renderer.sharedMaterial=groundMaterial;
            var access=new Mesh{name="Observed gate approach ground ramp"};access.SetVertices(accessVertices);access.SetTriangles(accessIndices,0);access.RecalculateNormals();access.RecalculateBounds();var ramp=new GameObject("Registered terrain section gate approach");ramp.AddComponent<MeshFilter>().sharedMesh=Save("registered-gate-approach",access);ramp.AddComponent<MeshRenderer>().sharedMaterial=AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/RoadProxy.mat");var accessCollider=ramp.AddComponent<MeshCollider>();accessCollider.sharedMesh=ramp.GetComponent<MeshFilter>().sharedMesh;colliders.Add(accessCollider);all.AddRange(accessVertices);
            if(minimumJacobian<=0)throw new InvalidOperationException("Terrain correspondence folds its horizontal surface; revise source controls");
            Physics.SyncTransforms();
            var hull=Hull(all);int groundTrianglesRemoved=0;
            foreach(var name in new[]{"village-relief","outer-bank-relief"}){
                var go=GameObject.Find(name);if(!go)continue;var filter=go.GetComponent<MeshFilter>();var original=filter.sharedMesh;var vertices=original.vertices;var indices=original.triangles;var keep=new List<int>();
                bool Covered(Vector3 p){return Inside(p,hull)&&colliders.Any(c=>c.Raycast(new Ray(p+Vector3.up*100,Vector3.down),out _,200));}
                var covered=vertices.Select(Covered).ToArray();
                for(int i=0;i<indices.Length;i+=3){var a=indices[i];var b=indices[i+1];var c=indices[i+2];if(covered[a]&&covered[b]&&covered[c]){groundTrianglesRemoved++;continue;}keep.AddRange(new[]{a,b,c});}
                var mesh=UnityEngine.Object.Instantiate(original);mesh.triangles=keep.ToArray();filter.sharedMesh=Save(name+"-outside-source",mesh);go.GetComponent<MeshCollider>().sharedMesh=filter.sharedMesh;
            }
            var platform=GameObject.Find("main-hall-platform-observed-rim-and-foot");if(platform)platform.SetActive(false);
            foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name.StartsWith("road-",StringComparison.Ordinal)))go.SetActive(false);
            var rows=new JArray();for(int i=0;i<controls.Length;i++){var p=warp.Map(sourceControls[i]);p.y+=((float)controls[i]["sourceSurfaceHeight"]-datum)*scale;rows.Add(new JObject{["id"]=controls[i]["id"].DeepClone(),["targetPixel"]=controls[i]["targetPixel"].DeepClone(),["controlProjectionErrorPixels"]=Vector2.Distance(NewWorldCalibrationBuilder.Project(camera,p),new Vector2((float)controls[i]["targetPixel"][0],(float)controls[i]["targetPixel"][1]))});}
            for(int i=0;i<controls.Length;i++){var target=At(controls[i]["targetPixel"],(float)controls[i]["targetHeight"]);var hits=colliders.Select(c=>{bool found=c.Raycast(new Ray(target+Vector3.up*100,Vector3.down),out var hit,200);return(found,hit);}).Where(h=>h.found).OrderByDescending(h=>h.hit.point.y).ToArray();rows[i]["actualSurfaceHeightErrorMeters"]=hits.Length>0?new JValue(hits[0].hit.point.y-target.y):JValue.CreateNull();rows[i]["actualSurfacePolicy"]="Actual registered terrain/ramp collider; stair cuts may leave no terrain hit. Virtual control fit alone is not a ground-height validation.";}
            return new JObject{["taskId"]="47721ef6-cffe-487a-94bf-ff2e4974801e",["credits"]=60,["controls"]=rows,["sourceHeightMethod"]=data["sourceHeightMethod"]?.DeepClone(),["minimumHorizontalJacobian"]=minimumJacobian,["trianglesCheckedForFolding"]=total,["foldedTriangles"]=folded,["foldedProjectedAreaFraction"]=foldedArea/totalArea,["oldGroundTrianglesRemoved"]=groundTrianglesRemoved,["policy"]="Derived UV-preserving source terrain registered to observed settlement controls; local entrance ramp and stair clearance, old source immutable; control fit is not contour or gameplay acceptance",["accepted"]=false};
        }
    }
}
