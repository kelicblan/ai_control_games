using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldPlatformBuilder
    {
        public static Mesh CreateShell(Vector3[] top,Vector3[] bottom)
        {
            if(top.Length<4||top.Length!=bottom.Length)throw new ArgumentException("Platform rim and foot require paired vertices");
            int n=top.Length;const int layers=4;var vertices=new List<Vector3>();var sides=new List<int>();
            for(int layer=0;layer<layers;layer++)for(int i=0;i<n;i++)vertices.Add(Vector3.Lerp(bottom[i],top[i],layer/(float)(layers-1)));
            int firstTop=n*(layers-1);var cap=NewWorldCalibrationBuilder.Triangulate(top).Select(i=>i+firstTop).ToArray();
            sides.AddRange(NewWorldCalibrationBuilder.Triangulate(bottom).Reverse());
            float area=bottom.Select((p,i)=>p.x*bottom[(i+1)%n].z-p.z*bottom[(i+1)%n].x).Sum();
            for(int layer=0;layer<layers-1;layer++)for(int i=0;i<n;i++){int next=(i+1)%n,a=layer*n+i,b=layer*n+next,c=(layer+1)*n+next,d=(layer+1)*n+i;sides.AddRange(area>0?new[]{a,c,b,a,d,c}:new[]{a,b,c,a,c,d});}
            var mesh=new Mesh{name="Independent observed platform rim and rock foot with stair notch"};mesh.SetVertices(vertices);mesh.subMeshCount=2;mesh.SetTriangles(cap,0);mesh.SetTriangles(sides,1);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        public static JObject Build(Camera camera,JObject layout,Material grass)
        {
            var p=layout["platform"];float height=(float)p["inferredHeightMeters"];
            Vector2 Pixel(JToken pixel)=>new Vector2((float)pixel[0],(float)pixel[1]);
            var top=p["top"].Select(pixel=>NewWorldCalibrationBuilder.Unproject(camera,Pixel(pixel),height)).ToArray();var paired=p["baseCorrespondence"];
            if(paired.Count()!=top.Length)throw new InvalidOperationException("Incomplete platform correspondence");
            var bottom=new Vector3[top.Length];var rows=new JArray();
            for(int i=0;i<top.Length;i++){
                if(paired[i].Type==JTokenType.Null){bottom[i]=new Vector3(top[i].x,0,top[i].z);rows.Add(new JObject{["index"]=i,["status"]="Hidden notch base below steps, vertical continuation inferred"});continue;}
                var pixel=Pixel(paired[i]);float y=NewWorldTerrainBuilder.HeightAt(pixel,layout);bottom[i]=NewWorldCalibrationBuilder.Unproject(camera,pixel,y);
                var oldBase=new Vector3(top[i].x,0,top[i].z);
                rows.Add(new JObject{["index"]=i,["observedPixel"]=new JArray(pixel.x,pixel.y),["oldExtrusionFootErrorPixels"]=Vector2.Distance(NewWorldCalibrationBuilder.Project(camera,oldBase),pixel),["newFootTraceErrorPixels"]=Vector2.Distance(NewWorldCalibrationBuilder.Project(camera,bottom[i]),pixel),["inferredGroundHeightMeters"]=y});
            }
            var mesh=CreateShell(top,bottom);var path=NewWorldCalibrationBuilder.Folder+"/observed-main-hall-platform.asset";var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(previous){EditorUtility.CopySerialized(mesh,previous);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject("main-hall-platform-observed-rim-and-foot");go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            go.AddComponent<MeshRenderer>().sharedMaterials=new[]{grass,AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewLimestone.mat")};go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            return new JObject{["footCorrespondence"]=rows,["policy"]="Independent observed upper and lower contours; inner stair-notch bases and vertical datum inferred; trace fit is not art acceptance",["accepted"]=false};
        }
    }
}
