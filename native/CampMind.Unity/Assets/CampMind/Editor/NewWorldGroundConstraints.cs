using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public sealed class NewWorldGroundConstraints
    {
        private readonly List<(Vector2 a,Vector2 b)> roads=new List<(Vector2,Vector2)>(),clearance=new List<(Vector2,Vector2)>();
        private readonly Vector2[][] yards,houses;
        private readonly Vector2[] plaza;
        private readonly Vector2[] court;
        private readonly float courtHeight;
        public NewWorldGroundConstraints(Camera camera,JObject layout)
        {
            Vector2 At(JToken p){var world=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),0);return new Vector2(world.x,world.z);}
            void Add(JToken chain,List<(Vector2,Vector2)> list){var p=chain.Select(At).ToArray();for(int i=1;i<p.Length;i++)list.Add((p[i-1],p[i]));}
            foreach(var chain in layout["roads"])Add(chain,roads);clearance.AddRange(roads);
            foreach(var route in layout["yardWalkRouteInferences"])Add(route["pixels"],clearance);
            yards=layout["yardFenceObservations"].Select(yard=>yard["chains"].SelectMany(chain=>chain.Select(At)).Distinct().ToArray()).ToArray();
            houses=layout["buildings"].Where(b=>new[]{"A","B","C","D","E"}.Contains((string)b["id"])).Select(b=>b["footprint"].Select(At).ToArray()).ToArray();
            plaza=layout["plaza"]["outline"].Select(At).ToArray();
            var observation=layout["hallCourtObservation"];courtHeight=(float?)observation?["inferredHeightMeters"]??10;
            court=observation==null?Array.Empty<Vector2>():observation["outline"].Select(p=>{var v=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),courtHeight);return new Vector2(v.x,v.z);}).ToArray();
        }
        private static float Distance(Vector2 p,List<(Vector2 a,Vector2 b)> segments)
        {float distance=float.PositiveInfinity;foreach(var edge in segments){var axis=edge.b-edge.a;float t=Mathf.Clamp01(Vector2.Dot(p-edge.a,axis)/axis.sqrMagnitude);distance=Mathf.Min(distance,Vector2.Distance(p,edge.a+axis*t));}return distance;}
        private static bool Inside(Vector2 p,Vector2[] polygon)
        {bool inside=false;for(int i=0,j=polygon.Length-1;i<polygon.Length;j=i++)if((polygon[i].y>p.y)!=(polygon[j].y>p.y)&&p.x<(polygon[j].x-polygon[i].x)*(p.y-polygon[i].y)/(polygon[j].y-polygon[i].y)+polygon[i].x)inside=!inside;return inside;}
        public Vector3 Shape(Vector3 p)
        {
            var point=new Vector2(p.x,p.z);
            if(p.y<=-4||p.y>=6)return p;if(Inside(point,plaza)||houses.Any(poly=>Inside(point,poly))){p.y=0;return p;}float distance=Distance(point,clearance);
            float blend=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(1.25f,2.75f,distance));p.y=Mathf.Lerp(p.y,0,blend);return p;
        }
        public Material BuildMaterial(Material authored,Bounds bounds)
        {
            const int size=512;var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++){
                var p=new Vector2(Mathf.Lerp(bounds.min.x,bounds.max.x,x/(float)(size-1)),Mathf.Lerp(bounds.min.z,bounds.max.z,y/(float)(size-1)));
                float road=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.8f,1.9f,Distance(p,roads)));
                float soil=houses.Any(poly=>Inside(p,poly))?1:yards.Any(poly=>Inside(p,poly))?.3f:0;float stone=court.Length>2&&Inside(p,court)?1:0;pixels[y*size+x]=new Color(Mathf.Max(road,soil),stone,0,1);
            }
            string path=NewWorldCalibrationBuilder.Folder+"/observed-road-controls.asset";var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(path);if(!texture){texture=new Texture2D(size,size,TextureFormat.RGBA32,false,true){name="Vector-derived observed roads, not reference image",wrapMode=TextureWrapMode.Clamp};AssetDatabase.CreateAsset(texture,path);}texture.SetPixels(pixels);texture.Apply();EditorUtility.SetDirty(texture);
            path=NewWorldCalibrationBuilder.Folder+"/NewRegisteredTerrain.mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);if(!material){material=new Material(Shader.Find("CampMind/New World Registered Terrain"));AssetDatabase.CreateAsset(material,path);}
            var property=authored.GetTexturePropertyNames().First(p=>p.IndexOf("basecolor",StringComparison.OrdinalIgnoreCase)>=0||p=="_BaseMap"||p=="_MainTex");material.SetTexture("_BaseMap",authored.GetTexture(property));material.SetTexture("_ControlMap",texture);material.SetVector("_WorldRect",new Vector4(bounds.min.x,bounds.min.z,bounds.size.x,bounds.size.z));return material;
        }
    }
}
