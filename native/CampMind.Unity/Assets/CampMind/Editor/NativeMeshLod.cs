using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NativeMeshLod
    {
        const string Output="Assets/CampMind/Content/Lod";
        static readonly Dictionary<string,Mesh> Cache=new Dictionary<string,Mesh>();
        static JObject indices;
        public static string Fingerprint(Mesh mesh,int submesh)
        {
            using(var bytes=new MemoryStream())using(var writer=new BinaryWriter(bytes))using(var hash=SHA256.Create()){
                foreach(var p in mesh.vertices){writer.Write(p.x);writer.Write(p.y);writer.Write(p.z);}
                foreach(var index in mesh.GetTriangles(submesh))writer.Write(index);
                writer.Flush();return BitConverter.ToString(hash.ComputeHash(bytes.ToArray())).Replace("-","").ToLowerInvariant();
            }
        }
        public static void Export()
        {
            var args=Environment.GetCommandLineArgs();var at=Array.IndexOf(args,"-campmind-lod-input");
            if(at<0||at+1>=args.Length)throw new ArgumentException("Missing LOD export path");
            var destination=Path.GetFullPath(args[at+1]);var allowed=Path.GetFullPath("../Artifacts")+Path.DirectorySeparatorChar;
            if(!destination.StartsWith(allowed,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("LOD export must stay under Artifacts");
            var entries=new JArray();
            foreach(var kind in new[]{"pine","broadleaf","bush","grass","rock"}){
                var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/CampMind/Content/Models/valley/"+kind+".glb");
                if(prefab==null)throw new InvalidOperationException("Missing source "+kind);
                foreach(var mesh in prefab.GetComponentsInChildren<MeshFilter>().Select(f=>f.sharedMesh).Distinct())
                    for(var s=0;s<mesh.subMeshCount;s++)entries.Add(new JObject{
                        ["id"]=kind+"|"+mesh.name+"|"+s,["positions"]=new JArray(mesh.vertices.SelectMany(p=>new[]{p.x,p.y,p.z})),
                        ["indices"]=new JArray(mesh.GetTriangles(s)),["ratio"]=.5,["sourceMeshHash"]=Fingerprint(mesh,s)});
            }
            Directory.CreateDirectory(Path.GetDirectoryName(destination));File.WriteAllText(destination,new JObject{["version"]=1,["unityVersion"]=Application.unityVersion,["meshes"]=entries}.ToString(Newtonsoft.Json.Formatting.None));
        }
        public static void Reset(){Cache.Clear();indices=null;}
        public static void Attach(GameObject root,string kind)
        {
            if(indices==null){indices=JObject.Parse(File.ReadAllText(Output+"/indices.json"));if((int)indices["version"]!=1||(string)indices["unityVersion"]!=Application.unityVersion)throw new InvalidOperationException("Regenerate foliage LOD for this Editor");}
            var high=root.GetComponentsInChildren<Renderer>();
            var low=UnityEngine.Object.Instantiate(root);low.name="Distant geometry";low.transform.SetParent(root.transform,false);low.transform.localPosition=Vector3.zero;low.transform.localRotation=Quaternion.identity;low.transform.localScale=Vector3.one;
            foreach(var filter in low.GetComponentsInChildren<MeshFilter>()){
                var source=filter.sharedMesh;var key=kind+"|"+source.name;
                if(!Cache.TryGetValue(key,out var derivative)){
                    derivative=UnityEngine.Object.Instantiate(source);derivative.name=source.name+" distant";
                    for(var s=0;s<source.subMeshCount;s++){
                        var id=key+"|"+s;var entry=indices["meshes"].FirstOrDefault(e=>(string)e["id"]==id);
                        if(entry==null||(string)entry["sourceMeshHash"]!=Fingerprint(source,s))throw new InvalidOperationException("Stale foliage LOD: "+id);
                        var triangles=entry["indices"].Select(i=>(int)i).ToArray();if(triangles.Length<3||triangles.Length%3!=0||triangles.Any(i=>i<0||i>=source.vertexCount))throw new InvalidOperationException("Invalid foliage indices: "+id);
                        derivative.SetTriangles(triangles,s,false);
                    }
                    derivative.RecalculateBounds();var path=Output+"/"+kind+"-"+Fingerprint(source,0).Substring(0,16)+".asset";
                    var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old==null)AssetDatabase.CreateAsset(derivative,path);else{EditorUtility.CopySerialized(derivative,old);UnityEngine.Object.DestroyImmediate(derivative);}derivative=AssetDatabase.LoadAssetAtPath<Mesh>(path);Cache.Add(key,derivative);
                }
                filter.sharedMesh=derivative;
            }
            var lod=root.AddComponent<LODGroup>();lod.SetLODs(new[]{new LOD(.12f,high),new LOD(kind=="pine"||kind=="broadleaf"?.01f:.002f,low.GetComponentsInChildren<Renderer>())});lod.RecalculateBounds();
        }
    }
}
