using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
namespace CampMind.Editor
{
    public static class NativeWildernessBuilder
    {
        const string Folder="Assets/CampMind/Content/Ecology";
        static Vector3 V(JToken p)=>new Vector3((float)p[0],(float)p[1],(float)p[2]);
        static void Save(UnityEngine.Object value,string path){var old=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);if(old==null)AssetDatabase.CreateAsset(value,path);else{EditorUtility.CopySerialized(value,old);UnityEngine.Object.DestroyImmediate(value);}}
        public static void Build(JObject data,Transform parent,NativeCampView view)
        {
            Directory.CreateDirectory(Folder);var meshes=new Dictionary<string,Mesh>();var materials=new Dictionary<string,Material>();
            foreach(var property in ((JObject)data["meshes"]).Properties()){
                var d=property.Value;var positions=d["positions"].Select(v=>(float)v).ToArray();var normals=d["normals"].Select(v=>(float)v).ToArray();var uv=d["uv"].Select(v=>(float)v).ToArray();var indices=d["indices"].Select(i=>(int)i).ToArray();
                // Source procedural Three geometry is CCW; Unity fronts are CW.
                for(var i=0;i<indices.Length;i+=3){var swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}
                var mesh=new Mesh{name="Source ecology "+property.Name.Substring(0,12),indexFormat=IndexFormat.UInt32};mesh.vertices=Enumerable.Range(0,positions.Length/3).Select(i=>new Vector3(positions[i*3],positions[i*3+1],positions[i*3+2])).ToArray();
                mesh.normals=Enumerable.Range(0,normals.Length/3).Select(i=>new Vector3(normals[i*3],normals[i*3+1],normals[i*3+2])).ToArray();if(uv.Length>0)mesh.uv=Enumerable.Range(0,uv.Length/2).Select(i=>new Vector2(uv[i*2],uv[i*2+1])).ToArray();mesh.triangles=indices;mesh.RecalculateBounds();
                var path=Folder+"/mesh-"+property.Name+".asset";Save(mesh,path);meshes[property.Name]=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            }
            foreach(var property in ((JObject)data["materials"]).Properties()){
                var d=property.Value;var material=new Material(Shader.Find("Universal Render Pipeline/Lit"));ColorUtility.TryParseHtmlString((string)d["color"],out var color);material.SetColor("_BaseColor",color);material.SetFloat("_Smoothness",1-(float)d["roughness"]);material.SetFloat("_Metallic",(float)d["metalness"]);material.enableInstancing=true;
                var path=Folder+"/material-"+property.Name+".mat";Save(material,path);materials[property.Name]=AssetDatabase.LoadAssetAtPath<Material>(path);
            }
            var root=new GameObject("Wilderness");root.transform.SetParent(parent,false);var presenter=root.AddComponent<NativeWildernessView>();presenter.view=view;var roles=new Dictionary<Transform,string>();
            GameObject Node(JToken d,Transform owner){var g=new GameObject((string)d["name"]);g.transform.SetParent(owner,false);g.transform.localPosition=V(d["position"]);g.transform.localScale=V(d["scale"]);var q=d["rotation"];g.transform.localRotation=new Quaternion((float)q[0],(float)q[1],(float)q[2],(float)q[3]);
                if(d["role"]!=null)roles[g.transform]=(string)d["role"];
                if(d["mesh"]!=null){g.AddComponent<MeshFilter>().sharedMesh=meshes[(string)d["mesh"]];var renderer=g.AddComponent<MeshRenderer>();renderer.sharedMaterial=materials[(string)d["material"]];renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;}
                foreach(var child in d["children"])Node(child,g.transform);return g;
            }
            var resources=new List<ResourceVisual>();var animals=new List<AnimalVisual>();
            foreach(var item in data["resources"]){var g=Node(data["templates"][(string)item["kind"]],root.transform);g.name=(string)item["id"];g.transform.position=new Vector3((float)item["position"]["x"],(float)item["height"],(float)item["position"]["y"]);
                resources.Add(new ResourceVisual{id=g.name,root=g.transform,crop=g.GetComponentsInChildren<Transform>().Single(t=>roles.TryGetValue(t,out var role)&&role=="crop")});}
            foreach(var item in data["animals"]){var g=Node(data["templates"][(string)item["species"]],root.transform);g.name="wildlife-"+(string)item["id"];g.transform.position=new Vector3((float)item["position"]["x"],(float)item["height"],(float)item["position"]["y"]);var parts=g.GetComponentsInChildren<Transform>();
                animals.Add(new AnimalVisual{id=(string)item["id"],root=g.transform,head=parts.Single(t=>roles.TryGetValue(t,out var role)&&role=="head"),legs=parts.Where(t=>roles.TryGetValue(t,out var role)&&role=="leg").ToArray()});g.SetActive(false);}
            presenter.resources=resources.ToArray();presenter.animals=animals.ToArray();
        }
    }
}
