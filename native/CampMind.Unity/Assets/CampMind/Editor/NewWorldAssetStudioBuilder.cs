using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using CampMind.Presentation;

namespace CampMind.Editor
{
    public static class NewWorldAssetStudioBuilder
    {
        public static JObject Build(NewWorldCalibrationView view,bool withStage3=false)
        {
            const string folder=NewWorldCalibrationBuilder.Folder+"/Models/stage2";
            var manifest=JObject.Parse(File.ReadAllText(folder+"/sources.json"));var rows=new JArray(manifest["sources"].Select(row=>row.DeepClone()));
            if(rows.Count!=6)throw new InvalidOperationException("Only the complete approved six-asset batch may enter the studio");
            JObject manifest3=null;
            if(withStage3){manifest3=JObject.Parse(File.ReadAllText(NewWorldCalibrationBuilder.Folder+"/Models/stage3/sources.json"));var extra=(JArray)manifest3["sources"];if(extra.Count!=4)throw new InvalidOperationException("Stage3 requires exactly the approved four results");foreach(var row in extra)rows.Add(row.DeepClone());}
            var terrainManifest=NewWorldCalibrationBuilder.Folder+"/Models/terrain/sources.json";if(withStage3&&File.Exists(terrainManifest)){var terrain=JObject.Parse(File.ReadAllText(terrainManifest));foreach(var row in terrain["sources"])rows.Add(row.DeepClone());}
            int count=rows.Count;var centers=new Vector3[count];var radii=new float[count];var ids=new string[count];var objects=new GameObject[count];var baseYaw=new float[count];
            for(int i=0;i<rows.Count;i++){
                var id=(string)rows[i]["id"];ids[i]=id;var sourceFolder=id=="terrain-base"?NewWorldCalibrationBuilder.Folder+"/Models/terrain":i<6?folder:NewWorldCalibrationBuilder.Folder+"/Models/stage3";var source=AssetDatabase.LoadAssetAtPath<GameObject>(sourceFolder+"/"+id+".glb");if(!source)throw new FileNotFoundException("Missing approved source",id);
                var root=new GameObject("ASSET STUDIO ONLY — "+id);var instance=UnityEngine.Object.Instantiate(source,root.transform);var renderers=instance.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new InvalidOperationException("Empty studio source");
                var bounds=renderers[0].bounds;foreach(var renderer in renderers)bounds.Encapsulate(renderer.bounds);var height=10f;var scale=height/bounds.size.y;
                instance.transform.localScale=Vector3.one*scale;instance.transform.localPosition=-new Vector3(bounds.center.x,bounds.min.y,bounds.center.z)*scale;
                root.transform.position=new Vector3(1500+i*150,0,0);centers[i]=root.transform.position+Vector3.up*height*.5f;radii[i]=bounds.size.magnitude*scale*.5f;
                foreach(var child in root.GetComponentsInChildren<Transform>())child.gameObject.layer=2;objects[i]=root;baseYaw[i]=id=="watchtower"?0:90;root.SetActive(false);
            }
            view.studioIds=ids;view.studioCenters=centers;view.studioRadii=radii;view.studioObjects=objects;view.studioBaseYaw=baseYaw;
            return new JObject{["purpose"]="Isolated four-side source inspection, not map placement or accepted scale",["sourceManifest"]=manifest,["stage3SourceManifest"]=manifest3,["keys"]=withStage3?"F1 map, F2–F11 approved sources":"F1 map, F2–F7 approved sources",["count"]=count,["accepted"]=false};
        }
    }
}
