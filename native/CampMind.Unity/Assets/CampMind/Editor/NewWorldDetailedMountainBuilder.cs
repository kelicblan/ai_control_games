using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldDetailedMountainBuilder
    {
        public static Material PaintedMaterial(Material authored,string id,float haze,float baseFade=0)
        {
            var property=authored.GetTexturePropertyNames().FirstOrDefault(p=>p.IndexOf("basecolor",StringComparison.OrdinalIgnoreCase)>=0||p=="_BaseMap"||p=="_MainTex");
            if(property==null)throw new InvalidOperationException("Source albedo absent");
            var path=NewWorldCalibrationBuilder.Folder+"/painted-source-"+id+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);if(!material){material=new Material(Shader.Find("CampMind/New World Authored Surface"));AssetDatabase.CreateAsset(material,path);}material.SetTexture("_BaseMap",authored.GetTexture(property));material.SetColor("_BaseColor",Color.white);material.SetFloat("_Haze",haze);material.SetFloat("_BaseFade",baseFade);
            var normal=authored.GetTexturePropertyNames().FirstOrDefault(p=>p.IndexOf("normal",StringComparison.OrdinalIgnoreCase)>=0||p=="_BumpMap");material.SetFloat("_NormalEnabled",normal!=null&&authored.GetTexture(normal)?1:0);if(normal!=null&&authored.GetTexture(normal))material.SetTexture("_NormalMap",authored.GetTexture(normal));return material;
        }
        public static Mesh CorrectMass(Camera camera,Mesh source,Matrix4x4 sourceToWorld,Rect from,Vector2[] crest,Vector2 footLeft,Vector2 footRight,float sourceBase,float sourceTop,float height)
        {
            const int bins=128;var vertices=source.vertices.Select(sourceToWorld.MultiplyPoint3x4).ToArray();var projected=vertices.Select(p=>NewWorldCalibrationBuilder.Project(camera,p)).ToArray();
            var upper=Enumerable.Repeat(float.PositiveInfinity,bins+1).ToArray();var lower=Enumerable.Repeat(float.NegativeInfinity,bins+1).ToArray();
            int Bin(float x)=>Mathf.Clamp(Mathf.RoundToInt((x-from.xMin)/from.width*bins),0,bins);
            foreach(var p in projected){int bin=Bin(p.x);upper[bin]=Mathf.Min(upper[bin],p.y);lower[bin]=Mathf.Max(lower[bin],p.y);}
            void Fill(float[] values){for(int i=0;i<=bins;i++){if(!float.IsInfinity(values[i]))continue;int a=i-1,b=i+1;while(a>=0&&float.IsInfinity(values[a]))a--;while(b<=bins&&float.IsInfinity(values[b]))b++;values[i]=a<0?values[b]:b>bins?values[a]:Mathf.Lerp(values[a],values[b],(i-a)/(float)(b-a));}}
            Fill(upper);Fill(lower);
            float Top(float x){for(int i=1;i<crest.Length;i++)if(x<=crest[i].x)return Mathf.Lerp(crest[i-1].y,crest[i].y,Mathf.InverseLerp(crest[i-1].x,crest[i].x,x));return crest.Last().y;}
            float left=Mathf.Min(crest.First().x,footLeft.x),right=Mathf.Max(crest.Last().x,footRight.x);
            // A fixed, low elevation with a tall observed skyline makes the inverse
            // projection run far behind the foot, producing a horizontal ceiling.
            // Anchor the massif in a bounded horizontal footprint instead. Height
            // follows from each observed ray; source depth supplies real thickness.
            var forward=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;
            var footA=NewWorldCalibrationBuilder.Unproject(camera,footLeft,0);var footB=NewWorldCalibrationBuilder.Unproject(camera,footRight,0);
            float width=Vector3.Distance(footA,footB),minDepth=vertices.Min(v=>Vector3.Dot(v,forward)),maxDepth=vertices.Max(v=>Vector3.Dot(v,forward));
            float Envelope(float[] values,float x){float b=Mathf.Clamp((x-from.xMin)/from.width*bins,0,bins);int i=Mathf.Min(bins-1,Mathf.FloorToInt(b));return Mathf.Lerp(values[i],values[i+1],b-i);}
            var corrected=new Vector3[vertices.Length];for(int i=0;i<vertices.Length;i++){
                var pixel=projected[i];float x=Mathf.Lerp(left,right,Mathf.InverseLerp(from.xMin,from.xMax,pixel.x));
                float fraction=Mathf.InverseLerp(Envelope(upper,pixel.x),Envelope(lower,pixel.x),pixel.y),along=Mathf.InverseLerp(footLeft.x,footRight.x,x),bottom=Mathf.Lerp(footLeft.y,footRight.y,along);
                float y=Mathf.Lerp(Top(x),bottom,fraction);
                float sourceDepth=Mathf.InverseLerp(minDepth,maxDepth,Vector3.Dot(vertices[i],forward))-.5f;
                float footprintDepth=sourceDepth*width*.55f*Mathf.Sin(Mathf.PI*fraction)+width*.12f*(1-fraction);
                var foot=Vector3.Lerp(footA,footB,along);float plane=Vector3.Dot(foot,forward)+footprintDepth;
                var ground=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(x,y),0);var ray=ground-camera.transform.position;
                float distance=(plane-Vector3.Dot(camera.transform.position,forward))/Vector3.Dot(ray,forward);
                corrected[i]=camera.transform.position+ray*distance;
            }
            var mesh=UnityEngine.Object.Instantiate(source);mesh.name="Detailed source massif with observed skyline correction";mesh.vertices=corrected;mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
        private static void BuildOne(Camera camera,string id,string model,Vector2[] crest,Vector2 footLeft,Vector2 footRight,float height,float haze=.18f,float depthScale=1)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/"+model+".glb");var temporary=UnityEngine.Object.Instantiate(source);
            var filters=temporary.GetComponentsInChildren<MeshFilter>();var points=filters.SelectMany(f=>f.sharedMesh.vertices.Select(f.transform.TransformPoint)).ToArray();var bounds=new Bounds(points[0],Vector3.zero);foreach(var p in points)bounds.Encapsulate(p);float scale=height/bounds.size.y;
            temporary.transform.position=NewWorldCalibrationBuilder.Unproject(camera,(footLeft+footRight)*.5f,0)-new Vector3(bounds.center.x,bounds.min.y,bounds.center.z)*scale;temporary.transform.localScale=Vector3.one*scale;
            points=filters.SelectMany(f=>f.sharedMesh.vertices.Select(f.transform.TransformPoint)).ToArray();var projected=points.Select(p=>NewWorldCalibrationBuilder.Project(camera,p)).ToArray();var from=Rect.MinMaxRect(projected.Min(p=>p.x),projected.Min(p=>p.y),projected.Max(p=>p.x),projected.Max(p=>p.y));var root=new GameObject("mountain-"+id+"-source-details");int part=0;
            foreach(var filter in filters){
                var mesh=CorrectMass(camera,filter.sharedMesh,filter.transform.localToWorldMatrix,from,crest,footLeft,footRight,0,height,height);
                mesh.colors=mesh.vertices.Select(p=>new Color(1,1,1,Mathf.InverseLerp(0,height,p.y))).ToArray();
                if(depthScale!=1){mesh.vertices=mesh.vertices.Select(p=>camera.transform.position+(p-camera.transform.position)*depthScale).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();}
                string path=NewWorldCalibrationBuilder.Folder+"/detailed-mass-"+id+"-"+part+++".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject("mountain-"+id+"-detailed-surface");go.transform.SetParent(root.transform,false);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterials=filter.GetComponent<Renderer>().sharedMaterials.Select(m=>PaintedMaterial(m,id,haze,depthScale>1?1:0)).ToArray();go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            }
            UnityEngine.Object.DestroyImmediate(temporary);
        }
        public static JObject Build(Camera camera,JObject layout)
        {
            Vector2 P(JToken p)=>new Vector2((float)p[0],(float)p[1]);
            foreach(var mass in layout["mountains"]){var id=(string)mass["id"];BuildOne(camera,id,"rock",mass["crest"].Select(P).ToArray(),P(mass["foot"][0]),P(mass["foot"][1]),(float)mass["inferredCrestHeightMeters"],(float?)mass["inferredAerialHaze"]??.18f,(float?)mass["inferredDepthScale"]??1);var rough=GameObject.Find("mountain-"+id+"-inferred-depth");if(rough)rough.SetActive(false);}
            var snow=layout["snowRidge"].Select(P).ToArray();BuildOne(camera,"snow-range","stage2/snow-range",snow,new Vector2(snow.First().x,125),new Vector2(snow.Last().x,125),35,.65f,1.4f);var oldSnow=GameObject.Find("snow-range-provisional-front");if(oldSnow)oldSnow.SetActive(false);
            return new JObject{["masses"]=layout["mountains"].Count()+1,["sourceModels"]=new JArray("rock","stage2/snow-range"),["snowDepthScaleInference"]=1.4f,["snowFootYCoarseObservation"]=125,["footprintDepthInference"]="Source depth spans 0.55 of observed foot width, crest is set back by 0.12 foot widths. Heights follow observed rays at this bounded footprint; previous fixed height hints are superseded.",["policy"]="Derived UV-preserving source meshes with observed skyline and feet, bounded 3D footprint; height and occluded interior inferred; distant snow separated along reference rays, no reference-image background",["accepted"]=false};
        }
    }
}
