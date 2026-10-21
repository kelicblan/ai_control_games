using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldMountainBuilder
    {
        public static Mesh CreateMass(Camera camera,Vector2[] observedCrest,Vector2 footLeft,Vector2 footRight,float maxHeight,float backDepth)
        {
            if(observedCrest.Length<3||maxHeight<=0||backDepth<=0)throw new ArgumentException("Mountain outline and positive inferred dimensions required");
            var crest=new List<Vector2>();for(int i=0;i<observedCrest.Length-1;i++)for(int sample=0;sample<8;sample++)crest.Add(Vector2.Lerp(observedCrest[i],observedCrest[i+1],sample/8f));crest.Add(observedCrest.Last());
            float minimum=observedCrest.Min(p=>p.y),maximum=observedCrest.Max(p=>p.y);const int rows=32;int n=crest.Count;
            var vertices=new List<Vector3>();var indices=new List<int>();
            for(int side=0;side<2;side++)for(int column=0;column<n;column++){
                var pixel=crest[column];var height=maxHeight*Mathf.Lerp(.27f,1,Mathf.InverseLerp(maximum,minimum,pixel.y));var top=NewWorldCalibrationBuilder.Unproject(camera,pixel,height);
                var footPixel=Vector2.Lerp(footLeft,footRight,column/(float)(n-1));
                for(int row=0;row<=rows;row++){
                    float t=row/(float)rows;Vector3 p;
                    if(side==0){
                        // Interior samples stay on rays inside the observed outline;
                        // their relief is inferred, while the crest never moves in image space.
                        float channel=column*.34f;
                        var relief=(Mathf.Sin(channel*2.7f+Mathf.Sin(t*6)*.4f)*2.4f+Mathf.Sin(channel*7.3f+t*2)*.7f+Mathf.Sin(row*1.7f+channel)*.25f)*Mathf.Sin(t*Mathf.PI);
                        var y=Mathf.Max(0,height*(1-Mathf.Pow(t,.72f))+relief);
                        p=NewWorldCalibrationBuilder.Unproject(camera,Vector2.Lerp(pixel,footPixel,t),y);
                    }else{p=Vector3.Lerp(top,new Vector3(top.x,0,top.z+backDepth),t);p.x+=Mathf.Sin(column*1.5f)*Mathf.Sin(t*Mathf.PI)*1.2f;}
                    vertices.Add(p);
                }
            }
            int section=n*(rows+1);
            void Triangle(int a,int b,int c){if(Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]).sqrMagnitude>1e-10f)indices.AddRange(new[]{a,b,c});}
            for(int side=0;side<2;side++)for(int col=0;col<n-1;col++)for(int row=0;row<rows;row++){
                int a=side*section+col*(rows+1)+row,b=a+rows+1;
                if(side==0){Triangle(a,b+1,b);Triangle(a,a+1,b+1);}else{Triangle(a,b,b+1);Triangle(a,b+1,a+1);}
            }
            for(int col=0;col<n-1;col++){
                int a=col*(rows+1)+rows,b=a+rows+1;Triangle(a,b,b+section);Triangle(a,b+section,a+section);
            }
            foreach(int col in new[]{0,n-1})for(int row=0;row<rows;row++){
                int a=col*(rows+1)+row,b=a+section;Triangle(a,b,a+1);Triangle(a+1,b,b+1);
            }
            var mesh=new Mesh{name="Observed crest with inferred variable-height mountain volume"};mesh.SetVertices(vertices);mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static Material Mat(string name,Color colour,string sourceModel)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+name+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!material){material=new Material(Shader.Find("CampMind/New World Rock"));AssetDatabase.CreateAsset(material,path);}material.SetColor("_BaseColor",colour);material.SetFloat("_UseSourceAtlas",0);
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(sourceModel);
            if(source)foreach(var authored in source.GetComponentsInChildren<Renderer>().SelectMany(r=>r.sharedMaterials).Where(m=>m)){
                var property=authored.GetTexturePropertyNames().FirstOrDefault(p=>p.IndexOf("basecolor",StringComparison.OrdinalIgnoreCase)>=0||p=="_BaseMap"||p=="_MainTex");
                if(property!=null&&authored.GetTexture(property)){material.SetTexture("_SourceAtlas",authored.GetTexture(property));material.SetFloat("_UseSourceAtlas",.16f);break;}
            }
            return material;
        }
        private static void Save(string name,Mesh mesh,Material material)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+name+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject(name);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
        }
        public static void Build(Camera camera,JObject layout)
        {
            Vector2 P(JToken p)=>new Vector2((float)p[0],(float)p[1]);
            var rock=Mat("NewLimestone",new Color(.66f,.68f,.63f),NewWorldCalibrationBuilder.Folder+"/Models/rock.glb");
            foreach(var mass in layout["mountains"])Save("mountain-"+(string)mass["id"]+"-inferred-depth",CreateMass(camera,mass["crest"].Select(P).ToArray(),P(mass["foot"][0]),P(mass["foot"][1]),(float)mass["inferredCrestHeightMeters"],28),rock);
            var snow=layout["snowRidge"].Select(P).ToArray();Save("snow-range-provisional-front",CreateMass(camera,snow,new Vector2(snow.First().x,190),new Vector2(snow.Last().x,190),35,55),Mat("NewSnowMass",new Color(.81f,.85f,.84f),NewWorldCalibrationBuilder.Folder+"/Models/stage2/snow-range.glb"));
        }
    }
}
