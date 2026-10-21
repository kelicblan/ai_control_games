using System;
using System.IO;
using System.Linq;
using System.Collections;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace CampMind.Editor
{
    [InitializeOnLoad]
    public static class FreeCameraControlAudit
    {
        public static string Output=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../Artifacts/free-camera-controls"));
        static bool runtimeStarted;
        static double nextStatus;
        static FreeCameraControlAudit(){EditorApplication.update+=Poll;}
        static void Poll()
        {
            if(Application.isBatchMode||EditorApplication.isCompiling||EditorApplication.isUpdating||BuildPipeline.isBuildingPlayer)return;
            var request=Path.Combine(Output,"request");if(!File.Exists(request))return;
            string command;try{command=File.ReadAllText(request).Trim();}catch(IOException){return;}
            if(command.StartsWith("runtime-isolated|"))
            {
                if(EditorApplication.isPlaying){EditorApplication.isPlaying=false;return;}
                SessionState.SetString(NativeEditorPlayHost.ControlsDataKey,command.Substring("runtime-isolated|".Length));
                runtimeStarted=false;File.WriteAllText(request,"runtime");EditorApplication.isPlaying=true;return;
            }
            if(command=="restore")
            {
                if(EditorApplication.isPlaying){EditorApplication.isPlaying=false;return;}
                SessionState.EraseString(NativeEditorPlayHost.ControlsDataKey);runtimeStarted=false;File.Delete(request);return;
            }
            if(command=="runtime")
            {
                if(!EditorApplication.isPlaying){EditorApplication.isPlaying=true;return;}
                Application.runInBackground=true;EditorApplication.isPaused=false;EditorApplication.QueuePlayerLoopUpdate();
                var ui=UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>();
                if(EditorApplication.timeSinceStartup>nextStatus){nextStatus=EditorApplication.timeSinceStartup+3;var v=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();File.WriteAllText(Path.Combine(Output,"runtime-status.json"),new JObject{["ui"]=ui!=null,["snapshot"]=ui&&ui.Snapshot!=null,["villageActive"]=ui&&ui.VillageActive,["startupActive"]=NativeStartup.Active,["connected"]=v&&v.Authority!=null&&v.Authority.Connected,["error"]=ui?ui.Error:"no UI"}.ToString());}
                if(!ui||ui.Snapshot==null||runtimeStarted)return;
                runtimeStarted=true;File.Delete(request);ui.gameObject.AddComponent<NativeLordControlProbe>().Begin(Output);return;
            }
            if(command!="camera")return;
            File.Delete(request);try{CheckCameras();}catch(Exception e){File.WriteAllText(Path.Combine(Output,"failure.txt"),e.ToString());}
        }
        public static void CheckCameras()
        {
            Directory.CreateDirectory(Output);var source=UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>();if(!source)throw new InvalidOperationException("Open the authored camp scene first.");
            var go=new GameObject("Free camera verification");
            try
            {
                var camera=go.AddComponent<Camera>();camera.CopyFrom(source.view.viewCamera);camera.enabled=false;
                var view=go.AddComponent<NativeCampView>();view.enabled=false;view.viewCamera=camera;view.lord=source.view.lord;
                var profile=go.AddComponent<NewWorldGameProfile>();JsonUtility.FromJsonOverwrite(JsonUtility.ToJson(source),profile);profile.enabled=false;profile.view=view;
                int checks=0;
                foreach(float aspect in new[]{4f/3,16f/9,21f/9,32f/9})
                {
                    camera.aspect=aspect;view.focus=source.referenceFocus;view.pitch=source.referencePitch;
                    view.yaw=source.referenceYaw;view.zoom=source.referenceZoom;profile.ApplyOverview();var initial=camera.transform.position-view.focus;
                    for(int angle=0;angle<=720;angle+=30)
                    {
                        view.yaw=source.referenceYaw+angle*Mathf.Deg2Rad;profile.ApplyOverview();
                        var expected=Quaternion.Euler(0,-angle,0)*initial;
                        if(Vector3.Distance(expected,camera.transform.position-view.focus)>.03f)throw new InvalidOperationException("God orbit was clamped at "+angle);
                        var pose=NativeCameraProfile.Lord(view.lord.position,angle*Mathf.Deg2Rad,.7f,650);pose.Apply(camera);
                        var repeat=NativeCameraProfile.Lord(view.lord.position,(angle+360)*Mathf.Deg2Rad,.7f,650);
                        if(Vector3.Distance(pose.Position,repeat.Position)>.03f||Vector3.Distance(pose.Position,pose.Target)<640)throw new InvalidOperationException("Lord panorama/orbit was clamped.");
                        checks+=2;
                    }
                    view.yaw=source.referenceYaw;view.zoom=.06f;profile.ApplyOverview();
                    if(view.zoom!=.06f||Vector3.Distance(camera.transform.position,view.focus)<initial.magnitude*2.5f)throw new InvalidOperationException("God panorama was zoomed back in.");
                    view.lordView=true;view.lordDistance=650;view.lordPitch=.9f;view.UpdateCamera();
                    if(Vector3.Distance(camera.transform.position,view.lord.position)<500)throw new InvalidOperationException("Lord panorama was pulled toward foreground obstacles.");
                }
                var field=new GameObject("Closed text input",typeof(RectTransform),typeof(InputField));field.SetActive(false);
                try{if(NativeGameUi.BlocksWorldInput(false,field))throw new InvalidOperationException("Inactive text input blocks movement.");}finally{UnityEngine.Object.DestroyImmediate(field);}
                File.Delete(Path.Combine(Output,"failure.txt"));File.WriteAllText(Path.Combine(Output,"camera-validation.json"),new JObject{["orbitChecks"]=checks,["full360BothViews"]=true,["panoramaBothViews"]=true,["inactiveInputDoesNotBlock"]=true}.ToString());
                view.lordView=false;view.focus=source.referenceFocus;view.zoom=.06f;view.pitch=.95f;view.yaw=source.referenceYaw;profile.ApplyOverview();
                camera.aspect=16f/9;Capture(camera,"god-panorama.png");
                view.lordView=true;view.lordDistance=650;view.lordPitch=.9f;view.UpdateCamera();Capture(camera,"lord-panorama.png");
            }
            finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        static void Capture(Camera camera,string file)
        {
            var rt=new RenderTexture(1600,900,24);var pixels=new Texture2D(1600,900,TextureFormat.RGB24,false);var previous=RenderTexture.active;
            try{rt.Create();camera.targetTexture=rt;if(UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline==null)camera.Render();else UnityEngine.Rendering.RenderPipeline.SubmitRenderRequest(camera,new UnityEngine.Rendering.RenderPipeline.StandardRequest{destination=rt});RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1600,900),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(Output,file),pixels.EncodeToPNG());}
            finally{camera.targetTexture=null;RenderTexture.active=previous;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(pixels);}
        }
    }
}
