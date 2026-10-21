using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldBankDetailBuilder
    {
        public static JObject Build(Camera camera,JObject layout)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/terrain/terrain-base.glb");var sourceFilter=source.GetComponentInChildren<MeshFilter>();
            var centers=new[]{new Vector3(-.03967f,.0045f,.0651f),new Vector3(.19045f,.0075f,.02311f),new Vector3(.09581f,.0025f,.14016f),new Vector3(-.14613f,.003f,-.02866f),new Vector3(.17645f,.0035f,.13064f),new Vector3(-.04717f,.0005f,.18598f),new Vector3(-.21309f,-.001f,.08568f)};
            var peakHeights=new[]{.01616f,.01469f,.01165f,.01046f,.00985f,.00825f,.00598f};var fragments=new Mesh[centers.Length];
            for(int i=0;i<centers.Length;i++){var crop=new Bounds();crop.SetMinMax(new Vector3(centers[i].x-.045f,centers[i].y,centers[i].z-.045f),new Vector3(centers[i].x+.045f,.04f,centers[i].z+.045f));var cropped=NewWorldSourceModules.KeepBounds(sourceFilter.sharedMesh,crop);try{fragments[i]=NewWorldSourceModules.KeepComponentNearest(cropped,new Vector3(centers[i].x,peakHeights[i],centers[i].z));}finally{UnityEngine.Object.DestroyImmediate(cropped);}if(fragments[i].vertexCount<3)throw new InvalidOperationException("Source terrain boulder fragment absent");}
            var rows=new JArray();int variant=0;
            try{foreach(var observation in layout["bankRockObservations"]){
                string id=(string)observation["id"];var old=GameObject.Find("observed-bank-rock-"+id);if(!old||!old.activeSelf)continue;
                var outline=observation["outline"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();var target=Rect.MinMaxRect(outline.Min(p=>p.x),outline.Min(p=>p.y),outline.Max(p=>p.x),outline.Max(p=>p.y));
                var fragment=fragments[variant++%fragments.Length];float water=NewWorldRiverBuilder.IsWaterPixel(layout["river"],target.center)?NewWorldRiverBuilder.HeightAtPixel(layout["river"],new Vector2(target.center.x,target.yMax)):0;float bottom=water-.08f,top=water+(float)observation["inferredHeightMeters"],scale=(top-bottom)/fragment.bounds.size.y;
                var origin=new Vector3(fragment.bounds.center.x,fragment.bounds.min.y,fragment.bounds.center.z);var at=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(target.center.x,target.yMax),bottom);var matrix=Matrix4x4.TRS(at-origin*scale,Quaternion.identity,Vector3.one*scale);
                var pixels=fragment.vertices.Select(v=>NewWorldCalibrationBuilder.Project(camera,matrix.MultiplyPoint3x4(v))).ToArray();var from=Rect.MinMaxRect(pixels.Min(p=>p.x),pixels.Min(p=>p.y),pixels.Max(p=>p.x),pixels.Max(p=>p.y));
                var mesh=NewWorldSourceFitBuilder.CorrectMesh(camera,fragment,matrix,from,target,bottom,top,bottom,top);
                string path=NewWorldCalibrationBuilder.Folder+"/detailed-bank-rock-"+id+".asset";var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(previous){EditorUtility.CopySerialized(mesh,previous);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject("Source terrain boulder detail "+id);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=sourceFilter.GetComponent<Renderer>().sharedMaterial;old.GetComponent<Renderer>().enabled=false;
                rows.Add(new JObject{["id"]=id,["observedBounds"]=new JArray(target.xMin,target.yMin,target.xMax,target.yMax),["collisionPolicy"]="Existing closed coarse observed proxy retained; clipped source underside submerged",["accepted"]=false});
            }}finally{foreach(var fragment in fragments)UnityEngine.Object.DestroyImmediate(fragment);}
            return new JObject{["rocks"]=rows,["sourceVariants"]=centers.Length,["policy"]="Connected rounded boulder bodies extracted from approved terrain source across UV seams; no mountain summits or arbitrary crop side walls. UV preserved, observed outer bounds constrain derived projection; underside and depth inferred",["accepted"]=false};
        }
    }
}
