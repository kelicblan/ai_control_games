using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldObservedRockBuilder
    {
        public static Mesh CreateRock(Camera camera,Vector2[] outline,float crestHeight,float depth,float baseHeight=0)
        {
            if(outline.Length<4||crestHeight<=baseHeight||depth<=0)throw new ArgumentException("Invalid observed boulder constraints");
            float ymin=outline.Min(p=>p.y),ymax=outline.Max(p=>p.y);
            var foot=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(outline.Average(p=>p.x),ymax),baseHeight);var facePlane=new Plane(camera.transform.forward,foot);
            var front=outline.Select(p=>{var ground=NewWorldCalibrationBuilder.Unproject(camera,p,0);var ray=camera.orthographic?new Ray(ground-camera.transform.forward*1000,camera.transform.forward):new Ray(camera.transform.position,(ground-camera.transform.position).normalized);if(!facePlane.Raycast(ray,out var distance))throw new InvalidOperationException("Rock outline does not intersect inferred front plane");return ray.GetPoint(distance);}).ToArray();
            var back=front.Select(p=>p+camera.transform.forward*depth).ToArray();
            var center=front.Aggregate(Vector3.zero,(a,b)=>a+b)/front.Length;
            center-=camera.transform.forward*Mathf.Min((crestHeight-baseHeight)*.35f,depth*.30f);var backCenter=center+camera.transform.forward*depth;
            var vertices=front.Concat(back).ToList();int n=outline.Length;var triangles=new List<int>();
            foreach(float radius in new[]{.65f,.27f})for(int i=0;i<n;i++){var p=Vector3.Lerp(center,front[i],radius);p-=camera.transform.forward*(Mathf.Sin(i*1.7f)*.02f*depth*radius);vertices.Add(p);}
            int faceCenter=vertices.Count;vertices.Add(center);int rearCenter=vertices.Count;vertices.Add(backCenter);
            void Add(int a,int b,int c,Vector3 desired){if(Vector3.Dot(Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]),desired)<0)triangles.AddRange(new[]{a,c,b});else triangles.AddRange(new[]{a,b,c});}
            for(int i=0;i<n;i++){
                int j=(i+1)%n;
                foreach(var pair in new[]{(0,2*n),(2*n,3*n)}){Add(pair.Item1+i,pair.Item1+j,pair.Item2+j,-camera.transform.forward);Add(pair.Item1+i,pair.Item2+j,pair.Item2+i,-camera.transform.forward);}
                Add(3*n+i,3*n+j,faceCenter,-camera.transform.forward);Add(n+j,n+i,rearCenter,camera.transform.forward);
                var outward=(front[i]+front[j])*.5f-center;outward-=Vector3.Project(outward,camera.transform.forward);Add(i,n+i,n+j,outward);Add(i,n+j,j,outward);
            }
            var mesh=new Mesh{name="Observed irregular boulder contour with rounded closed interior and inferred back"};mesh.SetVertices(vertices);mesh.triangles=triangles.ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        public static JObject Build(Camera camera,JToken observations,JToken river=null)
        {
            var material=AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewLimestone.mat");if(!material)throw new InvalidOperationException("New limestone material absent");
            var materialPath=NewWorldCalibrationBuilder.Folder+"/NewBankLimestone.mat";var bank=AssetDatabase.LoadAssetAtPath<Material>(materialPath);if(!bank){bank=new Material(material);AssetDatabase.CreateAsset(bank,materialPath);}bank.SetColor("_BaseColor",new Color(.45f,.47f,.42f));bank.SetFloat("_UseSourceAtlas",.12f);material=bank;
            var ids=new JArray();
            foreach(var observation in observations){
                var id="observed-bank-rock-"+(string)observation["id"];
                var outline=observation["outline"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
                var foot=new Vector2(outline.Average(p=>p.x),outline.Max(p=>p.y));var center=new Vector2((outline.Min(p=>p.x)+outline.Max(p=>p.x))*.5f,(outline.Min(p=>p.y)+outline.Max(p=>p.y))*.5f);float water=river==null?-2:NewWorldRiverBuilder.IsWaterPixel(river,center)?NewWorldRiverBuilder.HeightAtPixel(river,foot):0;
                var mesh=CreateRock(camera,outline,water+(float)observation["inferredHeightMeters"],(float)observation["inferredDepthMeters"],water);
                var path=NewWorldCalibrationBuilder.Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject(id);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;ids.Add(id);
            }
            return new JObject{["objects"]=ids,["policy"]="Observed front silhouette; inferred height and closed back depth, no scatter",["accepted"]=false};
        }
    }
}
