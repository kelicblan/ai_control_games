using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    // Local derived geometry only: all source GLBs and their UVs remain immutable.
    public static class NewWorldSourceFitBuilder
    {
        public static Mesh CorrectMesh(Camera camera,Mesh source,Matrix4x4 sourceToWorld,Rect sourcePixels,Rect observedPixels,float sourceBase,float sourceTop,float targetBase,float targetTop)
        {
            if(sourcePixels.width<=0||sourcePixels.height<=0||sourceTop<=sourceBase||targetTop<=targetBase)throw new ArgumentException("Invalid observed cage");
            var mesh=UnityEngine.Object.Instantiate(source);mesh.name=source.name+" observed projection cage correction";
            mesh.vertices=source.vertices.Select(vertex=>{
                var world=sourceToWorld.MultiplyPoint3x4(vertex);var pixel=NewWorldCalibrationBuilder.Project(camera,world);
                var observed=new Vector2(Mathf.LerpUnclamped(observedPixels.xMin,observedPixels.xMax,(pixel.x-sourcePixels.xMin)/sourcePixels.width),Mathf.LerpUnclamped(observedPixels.yMin,observedPixels.yMax,(pixel.y-sourcePixels.yMin)/sourcePixels.height));
                var height=Mathf.LerpUnclamped(targetBase,targetTop,(world.y-sourceBase)/(sourceTop-sourceBase));
                return NewWorldCalibrationBuilder.Unproject(camera,observed,height);
            }).ToArray();mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
        public static JArray Build(Camera camera,JObject layout)
        {
            var rows=new JArray();
            foreach(var entry in layout["sourceCorrectionInferences"]){
                string id=(string)entry["id"],model=(string)entry["model"];var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/"+model+".glb");
                var temporary=UnityEngine.Object.Instantiate(source);temporary.transform.rotation=Quaternion.Euler(0,(float)entry["yaw"],0);
                var filters=temporary.GetComponentsInChildren<MeshFilter>();var vertices=filters.SelectMany(f=>f.sharedMesh.vertices.Select(f.transform.TransformPoint)).ToArray();
                var bounds=new Bounds(vertices[0],Vector3.zero);foreach(var vertex in vertices)bounds.Encapsulate(vertex);
                float ground=(float)entry["baseHeightMeters"],height=(float)entry["topHeightMeters"];var r=entry["observedBounds"];var target=Rect.MinMaxRect((float)r[0],(float)r[1],(float)r[2],(float)r[3]);
                float scale=(height-ground)/bounds.size.y;
                temporary.transform.position=NewWorldCalibrationBuilder.Unproject(camera,new Vector2(target.center.x,target.yMax),ground)-new Vector3(bounds.center.x,bounds.min.y,bounds.center.z)*scale;temporary.transform.localScale=Vector3.one*scale;
                vertices=filters.SelectMany(f=>f.sharedMesh.vertices.Select(f.transform.TransformPoint)).ToArray();var pixels=vertices.Select(v=>NewWorldCalibrationBuilder.Project(camera,v)).ToArray();
                var actual=Rect.MinMaxRect(pixels.Min(p=>p.x),pixels.Min(p=>p.y),pixels.Max(p=>p.x),pixels.Max(p=>p.y));float bottom=vertices.Min(v=>v.y),top=vertices.Max(v=>v.y);
                var root=new GameObject("Source-corrected "+id+" — observed outer envelope, details under review");int part=0;
                foreach(var filter in filters){
                    var mesh=CorrectMesh(camera,filter.sharedMesh,filter.transform.localToWorldMatrix,actual,target,bottom,top,ground,height);
                    string path=NewWorldCalibrationBuilder.Folder+"/corrected-"+id+"-"+part+++".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                    if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                    var go=new GameObject(filter.name);go.transform.SetParent(root.transform,false);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterials=filter.GetComponent<Renderer>().sharedMaterials;
                }
                UnityEngine.Object.DestroyImmediate(temporary);
                foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name.StartsWith("House "+id+" —",StringComparison.Ordinal)||(id=="H"&&go.name.StartsWith("Hall H —",StringComparison.Ordinal))))foreach(var renderer in go.GetComponentsInChildren<Renderer>())renderer.enabled=false;
                // Same source includes its own roof banners; separate placeholders must not float over them.
                if(id=="H")foreach(var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(go=>go.name=="new-observed-banner-6"||go.name=="new-observed-banner-7"))go.SetActive(false);
                rows.Add(new JObject{["id"]=id,["source"]=model,["observedBounds"]=r.DeepClone(),["inferredBaseHeightMeters"]=ground,["inferredTopHeightMeters"]=height,["policy"]="Source UV and connectivity preserved in derived mesh; projection cage corrects measured outer proportions, interior landmarks still require review; reference-controlled collision retained",["accepted"]=false});
            }
            return rows;
        }
    }
}
