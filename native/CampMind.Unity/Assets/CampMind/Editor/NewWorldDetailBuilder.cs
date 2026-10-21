using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldDetailBuilder
    {
        public static Mesh CreateLathe(Vector2[] radiusHeight,int sides)
        {
            if(radiusHeight.Length<2||sides<6||radiusHeight.Any(p=>p.x<=0))throw new ArgumentException("Invalid guard profile");
            var vertices=new List<Vector3>();var indices=new List<int>();
            foreach(var p in radiusHeight)for(int i=0;i<sides;i++){float a=i*Mathf.PI*2/sides;vertices.Add(new Vector3(Mathf.Cos(a)*p.x,p.y,Mathf.Sin(a)*p.x));}
            for(int ring=0;ring<radiusHeight.Length-1;ring++)for(int i=0;i<sides;i++){int j=(i+1)%sides,a=ring*sides+i,b=ring*sides+j,c=b+sides,d=a+sides;indices.AddRange(new[]{a,c,b,a,d,c});}
            int bottom=vertices.Count;vertices.Add(Vector3.up*radiusHeight[0].y);int top=vertices.Count;vertices.Add(Vector3.up*radiusHeight.Last().y);int last=(radiusHeight.Length-1)*sides;
            for(int i=0;i<sides;i++){int j=(i+1)%sides;indices.AddRange(new[]{bottom,i,j,top,last+j,last+i});}
            var mesh=new Mesh{name="New closed bevelled stone guard post"};mesh.SetVertices(vertices);mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static Mesh Save(string id,Mesh mesh)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }
        private static GameObject Beam(string id,Vector3 a,Vector3 b,float width,Material material,bool collision)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=id;go.transform.SetPositionAndRotation((a+b)*.5f,Quaternion.LookRotation(b-a));go.transform.localScale=new Vector3(width,width,Vector3.Distance(a,b));go.GetComponent<Renderer>().sharedMaterial=material;if(!collision)UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());return go;
        }
        public static JObject Build(Camera camera,JObject layout)
        {
            Vector3 At(JToken p,float y)=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),y);
            var stone=AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewStairStone.mat");var wood=AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewHouseTimber.mat");
            var post=Save("new-stair-stone-guard",CreateLathe(new[]{new Vector2(.42f,0),new Vector2(.42f,.2f),new Vector2(.30f,.26f),new Vector2(.23f,.8f),new Vector2(.34f,.91f),new Vector2(.26f,1.1f)},16));int guards=0;
            var stairs=layout["stairs"];
            foreach(var side in new[]{("topLeft","bottomLeft"),("topRight","bottomRight")}){
                var a=At(stairs[side.Item1],10);var b=At(stairs[side.Item2],0);Beam("Observed long-stair stone side rail",a+Vector3.up*.65f,b+Vector3.up*.65f,.42f,stone,true);
                foreach(float t in new[]{0f,.5f,1f}){var go=new GameObject("Long-stair stone guard "+guards++);go.transform.position=Vector3.Lerp(a,b,t);go.AddComponent<MeshFilter>().sharedMesh=post;go.AddComponent<MeshRenderer>().sharedMaterial=stone;go.AddComponent<MeshCollider>().sharedMesh=post;}
            }
            int awnings=0;
            foreach(var data in layout["awningObservations"]??new JArray()){
                float height=(float)data["inferredRoofHeightMeters"];var points=data["roofOutline"].Select(p=>At(p,height)).ToArray();var mesh=new Mesh{name="Observed E side canopy roof"};mesh.vertices=points;mesh.triangles=NewWorldCalibrationBuilder.Triangulate(points);mesh.uv=new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up};mesh.RecalculateNormals();mesh.RecalculateBounds();
                var texPath=NewWorldCalibrationBuilder.Folder+"/E-awning-stripes.asset";var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);if(!texture){texture=new Texture2D(64,16,TextureFormat.RGBA32,true,false){name="New green canvas with observed pale ribs",wrapMode=TextureWrapMode.Clamp};AssetDatabase.CreateAsset(texture,texPath);}var colours=Enumerable.Range(0,64*16).Select(i=>i%8<2?new Color(.84f,.78f,.58f):new Color(.55f,.62f,.43f)).ToArray();texture.SetPixels(colours);texture.Apply();EditorUtility.SetDirty(texture);
                var matPath=NewWorldCalibrationBuilder.Folder+"/NewECanopy.mat";var material=AssetDatabase.LoadAssetAtPath<Material>(matPath);if(!material){material=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(material,matPath);}material.SetTexture("_BaseMap",texture);material.SetColor("_BaseColor",Color.white);material.SetFloat("_Smoothness",.05f);material.SetFloat("_Cull",0);
                var roof=new GameObject("Observed green side awning E");roof.AddComponent<MeshFilter>().sharedMesh=Save("observed-E-green-awning",mesh);roof.AddComponent<MeshRenderer>().sharedMaterial=material;roof.AddComponent<MeshCollider>().sharedMesh=roof.GetComponent<MeshFilter>().sharedMesh;
                var surfaces=UnityEngine.Object.FindObjectsByType<MeshCollider>(FindObjectsSortMode.None).Where(c=>c.name.StartsWith("Registered terrain section",StringComparison.Ordinal)||c.name.EndsWith("-relief",StringComparison.Ordinal)).ToArray();
                for(int i=0;i<points.Length;i++){var top=points[i];var hits=surfaces.Select(c=>{bool hit=c.Raycast(new Ray(new Vector3(top.x,20,top.z),Vector3.down),out var info,40);return(hit,info);}).Where(h=>h.hit&&h.info.point.y<height-.3f).ToArray();float bottom=hits.Length>0?hits.Max(h=>h.info.point.y):0;Beam("E canopy timber support",new Vector3(top.x,bottom,top.z),top,.16f,wood,true);Beam("E canopy roof edge",top,points[(i+1)%points.Length],.13f,wood,false);}awnings++;
            }
            return new JObject{["stairGuards"]=guards,["greenAwnings"]=awnings,["policy"]="Observed side canopy contour and long-stair edges; guard profiles, support heights and concealed joinery inferred; independently editable new geometry",["accepted"]=false};
        }
    }
}
