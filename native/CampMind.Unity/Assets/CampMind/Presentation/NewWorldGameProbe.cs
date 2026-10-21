using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using System.Collections.Generic;
namespace CampMind.Presentation
{
    public sealed class NewWorldGameProbe:MonoBehaviour
    {
        NewWorldGameProfile profile;NativeCampView view;string output;bool pointerVerified;float keyboardMotion;
        public void Begin(NewWorldGameProfile target,string directory){profile=target;view=target.view;view.ExternalInputDriver=true;InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;foreach(var device in InputSystem.devices.OfType<Keyboard>().ToArray())InputSystem.DisableDevice(device);output=Path.GetFullPath(directory);Directory.CreateDirectory(output);StartCoroutine(Run());}
        IEnumerator Run()
        {
            float deadline=Time.realtimeSinceStartup+60;while((view.Authority==null||!view.Authority.ReadyForActions||NativeStartup.Active)&&Time.realtimeSinceStartup<deadline)yield return null;
            if(view.Authority==null||!view.Authority.ReadyForActions){Finish(false,"authority unavailable",0);yield break;}
            yield return new WaitForSecondsRealtime(.8f);
            var ui=view.GetComponent<NativeGameUi>();
            var begin=ui?.Canvas.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.name=="确认开始新旅程");
            if(begin){
                if(EventSystem.current==null||!EventSystem.current.isActiveAndEnabled){Finish(false,"Startup left the game without an active EventSystem",0);yield break;}
                Canvas.ForceUpdateCanvases();yield return new WaitForEndOfFrame();var rect=(RectTransform)begin.transform;var point=RectTransformUtility.WorldToScreenPoint(null,rect.TransformPoint(rect.rect.center));var data=new PointerEventData(EventSystem.current){position=point,button=PointerEventData.InputButton.Left};var hits=new List<RaycastResult>();EventSystem.current.RaycastAll(data,hits);
                if(hits.Count==0||hits[0].gameObject.GetComponentInParent<Button>()!=begin){File.WriteAllText(Path.Combine(output,"journey-raycast.json"),new JObject{["point"]=new JArray(point.x,point.y),["button"]=begin.name,["hits"]=new JArray(hits.Select(h=>h.gameObject.name+" parent="+h.gameObject.transform.parent?.name)),["width"]=Screen.width,["height"]=Screen.height}.ToString());ScreenCapture.CaptureScreenshot(Path.Combine(output,"journey-blocked.png"));yield return new WaitForSecondsRealtime(.5f);Finish(false,"Journey button is blocked in the real UI raycast",0);yield break;}
                ExecuteEvents.ExecuteHierarchy(hits[0].gameObject,data,ExecuteEvents.pointerClickHandler);yield return null;pointerVerified=true;
            }
            else if(view.World==null)view.Authority.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17,["mode"]="rules"}});
            deadline=Time.realtimeSinceStartup+20;while((view.World==null||view.InputBlocked)&&Time.realtimeSinceStartup<deadline)yield return null;
            if(view.World==null||view.InputBlocked){Finish(false,"Pointer click did not enter the village",0);yield break;}
            if((string)view.World["status"]!="playing"){view.Authority.Enqueue(new JObject{["type"]="pause",["paused"]=false});yield return new WaitForSecondsRealtime(.5f);}
            var args=Environment.GetCommandLineArgs();int soakIndex=Array.IndexOf(args,"-campmind-world-soak");
            if(Array.IndexOf(args,"-campmind-actor-motion-probe")>=0){yield return ActorMotion();yield break;}
            if(soakIndex>=0&&soakIndex+1<args.Length){
                float duration=float.Parse(args[soakIndex+1],System.Globalization.CultureInfo.InvariantCulture);var samples=new JArray();float end=Time.realtimeSinceStartup+duration;int count=0;
                while(Time.realtimeSinceStartup<end){samples.Add(new JObject{["at"]=Time.realtimeSinceStartup,["connected"]=view.Authority.Connected,["ready"]=view.Authority.ReadyForActions,["error"]=view.Authority.Error,["elapsed"]=view.World?["elapsed"]?.DeepClone()});File.WriteAllText(Path.Combine(output,"connection-soak.json"),samples.ToString());if(!view.Authority.Connected){Finish(false,"World disconnected during soak: "+view.Authority.Error,0);yield break;}if(count++%10==0)view.SendCommand("assign",new JObject{["npcId"]="azhuang",["action"]="wood"});yield return new WaitForSecondsRealtime(1);}
            }
            if(Array.IndexOf(args,"-campmind-gate-probe")>=0){yield return GateWalk();yield break;}
            if(Array.IndexOf(args,"-campmind-stair-probe")>=0){yield return StairWalk();yield break;}
            view.lordView=true;view.ExternalInputDriver=false;view.SendMessage("OnApplicationFocus",true);
            var keyboardStart=view.lord.position;var keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);keyboard.MakeCurrent();
            foreach(var key in new[]{Key.W,Key.A,Key.S,Key.D}){InputSystem.QueueStateEvent(keyboard,new KeyboardState(key));yield return new WaitForSecondsRealtime(.7f);InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return new WaitForSecondsRealtime(.25f);if(Vector3.Distance(keyboardStart,view.lord.position)>1)break;}
            keyboardMotion=Vector3.Distance(keyboardStart,view.lord.position);InputSystem.RemoveDevice(keyboard);view.ExternalInputDriver=true;
            if(keyboardMotion<=1){Finish(false,"Keyboard did not move the player through NativeCampView",keyboardMotion);yield break;}
            var before=view.lord.position;
            foreach(var direction in new[]{Vector2.up,Vector2.right,Vector2.down,Vector2.left}){
                for(int i=0;i<12;i++){view.Authority.SendMotion(direction);yield return new WaitForSecondsRealtime(.1f);}view.Authority.ReleaseMotion();yield return new WaitForSecondsRealtime(.3f);
                if(Vector3.Distance(before,view.lord.position)>1)break;
            }
            var moved=Vector3.Distance(before,view.lord.position);view.lordView=false;view.focus=profile.referenceFocus;view.yaw=profile.referenceYaw;view.pitch=profile.referencePitch;view.zoom=profile.referenceZoom;
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"game-overview.png"));yield return new WaitForSecondsRealtime(.5f);
            view.lordView=true;view.lordDistance=8;yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"game-walking.png"));yield return new WaitForSecondsRealtime(.5f);
            Finish(moved>1&&view.characters.Length==10,"",moved);
        }
        IEnumerator ActorMotion()
        {
            var samples=new JArray();var previous=view.characters.ToDictionary(a=>a,a=>a.position);float distance=0,maxAngle=0,maxGap=0;int movingSamples=0,missingContacts=0;view.lordView=true;
            var directions=new[]{Vector2.up,Vector2.down,Vector2.right,Vector2.left,new Vector2(1,1).normalized,new Vector2(-1,-1).normalized,new Vector2(1,-1).normalized,new Vector2(-1,1).normalized};
            for(int directionIndex=0;directionIndex<directions.Length;directionIndex++)
            {
                var direction=directions[directionIndex];float until=Time.realtimeSinceStartup+1.5f,nextSend=0;bool captured=false;
                while(Time.realtimeSinceStartup<until)
                {
                    if(Time.realtimeSinceStartup>=nextSend){view.Authority.SendMotion(direction);nextSend=Time.realtimeSinceStartup+.1f;}
                    yield return new WaitForEndOfFrame();
                    foreach(var actor in view.characters)
                    {
                        var delta=Vector3.ProjectOnPlane(actor.position-previous[actor],Vector3.up);previous[actor]=actor.position;
                        if(delta.sqrMagnitude<.000004f)continue;
                        var animator=actor.GetComponentInChildren<Animator>();var front=Vector3.ProjectOnPlane(animator.transform.TransformVector(Vector3.left),Vector3.up);
                        var angle=Vector3.Angle(front,delta);var sole=view.ActorSole(actor);
                        var supported=Physics.Raycast(sole+Vector3.up*.08f,Vector3.down,out var hit,.16f,(1<<8)|(1<<9),QueryTriggerInteraction.Ignore);
                        var gap=supported?Mathf.Abs(sole.y-hit.point.y):1;maxAngle=Mathf.Max(maxAngle,angle);maxGap=Mathf.Max(maxGap,gap);if(!supported)missingContacts++;movingSamples++;
                        if(actor==view.lord){distance+=delta.magnitude;if(!captured&&Time.realtimeSinceStartup>until-.7f){CaptureMovingFace(actor,delta.normalized,Path.Combine(output,"walking-direction-"+directionIndex+".png"));captured=true;}}
                        samples.Add(new JObject{["actor"]=actor.name,["direction"]=directionIndex,["angleDegrees"]=angle,["soleGap"]=gap,["supported"]=supported,["sole"]=new JArray(sole.x,sole.y,sole.z),["root"]=new JArray(actor.position.x,actor.position.y,actor.position.z),["normalY"]=supported?hit.normal.y:0,["surface"]=supported?hit.collider.name:"none",["time"]=Time.realtimeSinceStartup});
                    }
                }
                view.Authority.ReleaseMotion();yield return new WaitForSecondsRealtime(.25f);
                foreach(var actor in view.characters)previous[actor]=actor.position;
            }
            var pass=movingSamples>50&&distance>1&&maxAngle<1&&maxGap<.01f&&missingContacts==0;
            File.WriteAllText(Path.Combine(output,"actor-motion.json"),new JObject{["success"]=pass,["movingSamples"]=movingSamples,["maxFacingErrorDegrees"]=maxAngle,["maxSoleGapMeters"]=maxGap,["missingContacts"]=missingContacts,["lordDistance"]=distance,["samples"]=samples}.ToString());
            Finish(pass,pass?"":"Animated face/contact audit failed; see actor-motion.json",distance);
        }
        void CaptureMovingFace(Transform actor,Vector3 direction,string path)
        {
            var camera=view.viewCamera;var position=camera.transform.position;var rotation=camera.transform.rotation;var fov=camera.fieldOfView;var rt=new RenderTexture(1280,720,24);var pixels=new Texture2D(1280,720,TextureFormat.RGB24,false);
            camera.transform.position=actor.position+direction*4+Vector3.Cross(Vector3.up,direction)*1.5f+Vector3.up*2.1f;camera.transform.LookAt(actor.position+Vector3.up*.85f);camera.fieldOfView=38;camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;
            pixels.ReadPixels(new Rect(0,0,1280,720),0,0);pixels.Apply();File.WriteAllBytes(path,pixels.EncodeToPNG());RenderTexture.active=null;camera.targetTexture=null;camera.transform.SetPositionAndRotation(position,rotation);camera.fieldOfView=fov;Destroy(pixels);Destroy(rt);
        }
        IEnumerator StairWalk()
        {
            var route=JObject.Parse(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"stair-probe-route.json")));var samples=new JArray();var initial=view.lord.position;
            view.lordView=true;view.lordDistance=14;view.lordPitch=45;
            var bottom=new Vector2((float)route["bottom"]["x"],(float)route["bottom"]["y"]);bool startedAtStairs=Vector2.Distance(view.Space.ToLogical(initial),bottom)<1;var approach=startedAtStairs?new JArray():route["approachRoute"];
            foreach(var point in approach){var goal=new Vector2((float)point["x"],(float)point["y"]);float deadline=Time.realtimeSinceStartup+25;while(Time.realtimeSinceStartup<deadline){var logical=view.Space.ToLogical(view.lord.position);var d=goal-logical;if(d.magnitude<.3f)break;view.Authority.SendMotion(Vector2.ClampMagnitude(d*.35f,.65f));yield return new WaitForSecondsRealtime(.1f);}view.Authority.ReleaseMotion();if(Vector2.Distance(view.Space.ToLogical(view.lord.position),goal)>.6f){Finish(false,"Stair approach route blocked at "+view.Space.ToLogical(view.lord.position)+" toward "+goal,Vector3.Distance(initial,view.lord.position));yield break;}}
            yield return new WaitForSecondsRealtime(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(output,"stairs-bottom.png"));yield return new WaitForSecondsRealtime(.5f);
            var start=view.lord.position;float startSole=view.ActorSole(view.lord).y;var target=new Vector2((float)route["top"]["x"],(float)route["top"]["y"]);var delta=target-view.Space.ToLogical(start);view.lordYaw=Mathf.Atan2(-delta.x,-delta.y);view.ExternalInputDriver=false;view.SendMessage("OnApplicationFocus",true);var keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);keyboard.MakeCurrent();InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));float until=Time.realtimeSinceStartup+25;bool middle=false;
            while(Time.realtimeSinceStartup<until&&Vector2.Distance(view.Space.ToLogical(view.lord.position),target)>1.4f){view.SendMessage("OnApplicationFocus",true);keyboard.MakeCurrent();InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));samples.Add(new JObject{["time"]=Time.realtimeSinceStartup,["x"]=view.lord.position.x,["height"]=view.lord.position.y,["soleHeight"]=view.ActorSole(view.lord).y,["z"]=view.lord.position.z,["connected"]=view.Authority.Connected});if(!middle&&view.lord.position.y>7){ScreenCapture.CaptureScreenshot(Path.Combine(output,"stairs-middle.png"));middle=true;}yield return new WaitForSecondsRealtime(.1f);}
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;InputSystem.RemoveDevice(keyboard);view.ExternalInputDriver=true;view.Authority.ReleaseMotion();yield return new WaitForSecondsRealtime(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(output,"stairs-top.png"));yield return new WaitForSecondsRealtime(.5f);
            keyboardMotion=Vector3.Distance(start,view.lord.position);var axis=(target-bottom).normalized;var offset=view.Space.ToLogical(view.lord.position)-target;float forward=Vector2.Dot(offset,axis),lateral=Mathf.Abs(Vector2.Dot(offset,new Vector2(-axis.y,axis.x)));float expected=(float?)route["expectedRise"]??8.5f;bool pass=forward>=-1&&forward<=3&&lateral<2.9f&&view.ActorSole(view.lord).y-startSole>=expected-.4f;File.WriteAllText(Path.Combine(output,"stair-walk.json"),new JObject{["success"]=pass,["keyboard"]="W through NativeCampView",["startedAtStairs"]=startedAtStairs,["heightGain"]=view.ActorSole(view.lord).y-startSole,["heightMetric"]="grounded animated foot",["expectedRise"]=expected,["samples"]=samples,["positionError"]=Vector2.Distance(view.Space.ToLogical(view.lord.position),target),["porchDepth"]=forward,["lateralError"]=lateral}.ToString());Finish(pass,pass?"":"Stair keyboard climb did not reach platform edge",keyboardMotion);
        }
        IEnumerator GateWalk()
        {
            var route=JObject.Parse(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"gate-probe-route.json")));view.lordView=true;view.lordDistance=14;var initial=view.lord.position;var samples=new JArray();
            if(!view.GateOpen){view.SendCommand("gate-toggle",new JObject());yield return new WaitForSecondsRealtime(.6f);}
            foreach(var point in route["approachRoute"]){var target=new Vector2((float)point["x"],(float)point["y"]);float deadline=Time.realtimeSinceStartup+25;while(Time.realtimeSinceStartup<deadline){var d=target-view.Space.ToLogical(view.lord.position);if(d.magnitude<.3f)break;view.Authority.SendMotion(Vector2.ClampMagnitude(d*.35f,.65f));yield return new WaitForSecondsRealtime(.1f);}view.Authority.ReleaseMotion();if(Vector2.Distance(view.Space.ToLogical(view.lord.position),target)>.7f){Finish(false,"Gate approach blocked",Vector3.Distance(initial,view.lord.position));yield break;}}
            yield return new WaitForSecondsRealtime(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(output,"gate-inside.png"));yield return new WaitForSecondsRealtime(.5f);var start=view.lord.position;int index=0;
            foreach(var point in route["gateRoute"].Skip(1)){var target=new Vector2((float)point["x"],(float)point["y"]);var d=target-view.Space.ToLogical(view.lord.position);view.lordYaw=Mathf.Atan2(-d.x,-d.y);view.ExternalInputDriver=false;view.SendMessage("OnApplicationFocus",true);var keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);keyboard.MakeCurrent();InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));float deadline=Time.realtimeSinceStartup+15;while(Time.realtimeSinceStartup<deadline&&Vector2.Distance(view.Space.ToLogical(view.lord.position),target)>3f){view.SendMessage("OnApplicationFocus",true);keyboard.MakeCurrent();InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));samples.Add(new JObject{["x"]=view.lord.position.x,["height"]=view.lord.position.y,["z"]=view.lord.position.z,["connected"]=view.Authority.Connected});yield return new WaitForSecondsRealtime(.1f);}InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;InputSystem.RemoveDevice(keyboard);view.ExternalInputDriver=true;view.Authority.ReleaseMotion();yield return new WaitForSecondsRealtime(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(output,"gate-exit-"+index+++".png"));yield return new WaitForSecondsRealtime(.5f);if(Vector2.Distance(view.Space.ToLogical(view.lord.position),target)>2.5f){Finish(false,"Gate/bridge keyboard movement blocked",Vector3.Distance(start,view.lord.position));yield break;}}
            keyboardMotion=Vector3.Distance(start,view.lord.position);bool pass=keyboardMotion>20&&view.Authority.Connected;File.WriteAllText(Path.Combine(output,"gate-walk.json"),new JObject{["success"]=pass,["keyboard"]="W through NativeCampView",["distance"]=keyboardMotion,["samples"]=samples}.ToString());Finish(pass,pass?"":"Gate passage did not reach bridge",keyboardMotion);
        }
        void Finish(bool success,string error,float moved){File.WriteAllText(Path.Combine(output,"new-world-result.json"),new JObject{["success"]=success,["error"]=error,["authority"]="typescript",["layout"]=NewWorldGameProfile.LayoutId,["characters"]=view.characters?.Length??0,["npcs"]=view.World?["npcs"]?.Count()??0,["motionDistance"]=moved,["pointerClickVerified"]=pointerVerified,["keyboardMotionDistance"]=keyboardMotion,["scope"]=view.Authority?.gate.Scope,["revision"]=view.Authority?.gate.Revision??-1,["visualAccepted"]=false}.ToString());Application.Quit(success?0:2);}
    }
}
