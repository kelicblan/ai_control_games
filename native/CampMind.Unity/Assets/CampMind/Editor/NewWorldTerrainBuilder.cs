using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldTerrainBuilder
    {
        private static Vector2 P(JToken p)=>new Vector2((float)p[0],(float)p[1]);
        private static float SegmentDistance(Vector2 p,Vector2 a,Vector2 b)
        {var axis=b-a;return Vector2.Distance(p,a+axis*Mathf.Clamp01(Vector2.Dot(p-a,axis)/axis.sqrMagnitude));}
        private static float ChainDistance(Vector2 p,JToken points)
        {var vertices=points.Select(P).ToArray();return Enumerable.Range(1,vertices.Length-1).Min(i=>SegmentDistance(p,vertices[i-1],vertices[i]));}
        public static float HeightAt(Vector2 pixel,JObject layout)
        {
            float value=0,weight=1;
            foreach(var control in layout["terrainHeightInferences"]){float w=Mathf.Exp(-(pixel-P(control["pixel"])).sqrMagnitude/Mathf.Pow((float)control["radiusPixels"],2));value+=(float)control["heightMeters"]*w;weight+=w;}
            float clearance=layout["roads"].Min(chain=>ChainDistance(pixel,chain));
            clearance=Mathf.Min(clearance,ChainDistance(pixel,layout["wall"]["footline"]));
            clearance=Mathf.Min(clearance,SegmentDistance(pixel,P(layout["bridge"]["outerEnd"]),P(layout["bridge"]["villageEnd"])));
            foreach(var building in layout["buildings"]){var feet=building["footprint"].Select(P).ToArray();for(int i=0;i<feet.Length;i++)clearance=Mathf.Min(clearance,SegmentDistance(pixel,feet[i],feet[(i+1)%feet.Length]));}
            float roadFade=Mathf.SmoothStep(0,1,Mathf.InverseLerp(20,48,clearance));
            float shore=Mathf.Min(ChainDistance(pixel,layout["river"]["villageBank"]),ChainDistance(pixel,layout["river"]["outerBank"]));
            return value/weight*roadFade*Mathf.SmoothStep(0,1,Mathf.InverseLerp(18,45,shore));
        }
        public static Mesh CreateMesh(Camera camera,Vector2[] outline,Func<Vector2,float> height,int subdivisions=24)
        {
            var flat=outline.Select(p=>NewWorldCalibrationBuilder.Unproject(camera,p,0)).ToArray();var baseTriangles=NewWorldCalibrationBuilder.Triangulate(flat);
            var vertices=new List<Vector3>();var indices=new List<int>();
            for(int triangle=0;triangle<baseTriangles.Length;triangle+=3){
                var a=outline[baseTriangles[triangle]];var b=outline[baseTriangles[triangle+1]];var c=outline[baseTriangles[triangle+2]];var map=new Dictionary<(int,int),int>();
                for(int i=0;i<=subdivisions;i++)for(int j=0;j<=subdivisions-i;j++){var pixel=a+(b-a)*(i/(float)subdivisions)+(c-a)*(j/(float)subdivisions);map[(i,j)]=vertices.Count;vertices.Add(NewWorldCalibrationBuilder.Unproject(camera,pixel,height(pixel)));}
                void Add(int x,int y,int z){if(Vector3.Cross(vertices[y]-vertices[x],vertices[z]-vertices[x]).y<0)indices.AddRange(new[]{x,z,y});else indices.AddRange(new[]{x,y,z});}
                for(int i=0;i<subdivisions;i++)for(int j=0;j<subdivisions-i;j++){Add(map[(i,j)],map[(i+1,j)],map[(i,j+1)]);if(i+j<subdivisions-1)Add(map[(i+1,j)],map[(i+1,j+1)],map[(i,j+1)]);}
            }
            var mesh=new Mesh{name="Source envelope with inferred continuous relief"};mesh.indexFormat=UnityEngine.Rendering.IndexFormat.UInt32;mesh.SetVertices(vertices);mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        public static JObject Build(Camera camera,JObject layout,Material material)
        {
            foreach(var item in new[]{("terrainMainland","village-relief"),("terrainOuterBank","outer-bank-relief")}){
                var mesh=CreateMesh(camera,layout[item.Item1].Select(P).ToArray(),pixel=>HeightAt(pixel,layout));var path=NewWorldCalibrationBuilder.Folder+"/"+item.Item2+".asset";var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if(previous){EditorUtility.CopySerialized(mesh,previous);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject(item.Item2);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            }
            return new JObject{["controls"]=layout["terrainHeightInferences"].DeepClone(),["policy"]="Terrain envelope stays on observed rays; heights are explicit inferences; roads, building feet and river banks retain clearance",["accepted"]=false};
        }
    }
}
