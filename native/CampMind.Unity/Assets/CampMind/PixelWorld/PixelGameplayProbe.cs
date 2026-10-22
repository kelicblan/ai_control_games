using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
namespace CampMind.PixelWorld
{
 public sealed class PixelGameplayProbe:MonoBehaviour
 {
  readonly List<string> missing=new List<string>(); readonly JObject checks=new JObject();string directory;
  bool Click(string name){var button=FindObjectsByType<Button>(FindObjectsInactive.Exclude,FindObjectsSortMode.None).FirstOrDefault(b=>b.name==name&&b.gameObject.activeInHierarchy&&b.interactable);if(button==null){missing.Add(name);return false;}button.onClick.Invoke();return true;}
  IEnumerator Capture(string name){yield return new WaitForSecondsRealtime(1.2f);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,name+".png"));yield return new WaitForSecondsRealtime(.3f);}
  static Rect Bounds(RectTransform r){var corners=new Vector3[4];r.GetWorldCorners(corners);return new Rect(corners[0].x,corners[0].y,corners[2].x-corners[0].x,corners[2].y-corners[0].y);}
  IEnumerator VerifyResize(NativeGameUi ui,NativeVillageUi village){
   GetComponent<PixelWorldView>().AutomatedCapture=true;var samples=new JArray();var baseline=new Dictionary<string,Vector2>();bool fixedSize=true,inside=true,separated=true;
   var names=new[]{"暂停 / 继续","1倍","菜单","环境声音","切换视角","天气","制作装备","营地升级","协作约定","人物装备"};
   foreach(var size in new[]{new Vector2Int(1920,1080),new Vector2Int(2400,1350),new Vector2Int(2880,1800),new Vector2Int(1600,1000)}){
    Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(1);yield return new WaitForEndOfFrame();Canvas.ForceUpdateCanvases();
    var measured=new JObject();foreach(var name in names){var button=ui.Canvas.GetComponentsInChildren<Button>(true).First(b=>b.name==name);var box=Bounds((RectTransform)button.transform);var font=button.GetComponentInChildren<Text>();var dimensions=new Vector2(box.width,box.height);
     if(baseline.TryGetValue(name,out var original))fixedSize&=Vector2.Distance(original,dimensions)<.1f;else baseline[name]=dimensions;
     inside&=box.xMin>=0&&box.yMin>=0&&box.xMax<=Screen.width+1&&box.yMax<=Screen.height+1;
     measured[name]=new JObject{["width"]=box.width,["height"]=box.height,["fontPixels"]=font==null?0:font.fontSize*ui.Canvas.scaleFactor};}
    Rect Hud(string name)=>Bounds((RectTransform)ui.Canvas.GetComponentsInChildren<Transform>(true).First(t=>t.name==name));var resources=Hud("物资");var time=Hud("时间控制");var views=Hud("视角切换");separated&=!resources.Overlaps(time)&&!time.Overlaps(views)&&!resources.Overlaps(views);
    var sample=new JObject{["width"]=Screen.width,["height"]=Screen.height,["scale"]=ui.Canvas.scaleFactor,["buttons"]=measured,["mapVisibleWidth"]=Camera.main.orthographicSize*2*Camera.main.aspect};
    yield return Capture($"resize-{Screen.width}x{Screen.height}-hud");Click("制作装备");yield return new WaitForSecondsRealtime(.3f);Canvas.ForceUpdateCanvases();var panel=FindObjectsByType<RectTransform>(FindObjectsInactive.Exclude,FindObjectsSortMode.None).First(r=>r.name=="营地管理详情");var rect=Bounds(panel);sample["managementWidth"]=rect.width;sample["managementHeight"]=rect.height;var visible=Bounds((RectTransform)panel.parent);inside&=visible.xMin>=0&&visible.yMin>=0&&visible.xMax<=Screen.width+1&&visible.yMax<=Screen.height+1;yield return Capture($"resize-{Screen.width}x{Screen.height}-management");Click("关闭详情");yield return null;samples.Add(sample);
   }
   GetComponent<PixelWorldView>().AutomatedCapture=false;
   File.WriteAllText(Path.Combine(directory,"resize-ui.json"),new JObject{["oldFullscreenSize"]=Mathf.Abs(baseline["暂停 / 继续"].x-78)<.1f&&Mathf.Abs(ui.Canvas.scaleFactor-1.5f)<.001f,["fixedButtonPixels"]=fixedSize,["allControlsInside"]=inside,["topBarsSeparated"]=separated,["samples"]=samples}.ToString());
  }
  IEnumerator VerifyZoom(NativeGameUi ui){
   var map=GetComponent<PixelWorldView>();var client=GetComponent<PixelWorldClient>();map.AutomatedCapture=false;map.Observe(new Vector2(13824,17408),155);yield return new WaitForSecondsRealtime(2);yield return Capture("zoom-01-village");
   var originalPlayer=new Vector2(client.Snapshot.player.x,client.Snapshot.player.y);float near=map.ZoomSize;InputSystem.QueueDeltaStateEvent(Mouse.current.position,new Vector2(Screen.width*.5f,Screen.height*.55f));yield return null;yield return null;
   float notch=InputSystem.settings.scrollDeltaBehavior==InputSettings.ScrollDeltaBehavior.UniformAcrossAllPlatforms?1:120;
   for(int i=0;i<45;i++){InputSystem.QueueDeltaStateEvent(Mouse.current.scroll,new Vector2(0,-notch));yield return null;}
   yield return new WaitForSecondsRealtime(2);float far=map.ZoomSize;var a=PixelProtocol.FromUnity(Camera.main.ViewportToWorldPoint(new Vector3(0,1,0)));var b=PixelProtocol.FromUnity(Camera.main.ViewportToWorldPoint(new Vector3(1,0,0)));yield return Capture("zoom-02-viewport-covered");
   bool Covered(Vector2 lo,Vector2 hi)=>lo.x>=-.1f&&lo.y>=-.1f&&hi.x<=32000.1f&&hi.y<=32000.1f;
   map.Pan(new Vector2(0,-1000000),Screen.height);yield return null;yield return null;var north=PixelProtocol.FromUnity(Camera.main.ViewportToWorldPoint(new Vector3(0,1,0)));yield return Capture("zoom-03-north-edge");
   map.Pan(new Vector2(0,1000000),Screen.height);yield return null;yield return null;var south=PixelProtocol.FromUnity(Camera.main.ViewportToWorldPoint(new Vector3(1,0,0)));yield return Capture("zoom-04-south-edge");
   for(int i=0;i<45;i++){InputSystem.QueueDeltaStateEvent(Mouse.current.scroll,new Vector2(0,notch));yield return null;}
   yield return new WaitForSecondsRealtime(1);float close=map.ZoomSize;map.Observe(new Vector2(13824,17408),155);yield return Capture("zoom-03-village-return");
   File.WriteAllText(Path.Combine(directory,"zoom-ui.json"),new JObject{["wheelOutWorks"]=far>near*10,["wheelInWorks"]=close<far/10,["viewportCoveredByTerrain"]=Covered(a,b),["northEdgeReachable"]=Mathf.Abs(north.y)<.1f,["southEdgeReachable"]=Mathf.Abs(south.y-32000)<.1f,["northSouthPanAvailable"]=b.y-a.y<32000,["overviewLoaded"]=map.OverviewReady,["boundedChunks"]=map.LoadedChunks<=64,["cameraDoesNotMovePlayer"]=Vector2.Distance(originalPlayer,new Vector2(client.Snapshot.player.x,client.Snapshot.player.y))<.01f,["oldUiSizePreserved"]=Mathf.Abs(ui.Canvas.scaleFactor-1.5f)<.001f,["nearZoom"]=near,["farZoom"]=far,["closeZoom"]=close,["visibleBounds"]=new JObject{["minX"]=a.x,["minY"]=a.y,["maxX"]=b.x,["maxY"]=b.y}}.ToString());
  }
  IEnumerator VerifyTriggerDebug(NativeGameUi ui,NativeVillageUi village){
   int speed=(int?)village.Snapshot["speed"]??1;bool paused=(bool?)village.Snapshot["paused"]??false;
   Click("4倍");if(paused)Click("暂停 / 继续");yield return new WaitForSecondsRealtime(6);
   bool opened=Click("MLP触发");yield return new WaitForSecondsRealtime(2);var window=ui.Canvas.GetComponentsInChildren<RectTransform>(true).First(r=>r.name=="触发调试窗口");var box=Bounds(window);bool mlpVisible=window.gameObject.activeInHierarchy;float deadline=Time.realtimeSinceStartup+15;while(Time.realtimeSinceStartup<deadline&&window.GetComponentsInChildren<Text>().Any(t=>t.text.Contains("正在读取")))yield return null;yield return Capture("debug-01-mlp");
   var text=string.Join("\n",window.GetComponentsInChildren<Text>().Select(t=>t.text));bool hasMlp=text.Contains("→")&&!text.Contains("读取失败")&&!text.Contains("正在读取");
   Click("对话触发");yield return new WaitForSecondsRealtime(2);bool dialogueVisible=window.gameObject.activeInHierarchy;deadline=Time.realtimeSinceStartup+15;while(Time.realtimeSinceStartup<deadline&&window.GetComponentsInChildren<Text>().Any(t=>t.text.Contains("正在读取")))yield return null;yield return Capture("debug-02-dialogue");Click("关闭触发记录");bool closed=!window.gameObject.activeInHierarchy;
   Click(speed+"倍");if(paused)Click("暂停 / 继续");
   File.WriteAllText(Path.Combine(directory,"trigger-debug-ui.json"),new JObject{["buttonsPresent"]=opened,["mlpWindowOpens"]=mlpVisible,["realMlpRowsVisible"]=hasMlp,["dialogueWindowOpens"]=dialogueVisible,["closeWorks"]=closed,["panelInsideViewport"]=box.xMin>=0&&box.yMin>=0&&box.xMax<=Screen.width+1&&box.yMax<=Screen.height+1,["fixedUiScale"]=Mathf.Abs(ui.Canvas.scaleFactor-1.5f)<.001f}.ToString());
  }
  [Serializable] public class MovementStats {public int received,nonzero,ticks,applied,expired;public float lastAge;}
  [Serializable] public class MovementDiagnostics {public MovementStats movement;}
  IEnumerator VerifyControls(NativeGameUi ui,NativeVillageUi village){
   var map=GetComponent<PixelWorldView>();var client=GetComponent<PixelWorldClient>();var native=GetComponent<PixelGameplayUi>().OriginalView;
   map.AutomatedCapture=false;native.lordView=false;village.SetPaused(false);yield return new WaitForSecondsRealtime(2);
   Vector2 Position()=>new Vector2(client.Snapshot.player.x,client.Snapshot.player.y);
   var start=Position();float maxMoved=0;int heldFrames=0,pointerBlocks=0;float maxAge=0;
   foreach(var key in new[]{Key.D,Key.S,Key.A,Key.W}){
    var before=Position();float until=Time.realtimeSinceStartup+10f;while(Time.realtimeSinceStartup<until&&Vector2.Distance(before,Position())<2){InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState(key));yield return null;if(Keyboard.current[key].isPressed)heldFrames++;maxAge=Mathf.Max(maxAge,Time.realtimeSinceStartup-client.LastSnapshotTime);}InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState());yield return new WaitForSecondsRealtime(.4f);maxMoved=Mathf.Max(maxMoved,Vector2.Distance(before,Position()));
   }
   JObject movementDiagnostics=null;yield return client.Fetch<MovementDiagnostics>("/diagnostics",value=>{if(value!=null)movementDiagnostics=JObject.FromObject(value);});
   bool followed=native.lordView;yield return Capture("controls-01-keyboard");
   village.SetPaused(true);yield return new WaitForSecondsRealtime(1.2f);var pausedAt=Position();
   InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState(Key.D));yield return new WaitForSecondsRealtime(.7f);InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState());yield return new WaitForSecondsRealtime(.4f);bool pauseStops=Vector2.Distance(pausedAt,Position())<.05f;
   var pointer=new Vector2(Screen.width*.55f,Screen.height*.45f);InputSystem.QueueDeltaStateEvent(Mouse.current.position,pointer);yield return null;yield return null;
   float angle=map.ViewAngle;for(int frame=0;frame<20;frame++){InputSystem.QueueStateEvent(Mouse.current,new MouseState{position=pointer,buttons=2,delta=new Vector2(10,0)});yield return null;if(native.PointerBlocked)pointerBlocks++;}InputSystem.QueueStateEvent(Mouse.current,new MouseState{position=pointer});yield return new WaitForSecondsRealtime(.3f);
   bool rotated=Mathf.Abs(Mathf.DeltaAngle(angle,map.ViewAngle))>5;bool noTeleport=Vector2.Distance(pausedAt,Position())<.05f;yield return Capture("controls-02-right-drag");
   village.ShowManagement("制作");yield return new WaitForSecondsRealtime(.3f);float blockedAngle=map.ViewAngle;
   InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState(Key.W));InputSystem.QueueStateEvent(Mouse.current,new MouseState{position=pointer,buttons=2,delta=new Vector2(100,0)});yield return null;yield return null;InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState());InputSystem.QueueStateEvent(Mouse.current,new MouseState{position=pointer});yield return new WaitForSecondsRealtime(.3f);
   bool blocked=Mathf.Abs(Mathf.DeltaAngle(blockedAngle,map.ViewAngle))<.01f;Click("关闭详情");yield return null;
   InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState(Key.Home));yield return null;yield return null;InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState());yield return new WaitForSecondsRealtime(.2f);
   bool home=Mathf.Abs(Mathf.DeltaAngle(0,map.ViewAngle))<.01f;
   var source=client.Manifest.landmarks.First(p=>p.id=="village-spring");map.Observe(new Vector2(source.x,source.y),350);yield return new WaitForSecondsRealtime(4);yield return Capture("water-01-source");
   map.Observe(new Vector2(client.Manifest.village.x+2700,client.Manifest.village.y+600),3500);yield return new WaitForSecondsRealtime(4);yield return Capture("water-02-valley");
   map.ShowWholeRegion();yield return new WaitForSecondsRealtime(4);map.ExportAtlas(Path.Combine(directory,"water-atlas.png"));yield return Capture("water-03-region");
   File.WriteAllText(Path.Combine(directory,"controls-water.json"),new JObject{["keyboardAuthorityMoved"]=maxMoved>1,["maxMoveMetres"]=maxMoved,["heldFrames"]=heldFrames,["diagnostics"]=movementDiagnostics,["pointerBlockedFrames"]=pointerBlocks,["maxSnapshotAge"]=maxAge,["wasdEntersFollow"]=followed,["pausedMovementStops"]=pauseStops,["rightDragRotates"]=rotated,["rotationDoesNotTeleport"]=noTeleport,["managementBlocksRotation"]=blocked,["homeResetsBearing"]=home,["finished"]=true}.ToString());
  }
  IEnumerator Start(){var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"-pixel-capture-dir");if(index<0||index+1>=args.Length)yield break;
   Application.runInBackground=true;InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;
   directory=Path.GetFullPath(args[index+1]);Directory.CreateDirectory(directory);float deadline=Time.realtimeSinceStartup+60;PixelGameplayUi adapter=null;
   while(Time.realtimeSinceStartup<deadline){adapter=GetComponent<PixelGameplayUi>();if(adapter?.Ready==true)break;yield return null;}
   if(adapter?.Ready!=true){File.WriteAllText(Path.Combine(directory,"formal-ui.json"),"{\"ready\":false}");yield break;}
   var ui=GetComponent<NativeGameUi>();var village=GetComponent<NativeVillageUi>();var audio=GetComponent<NativeGameAudio>();
   if(Array.IndexOf(args,"-pixel-controls-probe")>=0){yield return VerifyControls(ui,village);yield break;}
   if(Array.IndexOf(args,"-pixel-debug-probe")>=0){yield return VerifyTriggerDebug(ui,village);yield break;}
   if(Array.IndexOf(args,"-pixel-zoom-probe")>=0){yield return VerifyZoom(ui);yield break;}
   if(Array.IndexOf(args,"-pixel-resize-probe")>=0){yield return VerifyResize(ui,village);yield break;}
   var controls=new[]{"物资","时间控制","暂停 / 继续","1倍","2倍","4倍","天气","菜单","环境声音","玩法指南","切换视角","展开","完整对话历史","制作装备","营地升级","协作约定","人物装备"};
   foreach(var name in controls)if(!ui.HasControl(name))missing.Add(name);
   GetComponent<PixelWorldView>().Observe(new Vector2(13824,17410),155);yield return new WaitForSecondsRealtime(5);yield return Capture("01-original-hud");
   bool sound=audio.SoundEnabled;Click("环境声音");checks["soundToggle"]=audio.SoundEnabled!=sound;Click("环境声音");
   bool camera=adapter.OriginalView.lordView;Click("切换视角");checks["cameraToggle"]=adapter.OriginalView.lordView!=camera;Click("切换视角");
   var quality=GetComponent<NativeQualityView>();checks["originalQualityConnected"]=quality!=null;
   int speed=(int?)village.Snapshot["speed"]??1;Click("2倍");yield return new WaitForSecondsRealtime(1);checks["speed2Authority"]=(int?)village.Snapshot["speed"]==2;Click(speed+"倍");yield return new WaitForSecondsRealtime(.5f);
   bool paused=(bool)village.Snapshot["paused"];Click("暂停 / 继续");yield return new WaitForSecondsRealtime(1);checks["pauseAuthority"]=(bool?)village.Snapshot["paused"]==!paused;Click("暂停 / 继续");yield return new WaitForSecondsRealtime(1);
   foreach(var name in new[]{"制作装备","营地升级","协作约定","人物装备"}){Click(name);yield return Capture("02-"+name);checks[name]=village.ManagementPanelOpen;Click("关闭详情");yield return null;}
   foreach(var name in new[]{"菜单","天气","玩法指南","展开","完整对话历史"}){Click(name);yield return Capture("03-"+name);checks[name]=adapter.OriginalView.InputBlocked;
    if(name=="菜单"){int level=quality.Current;Click("低画质");checks["qualityApply"]=quality.Current==0;Click(new[]{"低画质","中画质","高画质"}[level]);Click("对话与认知");yield return Capture("04-original-model-settings");}
    if(name=="天气"){string weather=(string)village.Snapshot["weather"];Click("让天空放晴");yield return new WaitForSecondsRealtime(1);checks["weatherAuthority"]=(string)village.Snapshot["weather"]=="clear";Click(weather=="wind"?"吹起山风":weather=="rain"?"落下一场雨":weather=="storm"?"唤来雷暴":"让天空放晴");yield return new WaitForSecondsRealtime(.5f);}
    Click("关闭");yield return new WaitForSecondsRealtime(.3f);}
   village.ShowManagement("制作");yield return null;InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState(Key.Escape));yield return null;InputSystem.QueueStateEvent(Keyboard.current,new KeyboardState());yield return null;checks["managementEscape"]=!village.ManagementPanelOpen;
   if(Array.IndexOf(args,"-pixel-reset-probe")>=0){
    string oldWorld=(string)village.Snapshot["worldId"];ui.ShowVillageSettings();yield return new WaitForSecondsRealtime(.5f);Click("游戏与退出");yield return null;Click("重置世界…");yield return new WaitForSecondsRealtime(.5f);
    Click("确认重置世界");float until=Time.realtimeSinceStartup+20;while((string)village.Snapshot["worldId"]==oldWorld&&Time.realtimeSinceStartup<until)yield return null;
    checks["resetAuthority"]=(string)village.Snapshot["worldId"]!=oldWorld;yield return new WaitForSecondsRealtime(1);village.SetPaused(true);yield return new WaitForSecondsRealtime(1);checks["resetUiScope"]=(string)adapter.OriginalView.World?["dialogueScope"]==(string)village.Snapshot["worldId"]+":pixel";yield return Capture("05-reset-original-hud");
   }
   File.WriteAllText(Path.Combine(directory,"formal-ui.json"),new JObject{["ready"]=true,["originalUi"]=true,["controls"]=new JArray(controls),["missing"]=new JArray(missing),["checks"]=checks}.ToString());
  }
 }
}
