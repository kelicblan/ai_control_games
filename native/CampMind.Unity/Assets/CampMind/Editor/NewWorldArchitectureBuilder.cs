using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    // Reference-controlled architecture. It does not deform the paid source mesh.
    public static class NewWorldArchitectureBuilder
    {
        private const string Folder=NewWorldCalibrationBuilder.Folder;
        private static Vector2 Pixel(JToken p)=>new Vector2((float)p[0],(float)p[1]);
        private static void Triangle(List<int> triangles,List<Vector3> vertices,int a,int b,int c)
        {var normal=Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]);if(normal.sqrMagnitude<1e-10f)return;if(normal.y<0){triangles.Add(a);triangles.Add(c);triangles.Add(b);}else{triangles.Add(a);triangles.Add(b);triangles.Add(c);}}
        public static Mesh CreateRoofMesh(Camera camera,Vector2[] eavePixels,Vector2[] ridgePixels,float eaveHeight,float ridgeHeight)
        {
            if(eavePixels.Length<3||ridgePixels.Length!=2||ridgeHeight<=eaveHeight)throw new ArgumentException("Invalid reference roof constraints");
            var eaves=eavePixels.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,eaveHeight)).ToArray();
            var ridge=ridgePixels.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,ridgeHeight)).ToArray();
            var axis=ridge[1]-ridge[0];axis.y=0;var axisLength=axis.magnitude;axis/=axisLength;
            Vector3 Inner(Vector3 p){var t=Mathf.Clamp01(Vector3.Dot(p-ridge[0],axis)/axisLength);return Vector3.Lerp(ridge[0],ridge[1],t);}
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
            const int along=6, slope=8;
            for(int edge=0;edge<eaves.Length;edge++){
                int start=vertices.Count;
                for(int u=0;u<=along;u++){
                    var outer=Vector3.Lerp(eaves[edge],eaves[(edge+1)%eaves.Length],u/(float)along);var inner=Inner(outer);
                    for(int v=0;v<=slope;v++){
                        float t=v/(float)slope;var p=Vector3.Lerp(outer,inner,t);p.y-=Mathf.Sin(t*Mathf.PI)*.35f;
                        vertices.Add(p);uv.Add(new Vector2(Vector3.Dot(p-ridge[0],axis)/.38f,Vector3.Distance(outer,inner)*t/.56f));
                    }
                }
                for(int u=0;u<along;u++)for(int v=0;v<slope;v++){
                    var a=start+u*(slope+1)+v;var b=a+slope+1;Triangle(triangles,vertices,a,b,b+1);Triangle(triangles,vertices,a,b+1,a+1);
                }
            }
            var mesh=new Mesh{name="Reference B curved tiled roof"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static Material Mat(string name,Color color,string shader="Universal Render Pipeline/Lit")
        {
            var path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find(shader));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",.12f);m.SetFloat("_Cull",0);return m;
        }
        private static GameObject SaveMesh(string id,Mesh mesh,Material material,Transform parent,bool collision)
        {
            var path=Folder+"/"+id+".asset";var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(previous){EditorUtility.CopySerialized(mesh,previous);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject(id);go.transform.SetParent(parent,false);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;
            if(collision)go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;return go;
        }
        private static GameObject Box(string name,Vector3 center,Vector3 size,Quaternion rotation,Material material,Transform parent)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(parent,false);go.transform.SetPositionAndRotation(center,rotation);go.transform.localScale=size;go.GetComponent<Renderer>().sharedMaterial=material;UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());return go;
        }
        private static void Beam(string name,Vector3 a,Vector3 b,float width,Material material,Transform parent)
        {Box(name,(a+b)*.5f,new Vector3(width,width,Vector3.Distance(a,b)),Quaternion.LookRotation(b-a),material,parent);}
        private static void Finial(Camera camera,Vector2 root,Vector2 tip,float baseHeight,float tipHeight,Material material,Transform parent)
        {
            var a=NewWorldCalibrationBuilder.Unproject(camera,root,baseHeight);var c=NewWorldCalibrationBuilder.Unproject(camera,tip,tipHeight);
            var b=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(tip.x,root.y),Mathf.Lerp(baseHeight,tipHeight,.35f));
            var previous=a;for(int i=1;i<=10;i++){float t=i/10f;var next=(1-t)*(1-t)*a+2*(1-t)*t*b+t*t*c;Beam("Reference-positioned curled roof finial",previous,next,.23f,material,parent);previous=next;}
        }
        private static Mesh WallMesh(Vector3[] feet,float bottom,float top)
        {
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
            for(int i=0;i<feet.Length;i++){
                var a=feet[i];var b=feet[(i+1)%feet.Length];int start=vertices.Count;vertices.AddRange(new[]{a+Vector3.up*bottom,b+Vector3.up*bottom,b+Vector3.up*top,a+Vector3.up*top});
                float width=Vector3.Distance(a,b);uv.AddRange(new[]{Vector2.zero,new Vector2(width,0),new Vector2(width,top-bottom),new Vector2(0,top-bottom)});triangles.AddRange(new[]{start,start+1,start+2,start,start+2,start+3});
            }
            var mesh=new Mesh{name="Reference B timber and plaster wall volume"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        public static JObject BuildHall(Camera camera,JToken reference,JToken dimensions)
        {
            var root=new GameObject("Hall H — separately constrained roof tiers").transform;
            var wood=Mat("NewHouseTimber",new Color(.37f,.23f,.11f));var gold=Mat("NewHouseRoofTrim",new Color(.62f,.43f,.19f));
            var tile=Mat("NewHouseBlueTiles",new Color(.25f,.32f,.39f),"CampMind/New World Tiles");
            var feet=reference["footprint"].Select(p=>NewWorldCalibrationBuilder.Unproject(camera,Pixel(p),10)).ToArray();
            SaveMesh("controlled-hall-walls",WallMesh(feet,0,7.5f),wood,root,true);
            foreach(var tier in dimensions["roofTiers"]){
                var id=(string)tier["id"];float eave=(float)tier["eaveHeightMeters"],ridge=(float)tier["ridgeHeightMeters"];
                var ep=tier["eaves"].Select(Pixel).ToArray();var rp=tier["ridge"].Select(Pixel).ToArray();
                SaveMesh("controlled-hall-roof-"+id,CreateRoofMesh(camera,ep,rp,eave,ridge),tile,root,false);
                var edge=ep.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,eave)).ToArray();
                for(int i=0;i<edge.Length;i++)Beam("Hall roof perimeter "+id,edge[i],edge[(i+1)%edge.Length],.32f,gold,root);
                Beam("Hall ridge "+id,NewWorldCalibrationBuilder.Unproject(camera,rp[0],ridge),NewWorldCalibrationBuilder.Unproject(camera,rp[1],ridge),.4f,gold,root);
            }
            foreach(var pair in dimensions["finials"]){Finial(camera,Pixel(pair[0]),Pixel(pair[1]),(float)pair[2],(float)pair[3],gold,root);}
            foreach(var pixel in dimensions["frontColumns"]){var foot=NewWorldCalibrationBuilder.Unproject(camera,Pixel(pixel),10);Beam("Hall front timber column",foot,foot+Vector3.up*7.2f,.55f,gold,root);}
            var jade=Mat("NewHallJade",new Color(.31f,.59f,.54f));
            foreach(var medallion in dimensions["medallions"]){
                var at=NewWorldCalibrationBuilder.Unproject(camera,Pixel(medallion["pixel"]),(float)medallion["inferredHeightMeters"]);
                var disk=GameObject.CreatePrimitive(PrimitiveType.Cylinder);disk.name="Hall source-positioned gold medallion";disk.transform.SetParent(root,false);disk.transform.position=at;disk.transform.rotation=Quaternion.Euler(90,0,0);float radius=(float)medallion["inferredRadiusMeters"];disk.transform.localScale=new Vector3(radius*2,.22f,radius*2);disk.GetComponent<Renderer>().sharedMaterial=gold;UnityEngine.Object.DestroyImmediate(disk.GetComponent<Collider>());
                var inner=UnityEngine.Object.Instantiate(disk,root);inner.name="Hall jade medallion inset";inner.transform.position=at+Vector3.back*.25f;inner.transform.localScale=new Vector3(radius*1.6f,.08f,radius*1.6f);inner.GetComponent<Renderer>().sharedMaterial=jade;
            }
            return new JObject{["id"]="controlled-hall-H",["method"]="Separate source-observed roof tiers and column feet; hidden heights inferred",["rendered"]=true,["inferredDimensions"]=dimensions.DeepClone(),["accepted"]=false};
        }
        public static JObject BuildHouse(Camera camera,JToken reference,JToken dimensions)
        {
            var id=(string)reference["id"];if(!new[]{"A","B","C","D","E"}.Contains(id))throw new ArgumentException("House reference ID must be A–E");
            var owner=new GameObject("House "+id+" — rebuilt from overview constraints");var root=owner.transform;var prefix="controlled-house-"+id;
            float eave=(float)dimensions["eaveHeightMeters"],ridge=(float)dimensions["ridgeHeightMeters"],foundation=(float)dimensions["foundationHeightMeters"];
            var feet=reference["footprint"].Select(p=>NewWorldCalibrationBuilder.Unproject(camera,Pixel(p),0)).ToArray();
            var wood=Mat("NewHouseTimber",new Color(.37f,.23f,.11f));var plaster=Mat("NewHousePlaster",new Color(.84f,.82f,.70f));var stone=Mat("NewHouseStone",new Color(.55f,.59f,.56f));var gold=Mat("NewHouseRoofTrim",new Color(.62f,.43f,.19f));
            var tile=Mat("NewHouseBlueTiles",new Color(.25f,.32f,.39f),"CampMind/New World Tiles");
            SaveMesh(prefix+"-foundation",WallMesh(feet,0,foundation),stone,root,true);
            SaveMesh(prefix+"-plaster",WallMesh(feet,foundation,eave),plaster,root,true);
            var eavePixels=reference["roofBounds"].Select(Pixel).ToArray();var ridgePixels=reference["roofRidge"].Select(Pixel).ToArray();
            SaveMesh(prefix+"-roof",CreateRoofMesh(camera,eavePixels,ridgePixels,eave,ridge),tile,root,true);
            var ridgePoints=ridgePixels.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,ridge)).ToArray();Beam("Blue roof ridge timber",ridgePoints[0],ridgePoints[1],.28f,gold,root);
            var roofEdges=eavePixels.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,eave)).ToArray();
            for(int i=0;i<roofEdges.Length;i++)Beam("Curved perimeter eave timber",roofEdges[i],roofEdges[(i+1)%roofEdges.Length],.22f,wood,root);
            // Ridge end tips are observed upper silhouette nodes; their hidden vertical
            // profile is inferred. Curves terminate inside the source silhouette.
            var first=eavePixels.OrderBy(p=>Vector2.Distance(p,ridgePixels[0])).First();var last=eavePixels.OrderBy(p=>Vector2.Distance(p,ridgePixels[1])).First();
            Finial(camera,ridgePixels[0],first,ridge,ridge+.9f,gold,root);Finial(camera,ridgePixels[1],last,ridge,ridge+.9f,gold,root);
            var middle=new Vector2(eavePixels.Average(p=>p.x),eavePixels.Average(p=>p.y));
            foreach(var tip in new[]{eavePixels.OrderBy(p=>p.x).First(),eavePixels.OrderByDescending(p=>p.x).First()})Finial(camera,Vector2.Lerp(tip,middle,.22f),tip,eave,eave+1.1f,gold,root);
            for(int i=0;i<feet.Length;i++){
                var a=feet[i];var b=feet[(i+1)%feet.Length];Beam("Corner timber",a+Vector3.up*foundation,a+Vector3.up*eave,.28f,wood,root);
                Beam("Lower wall beam",a+Vector3.up*(foundation+.15f),b+Vector3.up*(foundation+.15f),.22f,wood,root);Beam("Upper wall beam",a+Vector3.up*(eave-.12f),b+Vector3.up*(eave-.12f),.22f,wood,root);
                for(int post=1;post<3;post++){var p=Vector3.Lerp(a,b,post/3f);Beam("Wall division timber",p+Vector3.up*foundation,p+Vector3.up*eave,.18f,wood,root);}
            }
            // Front face follows the observed front foundation edge, not the raw model orientation.
            var frontA=feet[3];var frontB=feet[2];var front=(frontA+frontB)*.5f;var tangent=(frontB-frontA).normalized;var normal=Vector3.Cross(Vector3.up,tangent).normalized;var rotation=Quaternion.LookRotation(normal);
            Box("Front double door",front+normal*.08f+Vector3.up*(foundation+1.8f),new Vector3(2.8f,3.6f,.12f),rotation,wood,root);
            var lantern=Mat("NewHouseLanternPaper",new Color(.95f,.73f,.30f));
            foreach(var side in new[]{-1f,1f}){
                var point=front+tangent*(side*1.9f)+normal*.28f+Vector3.up*(foundation+3.3f);Box("Door-side lantern",point,new Vector3(.45f,.65f,.45f),rotation,lantern,root);Beam("Lantern wood frame",point-Vector3.up*.4f,point+Vector3.up*.4f,.09f,wood,root);
            }
            Beam("Door centre seam",front+normal*.16f+Vector3.up*foundation,front+normal*.16f+Vector3.up*(foundation+3.6f),.045f,gold,root);
            foreach(float t in new[]{.22f,.78f}){
                var center=Vector3.Lerp(frontA,frontB,t)+normal*.1f+Vector3.up*(foundation+2.6f);Box("Wooden window inset",center,new Vector3(2.1f,2,.14f),rotation,wood,root);
                var light=Mat("NewHouseWindowPaper",new Color(.72f,.61f,.37f));Box("Warm paper window",center+normal*.09f,new Vector3(1.8f,1.7f,.04f),rotation,light,root);
                for(int bar=-1;bar<=1;bar++)Beam("Window lattice",center+tangent*(bar*.5f)+normal*.13f-Vector3.up*.9f,center+tangent*(bar*.5f)+normal*.13f+Vector3.up*.9f,.08f,wood,root);
                Beam("Window horizontal lattice",center+normal*.14f-tangent,center+normal*.14f+tangent,.09f,wood,root);
            }
            if(dimensions["porch"] is JToken porch){
                float pe=(float)porch["eaveHeightMeters"],pr=(float)porch["ridgeHeightMeters"];
                var ep=porch["eaves"].Select(Pixel).ToArray();var rp=porch["ridge"].Select(Pixel).ToArray();
                SaveMesh(prefix+"-front-porch-roof",CreateRoofMesh(camera,ep,rp,pe,pr),tile,root,false);
                var edge=ep.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,pe)).ToArray();for(int i=0;i<edge.Length;i++)Beam("Porch eave trim",edge[i],edge[(i+1)%edge.Length],.19f,gold,root);
                foreach(var footPixel in porch["columnFeet"]){var point=NewWorldCalibrationBuilder.Unproject(camera,Pixel(footPixel),foundation);Beam("Source-positioned porch column",point,point+Vector3.up*(pe-foundation),.25f,wood,root);}
            }
            var points=owner.GetComponentsInChildren<MeshFilter>().SelectMany(f=>f.sharedMesh.vertices.Select(v=>f.transform.TransformPoint(v))).ToArray();var projected=points.Select(p=>NewWorldCalibrationBuilder.Project(camera,p)).ToArray();
            var target=Rect.MinMaxRect(eavePixels.Min(p=>p.x),eavePixels.Min(p=>p.y),eavePixels.Max(p=>p.x),reference["footprint"].Max(p=>(float)p[1]));
            var actual=Rect.MinMaxRect(projected.Min(p=>p.x),projected.Min(p=>p.y),projected.Max(p=>p.x),projected.Max(p=>p.y));
            return new JObject{["id"]=prefix,["method"]="Overview-constrained new architecture; raw Tripo source preserved, not stretched",["rendered"]=true,["targetBounds"]=new JArray(target.xMin,target.yMin,target.xMax,target.yMax),["projectedBounds"]=new JArray(actual.xMin,actual.yMin,actual.xMax,actual.yMax),["heightDifferencePixels"]=actual.height-target.height,["inferredDimensions"]=dimensions.DeepClone(),["accepted"]=false};
        }
    }
}
