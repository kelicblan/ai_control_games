using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEditor;
using CampMind.Presentation;

namespace CampMind.Editor
{
    [InitializeOnLoad]
    public static class BridgeRiverAudit
    {
        public static string Output=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../Artifacts/bridge-river"));
        static BridgeRiverAudit(){EditorApplication.update+=Poll;}
        static void Poll()
        {
            var request=Path.Combine(Output,"audit.request");
            if(!File.Exists(request)||EditorApplication.isCompiling||EditorApplication.isUpdating)return;
            File.Delete(request);try{Run();}catch(Exception e){File.WriteAllText(Path.Combine(Output,"failure.txt"),e.ToString());}
        }
        public static readonly Vector3 Inside=new Vector3(-20.0373554f,.5375143f,-57.9547272f),Outside=new Vector3(-39.374176f,.2094273f,-73.21243f);
        public static void Run()
        {
            Directory.CreateDirectory(Output);Physics.SyncTransforms();
            if(!UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>())UnityEditor.SceneManagement.EditorSceneManager.OpenScene("Assets/CampMind/NewWorldGame/Camp.unity");
            var view=UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>().view;
            var objects=new JArray();
            foreach(var f in UnityEngine.Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None).Where(f=>f.gameObject.activeInHierarchy&&f.sharedMesh))
            {
                var r=f.GetComponent<Renderer>();if(!r)continue;
                if(!(f.name.ToLowerInvariant().Contains("river")||f.name.ToLowerInvariant().Contains("shore")||r.bounds.Intersects(new Bounds((Inside+Outside)*.5f,new Vector3(28,10,24)))))continue;
                objects.Add(new JObject{["name"]=f.name,["enabled"]=r.enabled,["mesh"]=AssetDatabase.GetAssetPath(f.sharedMesh),["layer"]=f.gameObject.layer,["bounds"]=r.bounds.ToString(),["position"]=f.transform.position.ToString(),["rotation"]=f.transform.eulerAngles.ToString(),["collider"]=f.GetComponent<Collider>()!=null,["materials"]=new JArray(r.sharedMaterials.Where(m=>m).Select(m=>m.name+" | "+m.shader.name))});
            }
            var samples=new JArray();var axis=(Outside-Inside);axis.y=0;float length=axis.magnitude;axis.Normalize();
            for(float s=-4;s<=length+4;s+=.25f)
            {
                var p=Inside+axis*s;var hits=Physics.RaycastAll(p+Vector3.up*30,Vector3.down,60,(1<<8)|(1<<9)).OrderByDescending(h=>h.point.y);
                samples.Add(new JObject{["s"]=s,["surfaces"]=new JArray(hits.Select(h=>new JObject{["name"]=h.collider.name,["layer"]=h.collider.gameObject.layer,["height"]=h.point.y,["normalY"]=h.normal.y}))});
            }
            File.WriteAllText(Path.Combine(Output,"audit.json"),new JObject{["objects"]=objects,["centerline"]=samples}.ToString());
            if(UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None).Any(t=>t.name=="桥头与自然河岸修复"))Validate();
            Capture(view.viewCamera,Inside+new Vector3(9,16,14),(Inside+Outside)*.5f,"bridge-before.png");
            Capture(view.viewCamera,(Inside+Outside)*.5f+Vector3.up*32,(Inside+Outside)*.5f,"bridge-top-before.png");
        }
        public static void Validate()
        {
            int checks=0;var axis=Vector3.ProjectOnPlane(Outside-Inside,Vector3.up).normalized;var side=Vector3.Cross(Vector3.up,axis);float length=Vector3.ProjectOnPlane(Outside-Inside,Vector3.up).magnitude;
            foreach(float lane in new[]{-.75f,0,.75f}){float previous=float.NaN;for(float s=-2;s<=length+2;s+=.25f){var p=Inside+axis*s+side*lane;if(!Physics.Raycast(p+Vector3.up*30,Vector3.down,out var h,60,1<<9))throw new InvalidOperationException("Physical bridge hole at "+p);if(float.IsFinite(previous)&&Mathf.Abs(h.point.y-previous)>.45f)throw new InvalidOperationException("Physical bridge ledge at "+p);if(Physics.CheckCapsule(h.point+Vector3.up*.36f,h.point+Vector3.up*1.5f,.28f,1<<8))throw new InvalidOperationException("Physical bridge obstruction at "+p);previous=h.point.y;checks++;}}
            var water=UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None).First(r=>r.name=="Clear shallow river surface").sharedMaterial;
            if(water.GetColor("_BaseColor").a>.4f||water.GetTag("RenderType",false)!="Transparent")throw new InvalidOperationException("Water is not translucent.");
            foreach(var shader in new[]{water.shader,Shader.Find("CampMind/River Ground")})if(ShaderUtil.GetShaderMessages(shader).Any(m=>m.severity.ToString()=="Error"))throw new InvalidOperationException("River shader compilation failed.");
            File.Delete(Path.Combine(Output,"failure.txt"));File.WriteAllText(Path.Combine(Output,"validation.json"),new JObject{["physicalBridgeSamples"]=checks,["bridgeClearanceVerified"]=true,["waterTransparent"]=true,["waterAlpha"]=water.GetColor("_BaseColor").a,["shadersCompiled"]=true}.ToString());
        }
        public static void Capture(Camera source,Vector3 position,Vector3 target,string file)
        {
            var go=new GameObject("Bridge river audit camera");var camera=go.AddComponent<Camera>();camera.CopyFrom(source);camera.enabled=false;camera.transform.position=position;camera.transform.LookAt(target,Mathf.Abs(Vector3.Dot((target-position).normalized,Vector3.up))>.99f?Vector3.forward:Vector3.up);camera.fieldOfView=55;camera.orthographic=false;camera.aspect=1.4f;
            var rt=new RenderTexture(1400,1000,24);var pixels=new Texture2D(1400,1000,TextureFormat.RGB24,false);var previous=RenderTexture.active;
            try{rt.Create();camera.targetTexture=rt;if(UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline==null)camera.Render();else UnityEngine.Rendering.RenderPipeline.SubmitRenderRequest(camera,new UnityEngine.Rendering.RenderPipeline.StandardRequest{destination=rt});RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1400,1000),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(Output,file),pixels.EncodeToPNG());}
            finally{RenderTexture.active=previous;camera.targetTexture=null;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(pixels);UnityEngine.Object.DestroyImmediate(go);}
        }
    }
}
