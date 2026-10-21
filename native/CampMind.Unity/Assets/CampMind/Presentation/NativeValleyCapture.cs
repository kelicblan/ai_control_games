using System;
using System.Collections;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace CampMind.Presentation
{
    // Captures the real Camp scene while attached to its TS authority. No alternate terrain.
    [DefaultExecutionOrder(200)]
    public sealed class NativeValleyCapture : MonoBehaviour
    {
        private NativeCampView view;
        private int shot=-1;
        private readonly string[] names={"overview","manor","dwelling","gate","watchtower","riverbank"};
        // Logical X/Z and absolute authored height; Unity reflection is applied exactly once.
        private readonly Vector3[] eyes={new Vector3(-240,200,475),new Vector3(-20,64,65),new Vector3(-110,37,53),new Vector3(-15,43,310),new Vector3(-30,48,260),new Vector3(-60,85,360)};
        private readonly Vector3[] targets={new Vector3(50,25,55),new Vector3(50,43,-45),new Vector3(-68,24,-5),new Vector3(50,25,205),new Vector3(24,29,199),new Vector3(-120,3,200)};
        public void Begin(NativeCampView owner,string directory){view=owner;view.InputBlocked=true;StartCoroutine(Capture(Path.GetFullPath(directory)));}
        private void LateUpdate()
        {
            if(shot<0||view==null)return;
            var e=eyes[shot];var t=targets[shot];var camera=view.viewCamera;
            camera.orthographic=false;camera.fieldOfView=shot==0?49:52;camera.nearClipPlane=.2f;camera.farClipPlane=4000;
            camera.transform.position=view.Space.ToUnity(new Vector2(e.x,e.z),e.y);camera.transform.LookAt(view.Space.ToUnity(new Vector2(t.x,t.z),t.y));
        }
        private IEnumerator Capture(string directory)
        {
            Directory.CreateDirectory(directory);var deadline=Time.realtimeSinceStartup+45;
            while((view.Authority==null||!view.Authority.ReadyForActions)&&Time.realtimeSinceStartup<deadline)yield return null;
            if(view.Authority==null||!view.Authority.ReadyForActions){Fail(directory,"World authority not ready");yield break;}
            if(view.World==null)view.Authority.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17}});
            while(view.World==null&&Time.realtimeSinceStartup<deadline)yield return null;
            if(view.World==null){Fail(directory,"No authoritative world");yield break;}
            view.Authority.Enqueue(new JObject{["type"]="agency-settings",["enabled"]=true,["cognition"]=false,["modelId"]=(string)view.World["agency"]?["modelId"]??"minimind3"});
            view.SendCommand("weather",new JObject{["weather"]="clear"});
            view.Authority.Enqueue(new JObject{["type"]="pause",["paused"]=true});
            deadline=Time.realtimeSinceStartup+15;
            while(((string)view.World["status"]!="paused"||(string)view.World["weather"]!="clear")&&Time.realtimeSinceStartup<deadline)yield return null;
            if((string)view.World["status"]!="paused"||(string)view.World["weather"]!="clear"){Fail(directory,"Capture state was not acknowledged");yield break;}
            view.lordView=false;var cameras=new JArray();
            for(shot=0;shot<names.Length;shot++){
                yield return new WaitForSecondsRealtime(.8f);yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(Path.Combine(directory,names[shot]+".png"));
                var p=view.viewCamera.transform.position;cameras.Add(new JObject{["name"]=names[shot],["position"]=JArray.FromObject(new[]{p.x,p.y,p.z}),["fov"]=view.viewCamera.fieldOfView});
            }
            shot=-1;yield return new WaitForSecondsRealtime(1);
            var result=new JObject{["success"]=view.Authority.Connected,["authority"]="typescript",["scope"]=view.Authority.gate.Scope,["revision"]=view.Authority.gate.Revision,["terrainRevision"]=6,["characters"]=view.characters.Length,["cameras"]=cameras,["visualAccepted"]=false};
            File.WriteAllText(Path.Combine(directory,"valley-result.json"),result.ToString());Application.Quit((bool)result["success"]?0:1);
        }
        private static void Fail(string directory,string error){File.WriteAllText(Path.Combine(directory,"valley-result.json"),new JObject{["success"]=false,["error"]=error}.ToString());Application.Quit(1);}
    }
}
