using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldStandingStoneBuilder
    {
        public static JObject Build(Camera camera,JObject layout)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/rock.glb");var filter=source.GetComponentInChildren<MeshFilter>();var bounds=filter.sharedMesh.bounds;var min=bounds.min;min.y=bounds.max.y-bounds.size.y*.30f;var keep=new Bounds();keep.SetMinMax(min,bounds.max+Vector3.one*.001f);var fragment=NewWorldSourceModules.KeepBounds(filter.sharedMesh,keep);
            try{
                var points=layout["plaza"]["standingStoneOutline"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();var target=Rect.MinMaxRect(points.Min(p=>p.x),points.Min(p=>p.y),points.Max(p=>p.x),points.Max(p=>p.y));float height=(float?)layout["plaza"]["inferredStandingHeightMeters"]??6.5f;float scale=height/fragment.bounds.size.y;
                var origin=new Vector3(fragment.bounds.center.x,fragment.bounds.min.y,fragment.bounds.center.z);var at=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(target.center.x,target.yMax),0);var matrix=Matrix4x4.TRS(at-origin*scale,Quaternion.identity,Vector3.one*scale);var projected=fragment.vertices.Select(v=>NewWorldCalibrationBuilder.Project(camera,matrix.MultiplyPoint3x4(v))).ToArray();var from=Rect.MinMaxRect(projected.Min(p=>p.x),projected.Min(p=>p.y),projected.Max(p=>p.x),projected.Max(p=>p.y));
                var mesh=NewWorldSourceFitBuilder.CorrectMesh(camera,fragment,matrix,from,target,0,height,0,height);string path=NewWorldCalibrationBuilder.Folder+"/source-standing-stone.asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject("Observed central standing stone — source rock detail");go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=filter.GetComponent<Renderer>().sharedMaterial;var proxy=GameObject.Find("new-plaza-standing-stone");if(proxy)proxy.GetComponent<Renderer>().enabled=false;
                return new JObject{["source"]="New approved rock source upper crag, local UV-preserving extraction",["targetBounds"]=new JArray(target.xMin,target.yMin,target.xMax,target.yMax),["heightInferredMeters"]=height,["collisionPolicy"]="Closed contour-controlled proxy retained",["accepted"]=false};
            }finally{UnityEngine.Object.DestroyImmediate(fragment);}
        }
    }
}
