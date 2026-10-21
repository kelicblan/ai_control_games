using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldRiverBuilder
    {
        private const string Folder=NewWorldCalibrationBuilder.Folder;
        private static float[] Fractions(Vector2[] points)
        {
            var result=new float[points.Length];for(int i=1;i<points.Length;i++)result[i]=result[i-1]+Vector2.Distance(points[i-1],points[i]);
            if(result[result.Length-1]<=0)throw new ArgumentException("Empty bank trace");float total=result[result.Length-1];for(int i=0;i<result.Length;i++)result[i]/=total;return result;
        }
        private static Vector2 Sample(Vector2[] p,float[] fractions,float t)
        {
            for(int i=1;i<p.Length;i++)if(t<=fractions[i])return Vector2.Lerp(p[i-1],p[i],Mathf.InverseLerp(fractions[i-1],fractions[i],t));return p[p.Length-1];
        }
        public static float HeightAtFraction(JToken river,float fraction)
        {
            var profile=river["inferredHeightProfile"];if(profile==null)return (float)river["inferredWaterHeightMeters"];
            for(int i=1;i<profile.Count();i++)if(fraction<=(float)profile[i][0])return Mathf.Lerp((float)profile[i-1][1],(float)profile[i][1],Mathf.InverseLerp((float)profile[i-1][0],(float)profile[i][0],fraction));return (float)profile.Last()[1];
        }
        public static float HeightAtPixel(JToken river,Vector2 pixel)
        {
            float best=float.PositiveInfinity,fraction=0;
            foreach(var key in new[]{"villageBank","outerBank"}){var points=river[key].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();var f=Fractions(points);for(int i=1;i<points.Length;i++){var axis=points[i]-points[i-1];float t=Mathf.Clamp01(Vector2.Dot(pixel-points[i-1],axis)/axis.sqrMagnitude);float distance=Vector2.SqrMagnitude(pixel-points[i-1]-axis*t);if(distance<best){best=distance;fraction=Mathf.Lerp(f[i-1],f[i],t);}}}
            return HeightAtFraction(river,fraction);
        }
        public static bool IsWaterPixel(JToken river,Vector2 p)
        {
            var polygon=river["villageBank"].Concat(river["outerBank"].Reverse()).Select(v=>new Vector2((float)v[0],(float)v[1])).ToArray();bool inside=false;
            for(int i=0,j=polygon.Length-1;i<polygon.Length;j=i++)if((polygon[i].y>p.y)!=(polygon[j].y>p.y)&&p.x<(polygon[j].x-polygon[i].x)*(p.y-polygon[i].y)/(polygon[j].y-polygon[i].y)+polygon[i].x)inside=!inside;return inside;
        }
        public static Mesh CreateRiverMesh(Camera camera,Vector2[] bankA,Vector2[] bankB,float height,Func<float,float> heightAt=null,IEnumerable<float> extraSamples=null)
        {
            if(bankA.Length<2||bankB.Length<2)throw new ArgumentException("Two bank polylines required");
            var fa=Fractions(bankA);var fb=Fractions(bankB);
            // Union of source breakpoints retains every observed bank corner even when
            // the two traces have different counts. Extra samples add flow tessellation.
            var sections=fa.Concat(fb).Concat(Enumerable.Range(0,65).Select(i=>i/64f)).Concat(extraSamples??Array.Empty<float>()).Distinct().OrderBy(v=>v).ToArray();
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var uv2=new List<Vector2>();var triangles=new List<int>();
            Vector3 previous=Vector3.zero;float distance=0;const int cross=6;
            for(int row=0;row<sections.Length;row++){
                float level=heightAt?.Invoke(sections[row])??height;var a=NewWorldCalibrationBuilder.Unproject(camera,Sample(bankA,fa,sections[row]),level);var b=NewWorldCalibrationBuilder.Unproject(camera,Sample(bankB,fb,sections[row]),level);var center=(a+b)*.5f;
                if(row>0)distance+=Vector3.Distance(previous,center);previous=center;
                float rapid=heightAt==null?0:Mathf.Abs(heightAt(Mathf.Min(1,sections[row]+.005f))-heightAt(Mathf.Max(0,sections[row]-.005f)));
                for(int column=0;column<=cross;column++){float t=column/(float)cross;vertices.Add(Vector3.Lerp(a,b,t));uv.Add(new Vector2(distance*.23f,t));uv2.Add(new Vector2(Vector3.Distance(a,b),rapid));}
                if(row==0)continue;int first=(row-1)*(cross+1);
                for(int column=0;column<cross;column++){
                    var i=first+column;var j=i+cross+1;
                    foreach(var tri in new[]{new[]{i,j,j+1},new[]{i,j+1,i+1}}){if(Vector3.Cross(vertices[tri[1]]-vertices[tri[0]],vertices[tri[2]]-vertices[tri[0]]).y<0)Array.Reverse(tri);triangles.AddRange(tri);}
                }
            }
            var mesh=new Mesh{name="Reference bank-constrained river ribbon"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.SetUVs(1,uv2);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static GameObject Save(string id,Mesh mesh,Material material,bool collision)
        {
            var path=Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject(id);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;if(collision)go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;return go;
        }
        public static Mesh CreateShoreMesh(Camera camera,Vector2[] bank,Func<float,float> waterHeight,float bedDepth)
        {
            var fractions=Fractions(bank);var vertices=new List<Vector3>();var triangles=new List<int>();
            for(int i=0;i<bank.Length;i++){
                var top=NewWorldCalibrationBuilder.Unproject(camera,bank[i],0);var edge=NewWorldCalibrationBuilder.Unproject(camera,bank[i],waterHeight(fractions[i]));vertices.Add(top);vertices.Add(edge);vertices.Add(edge-Vector3.up*bedDepth);
                if(i==0)continue;int j=(i-1)*3;for(int band=0;band<2;band++)triangles.AddRange(new[]{j+band,j+3+band,j+4+band,j+band,j+4+band,j+1+band});
            }
            var mesh=new Mesh{name="Observed bank joins actual land datum and descending water"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static Material Material(string name,string shader,Color colour)
        {
            var path=Folder+"/"+name+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);if(!material){material=new Material(Shader.Find(shader));AssetDatabase.CreateAsset(material,path);}material.SetColor("_BaseColor",colour);material.SetFloat("_Cull",0);return material;
        }
        public static JObject Build(Camera camera,JToken data,JToken rockObservations=null)
        {
            Vector2[] Pixels(JToken points)=>points.Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
            var a=Pixels(data["villageBank"]);var b=Pixels(data["outerBank"]);float water=(float)data["inferredWaterHeightMeters"],bed=(float)data["inferredBedHeightMeters"];
            var breaks=data["inferredHeightProfile"]?.Select(p=>(float)p[0]).ToArray()??Array.Empty<float>();
            var flowMaterial=Material("NewRiverFlow","CampMind/New World River",new Color(.39f,.76f,.91f,.25f));
            var rockData=new Vector4[64];int rockCount=0;
            foreach(var rock in rockObservations??new JArray()){
                if(rockCount==rockData.Length)break;var outline=Pixels(rock["outline"]);float left=outline.Min(p=>p.x),right=outline.Max(p=>p.x),bottom=outline.Max(p=>p.y);var center=new Vector2((left+right)*.5f,bottom);float level=HeightAtPixel(data,center);
                var p=NewWorldCalibrationBuilder.Unproject(camera,center,level);var edge=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(right,bottom),level);rockData[rockCount++]=new Vector4(p.x,p.z,Mathf.Max(.3f,Vector3.Distance(p,edge)*.9f),0);
            }
            flowMaterial.SetInt("_RockCount",rockCount);flowMaterial.SetVectorArray("_RiverRockData",rockData);
            Save("river-new-flow-surface",CreateRiverMesh(camera,a,b,water,s=>HeightAtFraction(data,s),breaks),flowMaterial,false);
            Save("river-new-bed",CreateRiverMesh(camera,a,b,bed,s=>HeightAtFraction(data,s)-(water-bed),breaks),Material("NewRiverBed","Universal Render Pipeline/Lit",new Color(.39f,.43f,.36f)),true);
            var shoreMaterial=Material("NewRiverShore","Universal Render Pipeline/Lit",new Color(.56f,.58f,.49f));
            foreach(var own in new[]{a,b})Save(own==a?"river-village-shore":"river-outer-shore",CreateShoreMesh(camera,own,s=>HeightAtFraction(data,s),water-bed),shoreMaterial,true);
            return new JObject{["source"]="Selected map bank traces",["waterHeightInferred"]=water,["heightProfileInferred"]=data["inferredHeightProfile"]?.DeepClone(),["bedHeightInferred"]=bed,["shoreJoinPolicy"]="Observed bank rays join actual zero-datum land to descending water and bed; removed arbitrary 2.4m lateral offset",["observedRockFoamBodies"]=rockCount,["flowMaterial"]="Procedural current, rapid foam and observed-rock foam over actual descending water mesh",["waterfallsComplete"]=false,["accepted"]=false};
        }
    }
}
