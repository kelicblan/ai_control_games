using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using CampMind.Presentation;

namespace CampMind.Editor
{
    public static class NewWorldSourceModules
    {
        private const string Folder=NewWorldCalibrationBuilder.Folder;
        public static Mesh KeepComponentNearest(Mesh source,Vector3 marker)
        {
            var vertices=source.vertices;var triangles=Enumerable.Range(0,source.subMeshCount).SelectMany(source.GetTriangles).ToArray();if(triangles.Length==0)throw new ArgumentException("Source component is empty");var parent=Enumerable.Range(0,vertices.Length).ToArray();
            int Root(int i){while(parent[i]!=i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
            void Union(int a,int b){parent[Root(a)]=Root(b);}
            var positions=new Dictionary<Vector3Int,int>();
            for(int i=0;i<vertices.Length;i++){var v=vertices[i]*100000;var key=new Vector3Int(Mathf.RoundToInt(v.x),Mathf.RoundToInt(v.y),Mathf.RoundToInt(v.z));if(positions.TryGetValue(key,out var previous))Union(i,previous);else positions.Add(key,i);}
            for(int i=0;i<triangles.Length;i+=3){Union(triangles[i],triangles[i+1]);Union(triangles[i],triangles[i+2]);}
            int nearest=triangles.Distinct().OrderBy(i=>Vector3.SqrMagnitude(vertices[i]-marker)).First(),component=Root(nearest);var copy=UnityEngine.Object.Instantiate(source);
            try{for(int part=0;part<source.subMeshCount;part++){var indices=source.GetTriangles(part);var keep=new List<int>();for(int i=0;i<indices.Length;i+=3)if(Root(indices[i])==component)keep.AddRange(new[]{indices[i],indices[i+1],indices[i+2]});copy.SetTriangles(keep,part);}return Compact(copy);}finally{UnityEngine.Object.DestroyImmediate(copy);}
        }
        public static Mesh Compact(Mesh source)
        {
            var used=Enumerable.Range(0,source.subMeshCount).SelectMany(source.GetTriangles).Distinct().ToArray();var map=used.Select((old,index)=>(old,index)).ToDictionary(pair=>pair.old,pair=>pair.index);
            var mesh=new Mesh{name=source.name+" compact",indexFormat=UnityEngine.Rendering.IndexFormat.UInt32};
            var vertices=source.vertices;mesh.vertices=used.Select(i=>vertices[i]).ToArray();
            var normals=source.normals;if(normals.Length==vertices.Length)mesh.normals=used.Select(i=>normals[i]).ToArray();
            var uv=source.uv;if(uv.Length==vertices.Length)mesh.uv=used.Select(i=>uv[i]).ToArray();
            var uv2=source.uv2;if(uv2.Length==vertices.Length)mesh.uv2=used.Select(i=>uv2[i]).ToArray();
            var tangents=source.tangents;if(tangents.Length==vertices.Length)mesh.tangents=used.Select(i=>tangents[i]).ToArray();
            var colors=source.colors;if(colors.Length==vertices.Length)mesh.colors=used.Select(i=>colors[i]).ToArray();
            mesh.subMeshCount=source.subMeshCount;for(int s=0;s<source.subMeshCount;s++)mesh.SetTriangles(source.GetTriangles(s).Select(i=>map[i]).ToArray(),s);
            if(normals.Length!=vertices.Length)mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        public static Mesh KeepBounds(Mesh source,Bounds keep)
        {
            var whole=source.bounds;whole.Expand(2);var boxes=new List<Bounds>();
            for(int axis=0;axis<3;axis++)foreach(bool low in new[]{true,false}){
                var min=whole.min;var max=whole.max;
                if(low)max[axis]=keep.min[axis];else min[axis]=keep.max[axis];
                if(max[axis]<=min[axis])continue;boxes.Add(new Bounds((min+max)*.5f,max-min));
            }
            var cut=StaticMeshClip.Subtract(source,boxes);try{return Compact(cut);}finally{UnityEngine.Object.DestroyImmediate(cut);}
        }
        private static Mesh Save(string id,Mesh mesh)
        {
            var path=Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }
        public static JObject ReplacePalisade(Camera camera,JObject layout)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(Folder+"/Models/stage3/palisade.glb");var filter=source.GetComponentInChildren<MeshFilter>();var material=filter.GetComponent<Renderer>().sharedMaterial;
            var bounds=filter.sharedMesh.bounds;int axis=bounds.size.z>bounds.size.x?2:0;var variants=new Mesh[3];
            for(int v=0;v<3;v++){var center=bounds.center;center[axis]+=bounds.size[axis]*(v-1)*.145f;var size=bounds.size+Vector3.one*.1f;size[axis]=bounds.size[axis]*.062f;variants[v]=Save("source-palisade-column-"+v,KeepBounds(filter.sharedMesh,new Bounds(center,size)));}
            var line=layout["wall"]["footline"].Select(p=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),0)).ToArray();
            var logs=UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name=="palisade-log").OrderBy(go=>go.transform.position.z).ThenBy(go=>go.transform.position.x).ToArray();int index=0;
            foreach(var log in logs){
                float height=log.transform.localScale.y*2+1.2f;var foot=log.transform.position-Vector3.up*(height-1.2f)*.5f;
                var mesh=variants[index%3];var b=mesh.bounds;float scale=height/b.size.y;
                var segment=Enumerable.Range(1,line.Length-1).OrderBy(i=>{var d=line[i]-line[i-1];return Vector3.Distance(foot,line[i-1]+d*Mathf.Clamp01(Vector3.Dot(foot-line[i-1],d)/d.sqrMagnitude));}).First();
                var rotation=Quaternion.LookRotation(line[segment]-line[segment-1])*Quaternion.Euler(0,axis==0?90:0,0);
                var go=new GameObject("New source palisade column "+index);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=material;
                go.transform.localScale=Vector3.one*scale;go.transform.rotation=rotation;go.transform.position=foot-rotation*(new Vector3(b.center.x,b.min.y,b.center.z)*scale);
                log.GetComponent<Renderer>().enabled=false;index++;
            }
            foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name=="palisade-point"||go.name=="wall-stone-base"))if(go.TryGetComponent<Renderer>(out var renderer))renderer.enabled=false;
            return new JObject{["columns"]=index,["method"]="Three locally clipped source columns, uniform height fit to measured wall tip line; original collision retained",["sourcePreserved"]=true,["accepted"]=false};
        }
        public static JObject AttachGateLeaves(GameObject owner,NewWorldCalibrationView view)
        {
            var filter=owner.GetComponentInChildren<MeshFilter>();var source=filter.sharedMesh;var b=source.bounds;int axis=b.size.z>b.size.x?2:0;
            // Include the complete lower crossbar in the moving leaves. Leaving
            // it on the frame made a waist-high obstacle across the opening.
            float openingBottom=b.min.y-.01f,openingTop=b.min.y+b.size.y*.66f;
            var keepCenter=b.center;keepCenter.y=(openingBottom+openingTop)*.5f;var keepSize=b.size+Vector3.one*.1f;keepSize.y=openingTop-openingBottom;keepSize[axis]=b.size[axis]*.52f;var opening=new Bounds(keepCenter,keepSize);
            var cut=StaticMeshClip.Subtract(source,new[]{opening});var frame=Compact(cut);UnityEngine.Object.DestroyImmediate(cut);filter.sharedMesh=Save("source-gate-open-frame",frame);
            filter.gameObject.AddComponent<MeshCollider>().sharedMesh=filter.sharedMesh;
            if(view.gate)UnityEngine.Object.DestroyImmediate(view.gate.gameObject);
            foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name=="gate-post"||go.name=="gate-top-beam"))go.SetActive(false);
            var gate=owner.AddComponent<NewWorldGateDoor>();var hinges=new Transform[2];
            for(int side=0;side<2;side++){
                var center=opening.center;center[axis]+=(side==0?-1:1)*opening.size[axis]*.25f;var size=opening.size;size[axis]*=.5f;
                var mesh=Save("source-gate-leaf-"+side,KeepBounds(source,new Bounds(center,size)));
                var pivot=opening.center;pivot.y=opening.min.y;pivot[axis]=side==0?opening.min[axis]:opening.max[axis];
                var hinge=new GameObject("Source gate hinge "+side).transform;hinge.SetPositionAndRotation(filter.transform.TransformPoint(pivot),owner.transform.rotation);hinge.SetParent(owner.transform,true);hinges[side]=hinge;
                var leaf=new GameObject("Source gate leaf "+side);leaf.AddComponent<MeshFilter>().sharedMesh=mesh;leaf.AddComponent<MeshRenderer>().sharedMaterials=filter.GetComponent<Renderer>().sharedMaterials;
                leaf.transform.SetPositionAndRotation(filter.transform.position,filter.transform.rotation);leaf.transform.localScale=filter.transform.lossyScale;leaf.transform.SetParent(hinge,true);
                var collision=leaf.AddComponent<BoxCollider>();collision.center=mesh.bounds.center;collision.size=mesh.bounds.size;
            }
            gate.leftLeaf=hinges[0];gate.rightLeaf=hinges[1];gate.leftClosed=hinges[0].rotation;gate.rightClosed=hinges[1].rotation;gate.center=(hinges[0].position+hinges[1].position)*.5f;view.gate=gate;
            return new JObject{["method"]="Local UV-preserving gate opening and independent hinged source leaves",["sourcePreserved"]=true,["openingLocalBounds"]=JObject.FromObject(new{center=new[]{opening.center.x,opening.center.y,opening.center.z},size=new[]{opening.size.x,opening.size.y,opening.size.z}}),["accepted"]=false};
        }
        public static JObject PlaceBridge(Camera camera,JObject layout)
        {
            var owner=new GameObject("Source bridge — uniformly fitted to observed endpoints");var instance=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Folder+"/Models/stage3/bridge.glb"),owner.transform);
            var filters=instance.GetComponentsInChildren<MeshFilter>();var points=filters.SelectMany(f=>f.sharedMesh.vertices.Select(f.transform.TransformPoint)).ToArray();var bounds=new Bounds(points[0],Vector3.zero);foreach(var point in points)bounds.Encapsulate(point);
            var samples=new List<(Vector3 p,Vector3 n)>();foreach(var f in filters){var vertices=f.sharedMesh.vertices;var normals=f.sharedMesh.normals;for(int i=0;i<vertices.Length;i++)samples.Add((f.transform.TransformPoint(vertices[i]),normals.Length==vertices.Length?f.transform.TransformDirection(normals[i]):Vector3.up));}
            var horizontal=samples.Where(v=>v.n.y>.85f&&v.p.y>bounds.min.y+bounds.size.y*.35f&&v.p.y<bounds.min.y+bounds.size.y*.75f).ToArray();
            float deck=horizontal.Length>0?horizontal.GroupBy(v=>Mathf.Round(v.p.y*200)).OrderByDescending(g=>g.Count()).First().Average(v=>v.p.y):bounds.min.y+bounds.size.y*.55f;
            Vector3 At(JToken p)=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),.37f);
            var a=At(layout["bridge"]["outerEnd"]);var z=At(layout["bridge"]["villageEnd"]);var delta=z-a;int axis=bounds.size.z>bounds.size.x?2:0;float scale=delta.magnitude/bounds.size[axis];float yaw=Mathf.Atan2(delta.x,delta.z)*Mathf.Rad2Deg-(axis==0?90:0);
            owner.transform.SetPositionAndRotation((a+z)*.5f,Quaternion.Euler(0,yaw,0));instance.transform.localScale=Vector3.one*scale;instance.transform.localPosition=-new Vector3(bounds.center.x,deck,bounds.center.z)*scale;
            foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name.StartsWith("bridge-",StringComparison.Ordinal)||go.name=="Bridge individual deck plank"))if(go.TryGetComponent<Renderer>(out var renderer))renderer.enabled=false;
            return new JObject{["uniformScale"]=scale,["yaw"]=yaw,["sourceDeckHeight"]=deck,["sourceLongAxis"]=axis,["deckInference"]="Most populated upward-facing vertex-height band; verify against walking capture",["collisionPolicy"]="Reference-controlled deck and rails retained",["accepted"]=false};
        }
        public static JObject PlaceYardFences(Camera camera,JObject layout)
        {
            var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(Folder+"/Models/stage3/low-fence.glb");var filter=prefab.GetComponentInChildren<MeshFilter>();var source=filter.sharedMesh;var material=filter.GetComponent<Renderer>().sharedMaterial;var b=source.bounds;int axis=b.size.z>b.size.x?2:0;float scale=1.45f/b.size.y;int modules=0;
            foreach(var yard in layout["yardFenceObservations"]){var id=(string)yard["id"];int segment=0;
                foreach(var chain in yard["chains"]){var pixels=chain.Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
                    for(int i=1;i<pixels.Length;i++){
                        float height=NewWorldTerrainBuilder.HeightAt((pixels[i-1]+pixels[i])*.5f,layout);var a=NewWorldCalibrationBuilder.Unproject(camera,pixels[i-1],height);var end=NewWorldCalibrationBuilder.Unproject(camera,pixels[i],height);var direction=(end-a).normalized;float length=Vector3.Distance(a,end),step=b.size[axis]*scale;var rotation=Quaternion.LookRotation(direction)*Quaternion.Euler(0,axis==0?90:0,0);int chunks=Mathf.CeilToInt(length/step);
                        for(int chunk=0;chunk<chunks;chunk++){
                            float width=Mathf.Min(step,length-chunk*step);var mesh=source;
                            if(width<step-.001f){var center=b.center;center[axis]=b.min[axis]+width/scale*.5f;var size=b.size+Vector3.one*.1f;size[axis]=width/scale;mesh=Save("source-yard-"+id+"-trim-"+segment,KeepBounds(source,new Bounds(center,size)));}
                            var origin=b.center;origin.y=b.min.y;origin[axis]=mesh.bounds.center[axis];var go=new GameObject("New source yard "+id+" segment "+segment);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=material;go.transform.SetPositionAndRotation(a+direction*(chunk*step+width*.5f)-rotation*(origin*scale),rotation);go.transform.localScale=Vector3.one*scale;
                            var collider=go.AddComponent<BoxCollider>();collider.center=mesh.bounds.center;collider.size=mesh.bounds.size;modules++;segment++;
                        }
                    }
                }
            }
            foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name.StartsWith("new-yard-B-",StringComparison.Ordinal)))go.SetActive(false);
            return new JObject{["yards"]=layout["yardFenceObservations"].Count(),["modules"]=modules,["uniformHeightMeters"]=1.45f,["policy"]="Source modules follow individually observed open fence chains; end segments clipped locally, no nonuniform stretch",["accepted"]=false};
        }
    }
}
