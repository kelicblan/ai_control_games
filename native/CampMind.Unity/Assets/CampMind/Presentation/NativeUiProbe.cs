using System;
using System.IO;
using System.Collections;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections.Generic;
namespace CampMind.Presentation
{
    public sealed class NativeUiProbe:MonoBehaviour
    {
        NativeCampView view;string output;
        Canvas Ui=>GetComponent<NativeGameUi>().Canvas;
        public void Begin(NativeCampView target,string directory){view=target;output=directory;var ui=GetComponent<NativeGameUi>();if(ui==null){ui=gameObject.AddComponent<NativeGameUi>();ui.Initialize(target);}StartCoroutine(Guard(Run()));}
        IEnumerator Guard(IEnumerator steps)
        {
            while(true){bool more;object current;try{more=steps.MoveNext();current=more?steps.Current:null;}catch(Exception e){File.WriteAllText(Path.Combine(output,"ui-result.json"),new JObject{["success"]=false,["error"]=e.Message}.ToString());Debug.LogError(e);Application.Quit(2);yield break;}if(!more)yield break;yield return current;}
        }
        void Click(string name){var button=Ui.GetComponentsInChildren<Button>(true).FirstOrDefault(b=>b.name==name&&b.gameObject.activeInHierarchy);if(button==null)throw new InvalidOperationException("Missing visible UI control: "+name);button.onClick.Invoke();}
        void PointerClick(string name)
        {
            var button=Ui.GetComponentsInChildren<Button>().First(b=>b.name==name);
            var rect=(RectTransform)button.transform;var point=RectTransformUtility.WorldToScreenPoint(null,rect.TransformPoint(rect.rect.center));
            var data=new PointerEventData(EventSystem.current){position=point,button=PointerEventData.InputButton.Left};var hits=new List<RaycastResult>();EventSystem.current.RaycastAll(data,hits);
            Check(hits.Count>0&&hits[0].gameObject.GetComponentInParent<Button>()==button,"UI raycaster did not hit expected button: "+name);
            ExecuteEvents.ExecuteHierarchy(hits[0].gameObject,data,ExecuteEvents.pointerClickHandler);
        }
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        IEnumerator Run()
        {
            var deadline=Time.realtimeSinceStartup+30;
            while(view.Authority?.ReadyForActions!=true&&Time.realtimeSinceStartup<deadline)yield return null;
            Check(view.Authority?.ReadyForActions==true,"World did not connect");yield return new WaitForSecondsRealtime(.6f);
            var display=new JObject{["width"]=Screen.width,["height"]=Screen.height,["desktopWidth"]=Display.main.systemWidth,["desktopHeight"]=Display.main.systemHeight,["fullscreenMode"]=Screen.fullScreenMode.ToString(),["uiScale"]=Ui.scaleFactor,["pixelPerfect"]=Ui.pixelPerfect};
            File.WriteAllText(Path.Combine(output,"display.json"),display.ToString());
            if(NativeDisplaySettings.UseNativeResolution(Environment.GetCommandLineArgs()))Check(Screen.width==Display.main.systemWidth&&Screen.height==Display.main.systemHeight,"Player did not render at native desktop resolution");
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-welcome.png"));yield return new WaitForSecondsRealtime(.3f);
            Click("模型与场景设置");yield return null;var seedInput=Ui.GetComponentsInChildren<InputField>().First();seedInput.text="17";
            Click("确认开始新旅程");yield return new WaitForSecondsRealtime(2);
            Check(view.World!=null,"New journey button did not start authoritative world");
            var closeDeadline=Time.realtimeSinceStartup+10;
            while(Ui.GetComponentsInChildren<Button>().Any(b=>b.name=="确认开始新旅程")&&Time.realtimeSinceStartup<closeDeadline)yield return null;
            Check(!Ui.GetComponentsInChildren<Button>().Any(b=>b.name=="确认开始新旅程"),"Journey dialog did not close");
            view.lordView=false;view.zoom=.16f;yield return new WaitForSecondsRealtime(.3f);var wheelBefore=view.viewCamera.orthographicSize;
            // Synthetic wheel test must not depend on the real desktop cursor
            // landing on a HUD panel when a native fullscreen window opens.
            view.PointerBlocked=false;
            for(var notch=0;notch<10;notch++)view.ApplyWheelInput(1,true);yield return new WaitForSecondsRealtime(.3f);
            var wheelRatio=wheelBefore/view.viewCamera.orthographicSize;Check(wheelRatio>3.5f&&wheelRatio<3.8f,"Ten normalized wheel notches did not produce original camera zoom");
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-wheel-after.png"));yield return new WaitForSecondsRealtime(.3f);view.zoom=.16f;yield return new WaitForSecondsRealtime(.3f);
            PointerClick("暂停 / 继续");yield return new WaitForSecondsRealtime(1);
            Check((string)view.World["status"]=="paused","Pause button failed");
            Click("azhuang");yield return new WaitForSecondsRealtime(.3f);Click("伐木");yield return new WaitForSecondsRealtime(1);
            var npc=(view.World["npcs"] as JArray).First(n=>(string)n["id"]==view.SelectedNpc);
            Check((string)npc["command"]=="wood","Task button did not assign real wood command");
            var gate=view.GateOpen;Click("寨门开关");yield return new WaitForSecondsRealtime(1);Check(gate!=view.GateOpen,"Gate button failed");
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-game.png"));yield return new WaitForSecondsRealtime(.5f);
            Click("天气");yield return null;Click("唤来雷暴");yield return new WaitForSecondsRealtime(1);
            Check((string)view.World["weather"]=="storm","Weather button failed");Click("关闭");
            Click("伙伴互动");yield return null;Click("主动聊聊");yield return new WaitForSecondsRealtime(1);yield return new WaitForSecondsRealtime(.3f);
            var set=(view.Authority.gate.Snapshot["presentation"]["socialChoices"] as JArray).First(s=>(string)s["npcId"]==view.SelectedNpc);
            var choice=(set["options"] as JArray).First(c=>c["disabledReason"]==null);var choiceId=(string)choice["id"];Click((string)choice["label"]);yield return new WaitForSecondsRealtime(1);
            Check((view.World["social"]?["threads"] as JArray)?.Any(t=>(int)t["id"]==(int)set["threadId"]&&(string)t["choiceId"]==choiceId)==true,"Provided social reply was not persisted in real thread");
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-social.png"));yield return new WaitForSecondsRealtime(.5f);Click("关闭");
            Click("完整对话历史");yield return new WaitForSecondsRealtime(1);
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-history.png"));yield return new WaitForSecondsRealtime(.5f);
            Click("关闭");Click("营地选项");yield return null;Click("角色初始设置 · 下局生效");yield return null;
            var input=Ui.GetComponentsInChildren<InputField>().First();input.text=input.text=="99"?"98":"99";var changed=input.text;Click("关闭");yield return null;
            Check(Ui.GetComponentsInChildren<Button>().Any(b=>b.name=="放弃未保存修改"),"Unsaved NPC configuration was discarded without confirmation");
            Click("保留修改，返回");yield return null;Check(input.text==changed,"Cancel discard lost draft");
            Click("关闭");yield return null;Click("放弃未保存修改");yield return null;
            foreach(var panel in new[]{"伙伴互动","状态与记忆","性格与关系","决策记录","营地日志","天气","游戏设置","操作帮助"})
            {
                GetComponent<NativeGameUi>().SendMessage("Open",panel);yield return new WaitForSecondsRealtime(.7f);
                Check(Ui.GetComponentsInChildren<Button>().Any(b=>b.name=="关闭"),"Source dialog has no close control: "+panel);
                yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-panel-"+panel+".png"));yield return new WaitForSecondsRealtime(.2f);Click("关闭");yield return null;
            }
            GetComponent<NativeGameUi>().SendMessage("Open","游戏设置");yield return new WaitForSecondsRealtime(.5f);
            var quality=GetComponent<NativeQualityView>();var originalQuality=quality.Current;
            foreach(var level in new[]{0,2,1}){Click(new[]{"低画质","中画质","高画质"}[level]);yield return new WaitForSecondsRealtime(.3f);Check(quality.Current==level,"Settings quality did not apply");}
            Click("对话与认知");yield return new WaitForSecondsRealtime(.5f);Check(Ui.GetComponentsInChildren<Text>().Any(t=>t.text=="NPC 对话模型"),"Model settings category missing");
            Click("游戏与退出");yield return null;Click("退出游戏");yield return null;Check(Ui.GetComponentsInChildren<Button>().Any(b=>b.name=="确认退出游戏"),"Quit confirmation missing");Click("取消退出");yield return null;
            Click("画面与声音");yield return null;quality.Apply(originalQuality);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-display-settings.png"));yield return new WaitForSecondsRealtime(.3f);Click("关闭");yield return null;
            var exploration=view.World["world"]["exploration"].ToString();Click("展开");yield return new WaitForSecondsRealtime(2);
            var map=Ui.GetComponentsInChildren<RawImage>().First(r=>r.name=="鹰眼地图");Check(((Texture2D)map.texture).GetPixels32().Any(p=>p.r!=4&&p.a==255),"Source terrain map did not arrive");
            Click("镜头返回营地");Check(view.World["world"]["exploration"].ToString()==exploration,"Map browsing revealed terrain");
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-map.png"));yield return new WaitForSecondsRealtime(.5f);Click("关闭");
            var audio=GetComponent<NativeGameAudio>();Check(audio!=null,"Native audio is missing");var sound=audio.SoundEnabled;Click("环境声音");Check(audio.SoundEnabled!=sound,"Audio switch failed");Click("环境声音");Check(audio.SoundEnabled==sound,"Audio switch did not restore preference");
            Click("暂停 / 继续");yield return new WaitForSecondsRealtime(.5f);view.SendCommand("weather",new JObject{["weather"]="clear"});
            var selected=(view.World["npcs"] as JArray).First(n=>(string)n["id"]==view.SelectedNpc);view.SendCommand("move",new JObject{["npcId"]=view.SelectedNpc,["target"]=new JObject{["x"]=(double)selected["position"]["x"]+8,["y"]=(double)selected["position"]["y"]}});yield return new WaitForSecondsRealtime(.2f);
            var actor=view.Selection;var before=actor.position;var bones=actor.GetComponentInChildren<SkinnedMeshRenderer>().bones;var rotations=bones.Select(b=>b.localRotation).ToArray();yield return new WaitForSecondsRealtime(.5f);
            var animated=bones.Where((b,i)=>Quaternion.Angle(rotations[i],b.localRotation)>.01f).Count();
            Check(animated>0,"NPC skeleton did not animate in running world");Check(Vector3.Distance(before,actor.position)>.01f,"NPC did not move through real world");
            view.focus=actor.position+Vector3.up*1.5f;view.zoom=2;view.lordView=false;yield return new WaitForSecondsRealtime(.5f);
            yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"ui-live-closeup.png"));yield return new WaitForSecondsRealtime(.5f);
            var grounding=new JArray();foreach(var character in view.characters){if(Physics.Raycast(character.position+Vector3.up*100,Vector3.down,out var ground,200,1<<9))grounding.Add(new JObject{["id"]=character.name,["rootAboveGround"]=character.position.y-ground.point.y,["feet"]=new JArray(character.GetComponentInChildren<SkinnedMeshRenderer>().bones.Where(b=>b.name.ToLowerInvariant().Contains("foot")||b.name.ToLowerInvariant().Contains("ankle")||b.name.ToLowerInvariant().Contains("toe")).Select(b=>new JObject{["name"]=b.name,["heightAboveGround"]=b.position.y-ground.point.y}))});}
            File.WriteAllText(Path.Combine(output,"ui-result.json"),new JObject{["success"]=true,["authority"]="typescript",["scope"]=view.Authority.gate.Scope,["npcCount"]=(view.World["npcs"] as JArray).Count,["wheelZoomRatio"]=wheelRatio,["animatedBones"]=animated,["grounding"]=grounding,["checks"]=new JArray("new-journey","mouse-wheel-10-notches","pause","assign-wood","gate","storm","provided-social-reply","history-screen","npc-settings-draft-guard","source-map-no-reveal","audio-toggle","live-npc-movement")}.ToString());Application.Quit(0);
        }
    }
}
