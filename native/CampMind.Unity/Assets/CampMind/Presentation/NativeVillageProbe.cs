using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
namespace CampMind.Presentation
{
    public sealed class NativeVillageProbe:MonoBehaviour
    {
        NativeVillageUi ui;NativeCampView view;string output,stage="startup";readonly List<double> frames=new List<double>();
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Install(){var dir=Environment.GetEnvironmentVariable("CAMP_VILLAGE_PROBE_OUTPUT");if(!String.IsNullOrEmpty(dir)){var root=new GameObject("Village acceptance probe");DontDestroyOnLoad(root);root.AddComponent<NativeVillageProbe>().Begin(dir);}}
        void Begin(string directory){output=directory;Directory.CreateDirectory(output);StartCoroutine(Guard(Run()));}
        IEnumerator Guard(IEnumerator steps){var stack=new Stack<IEnumerator>();stack.Push(steps);while(stack.Count>0){bool more;object current;try{more=stack.Peek().MoveNext();current=more?stack.Peek().Current:null;}catch(Exception e){File.WriteAllText(Path.Combine(output,"village-result.json"),new JObject{["success"]=false,["error"]=e.ToString(),["inputBlocked"]=view?.InputBlocked,["pending"]=ui?.Pending,["uiError"]=ui?.Error,["visibleButtons"]=new JArray(UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Select(b=>b.name))}.ToString());Application.Quit(2);yield break;}if(!more){stack.Pop();continue;}if(current is IEnumerator nested){stack.Push(nested);continue;}yield return current;}}
        void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        void Click(string name){var b=UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(b=>b.gameObject.activeInHierarchy&&b.name==name);Check(b!=null,"Missing visible control: "+name);b.onClick.Invoke();}
        IEnumerator Until(Func<bool> condition,float seconds){var end=Time.realtimeSinceStartup+seconds;while(!condition()){if(Time.realtimeSinceStartup>end)throw new TimeoutException("Village probe "+stage+" timeout: "+ui?.Error);yield return null;}}
        IEnumerator Capture(string name){yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,name+".png"));yield return new WaitForSecondsRealtime(.4f);}
        IEnumerator Run()
        {
            InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;
            yield return Until(()=>UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>()!=null,60);ui=UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>();view=ui.GetComponent<NativeCampView>();
            yield return Until(()=>view.Authority!=null&&view.Authority.Connected,60);yield return new WaitForSecondsRealtime(1);
            yield return Until(()=>!NativeStartup.Active,120);
            if(Environment.GetEnvironmentVariable("CAMP_VILLAGE_DEFAULT")=="1")yield return Until(()=>ui.VillageActive,20);else ui.SetActive(true);
            yield return new WaitForSecondsRealtime(1);
            yield return Capture("village-entry");
            yield return Until(()=>ui.Snapshot!=null,60);
            Check(ui.FormalHudVisible&&!ui.ManagementPanelOpen,"Formal entry must show the compact game HUD with management closed");
            var originalUi=view.GetComponent<NativeGameUi>();Check(originalUi.HasControl("世界频道")&&originalUi.HasControl("伙伴列表")&&originalUi.HasControl("视角切换")&&originalUi.HasControl("营地选项"),"Original HUD controls and world channel must be retained");
            Check(!UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&(b.name=="开始新玩法"||b.name.Contains("尚未选择原型")||b.name.Contains("返回原模式"))),"Manual migration leaked into formal startup");
            yield return Capture("village-camp");
            Check((string)ui.Snapshot["worldMode"]=="village-v1","Wrong world mode");
            if(Environment.GetEnvironmentVariable("CAMP_COGNITION_SETTINGS_PROBE")=="1"){
                stage="cognition settings";Click("菜单");yield return Until(()=>view.InputBlocked,20);Click("对话与认知");
                Func<string,bool> visible=name=>UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name==name);
                Func<string,bool> bound=name=>UnityEngine.Object.FindObjectsByType<Text>(FindObjectsSortMode.None).Any(t=>t.gameObject.activeInHierarchy&&t.text.StartsWith("当前认知绑定：")&&t.text.Contains(name));
                yield return Until(()=>visible("Qwen3.5 · 2B")&&bound("MiniMind3"),20);
                Check(!visible("Qwen3.5 · 0.8B")&&!visible("Qwen3 · 4B")&&!visible("配置远程模型"),"Removed preferred models remain visible");
                yield return Capture("cognition-default-minimind3");Click("Qwen3.5 · 2B");yield return Until(()=>bound("Qwen3.5"),20);
                yield return Capture("cognition-preferred-qwen2b");Click("关闭");yield return Until(()=>!view.InputBlocked,20);Click("菜单");yield return Until(()=>view.InputBlocked,20);Click("对话与认知");yield return Until(()=>bound("Qwen3.5"),20);
                Click("MiniMind3 · 默认认知模型");yield return Until(()=>bound("MiniMind3"),20);yield return Capture("cognition-restored-minimind3");
                File.WriteAllText(Path.Combine(output,"village-result.json"),new JObject{["success"]=true,["classification"]="cognition-settings-only",["defaultMode"]=true,["scope"]=ui.Snapshot["worldId"],["worldId"]=ui.Snapshot["worldId"],["revision"]=ui.Snapshot["revision"],["itemId"]=ui.Snapshot["actors"]?["player"]?["equipment"],["models"]=ui.Snapshot["models"]?.DeepClone(),["defaultModel"]="minimind3",["preferredModel"]="native:qwen3.5-2b",["selectionAndReopenVerified"]=true}.ToString());Application.Quit(0);yield break;
            }
            if(Environment.GetEnvironmentVariable("CAMP_UI_LAYOUT_PROBE")=="1"){
                if((bool?)ui.Snapshot["paused"]!=true){Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);}
                Click("制作装备");yield return null;Click("制作 WPN002");yield return Capture("ui-craft");
                var submit=UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name=="安排制作");Check(submit!=null,"Recipe detail action missing");
                Click("制作 WPN006");yield return null;submit=UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name=="安排制作");Check(!submit.interactable,"Locked recipe must not submit");yield return Capture("ui-locked-recipe");
                Click("营地");yield return Capture("ui-camp");Click("人物");yield return Capture("ui-people");Click("协作");yield return Capture("ui-society");ui.ShowManagement("狩猎");yield return Capture("ui-hunting");
                Click("关闭详情");yield return null;Click("菜单");yield return Until(()=>view.InputBlocked,20);yield return Capture("ui-settings");Click("关闭");yield return Until(()=>!view.InputBlocked,20);yield return Capture("ui-hud");
                var initialWeather=(string)view.World?["weather"]??"clear";Click("天气");yield return Until(()=>view.InputBlocked,20);yield return Capture("ui-weather");Click("唤来雷暴");yield return Until(()=>(string)view.World?["weather"]=="storm",20);Click("关闭");yield return Until(()=>!view.InputBlocked,20);Click("暂停 / 继续");yield return Until(()=>(double?)view.World?["atmosphere"]?["rainIntensity"]>.3,60);Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);yield return Capture("ui-weather-storm");Check(UnityEngine.Object.FindObjectsByType<Text>(FindObjectsSortMode.None).Any(t=>t.gameObject.activeInHierarchy&&t.text=="雷暴"),"HUD weather must follow authoritative state");view.SendCommand("weather",new JObject{["weather"]=initialWeather});yield return Until(()=>(string)view.World?["weather"]==initialWeather,20);
                var channelFixture=(NativeWorldChannel)typeof(NativeGameUi).GetField("channel",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(originalUi);
                channelFixture.Put("ui-reply-short",true,"阿壮","【界面验收示例】如果你也愿意，我们在这里相处五秒。",9999,"UI验收","领主","azhuang");channelFixture.Put("ui-reply-long",true,"阿壮","【界面验收示例】提议一起走到旁边的会合点；我跟随你，双方各自确认。",10000,"UI验收","领主","azhuang");typeof(NativeGameUi).GetMethod("Refresh",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(originalUi,null);yield return Capture("ui-channel-reply");
                File.WriteAllText(Path.Combine(output,"village-result.json"),new JObject{["success"]=true,["classification"]="ui-layout-only",["modelsVerified"]=false,["coverage"]="hud-clock-dock-craft-locked-recipe-camp-people-society-hunting-settings-weather-entry-inline-reply",["worldId"]=ui.Snapshot["worldId"],["revision"]=ui.Snapshot["revision"],["itemId"]=ui.Snapshot["actors"]?["player"]?["equipment"],["policyErrors"]=ui.Snapshot["policyErrors"]?.DeepClone()}.ToString());Application.Quit(0);yield break;
            }
            Check(!String.IsNullOrEmpty((string)ui.Snapshot["models"]?["life"]?["modelHash"])&&!String.IsNullOrEmpty((string)ui.Snapshot["models"]?["tactical"]?["modelHash"]),"Both trained v4 models must be loaded");
            if(Environment.GetEnvironmentVariable("CAMP_VILLAGE_UPGRADE_PROBE")=="1"){
                Check(((JObject)ui.Snapshot["actors"]).Count==10,"Nine original people must be retained");
                Check(((string)ui.Snapshot["worldId"]).StartsWith("migrated-"),"Existing save must be upgraded automatically");
                Check((bool?)ui.Snapshot["paused"]==false,"Upgrade must enter the running game");
                yield return new WaitForSecondsRealtime(2);Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);
                yield return Capture("village-upgraded-nine-people");
                File.WriteAllText(Path.Combine(output,"village-result.json"),new JObject{["success"]=true,["authority"]="typescript",["scope"]=ui.Snapshot["worldId"],["worldId"]=ui.Snapshot["worldId"],["revision"]=ui.Snapshot["revision"],["itemId"]=ui.Snapshot["actors"]?["player"]?["equipment"],["defaultMode"]=true,["startupIncluded"]=Array.IndexOf(Environment.GetCommandLineArgs(),"-campmind-village-probe")<0,["automaticUpgrade"]=true,["npcCount"]=9,["models"]=ui.Snapshot["models"]?.DeepClone(),["coverage"]="normal-startup-automatic-legacy-upgrade-nine-people-no-setup-pause"}.ToString());Application.Quit(0);yield break;
            }
            if((bool?)ui.Snapshot["paused"]!=true){Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);}
            var workshopEnabled=ui.Snapshot["uiCatalog"]?["workshop"] is JObject;
            stage="speed acknowledgement";ui.ChangeSpeed(4);yield return Until(()=>(int?)ui.Snapshot["speed"]==4,20);
            if(workshopEnabled&&(string)ui.Snapshot["uiCatalog"]["workshop"]["state"]!="ready"){
                stage="workshop construction";ui.ShowManagement("营地");yield return null;yield return Capture("playable-goals-and-workshop");
                Check((string)ui.Snapshot["uiCatalog"]?["journey"]?["current"]?["title"]!=null,"Current playable goal must be visible");
                stage="workshop accepted";ui.Command("BUILD_WORKSHOP");
                yield return Until(()=>(string)ui.Snapshot["uiCatalog"]?["workshop"]?["state"]=="building",20);
                stage="workshop completion";ui.SetPaused(false);yield return Until(()=>(string)ui.Snapshot["uiCatalog"]?["workshop"]?["state"]=="ready",120);
                stage="workshop pause acknowledgement";ui.SetPaused(true);yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);yield return Capture("playable-workshop-built");
            }
            var probeRecipe=workshopEnabled?"WPN003":"WPN005";
            ui.ShowManagement("制作");yield return null;Click("制作 "+probeRecipe);yield return null;
            var recipient=UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(b=>b.gameObject.activeInHierarchy&&b.name.StartsWith("接收人："));Check(recipient!=null,"Explicit equipment recipient control is missing");
            var recipientText=recipient.GetComponentInChildren<Text>();Check(recipientText.preferredHeight<=((RectTransform)recipientText.transform).rect.height+1,"Recipient name is clipped");
            yield return Capture("village-craft-detail");Click("安排制作");
            yield return Until(()=>(ui.Snapshot["executions"] as JObject)?.Properties().Any(p=>(string)p.Value["command"]?["action"]=="CRAFT"&&new[]{"accepted","running"}.Contains((string)p.Value["status"]))==true,20);
            yield return Until(()=>UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name=="取消当前任务"),20);
            Click("营地");yield return null;if((bool?)ui.Snapshot["paused"]==true){Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==false,20);}Click("制作");yield return null;
            yield return Until(()=>(ui.Snapshot["economy"]?["items"] as JObject)?.Properties().Any(p=>(string)p.Value["recipeId"]==probeRecipe&&(string)p.Value["holderId"]=="player")==true,180);
            var item=((JObject)ui.Snapshot["economy"]["items"]).Properties().First(p=>(string)p.Value["recipeId"]==probeRecipe&&(string)p.Value["holderId"]=="player").Name;
            stage="equip";Click("人物");yield return null;Click("装备 "+item);yield return Until(()=>(string)ui.Snapshot["actors"]?["player"]?["equipment"]==item,20);yield return Capture("village-crafted-equipped");
            Check((int?)ui.Snapshot["actors"]?["player"]?["growth"]?["experience"]>0,"Actual construction/crafting contributions must accumulate experience");
            Check(UnityEngine.Object.FindObjectsByType<Text>(FindObjectsSortMode.None).Any(t=>t.gameObject.activeInHierarchy&&t.text.Contains("累计")),"Growth accumulation must be rendered in the people page");
            stage="settings";Click("菜单");yield return Until(()=>view.InputBlocked&&UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name=="关闭"),20);Click("对话与认知");yield return null;yield return Capture("village-model-settings");Click("关闭");yield return Until(()=>!view.InputBlocked,20);
            Click("人物");yield return null;yield return Capture("village-people");Click("协作");yield return null;Click("隐藏聊天（社会决策继续）");yield return Capture("village-society-hidden");
            Click("关闭详情");yield return null;Check(!ui.ManagementPanelOpen&&ui.VillageActive,"Closing management must retain formal gameplay");
            stage="keyboard movement";view.lordView=true;var beforeMove=ui.Snapshot["actors"]["player"]["position"].DeepClone();
            var keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));yield return new WaitForSecondsRealtime(.8f);InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;InputSystem.RemoveDevice(keyboard);
            yield return Until(()=>!JToken.DeepEquals(beforeMove,ui.Snapshot["actors"]["player"]["position"]),20);
            yield return Capture("village-formal-hud");var end=Time.realtimeSinceStartup+10;while(Time.realtimeSinceStartup<end){frames.Add(Time.unscaledDeltaTime*1000);yield return null;}
            Click("暂停 / 继续");yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);var elapsed=(double)ui.Snapshot["elapsed"];yield return new WaitForSecondsRealtime(1);Check((double)ui.Snapshot["elapsed"]==elapsed,"Paused village advanced");
            frames.Sort();File.WriteAllText(Path.Combine(output,"village-result.json"),new JObject{["success"]=true,["authority"]="typescript",["scope"]=ui.Snapshot["worldId"],["defaultMode"]=Environment.GetEnvironmentVariable("CAMP_VILLAGE_DEFAULT")=="1",["startupIncluded"]=Array.IndexOf(Environment.GetCommandLineArgs(),"-campmind-village-probe")<0,["originalHudRetained"]=true,["keyboardMovementVerified"]=true,["modelSettingsVerified"]=true,["workshopVerified"]=workshopEnabled&&(string)ui.Snapshot["uiCatalog"]?["workshop"]?["state"]=="ready",["growthVerified"]=(int?)ui.Snapshot["actors"]?["player"]?["growth"]?["experience"]>0,["goalsVerified"]=(int?)ui.Snapshot["uiCatalog"]?["journey"]?["progress"]>=2,["coverage"]="original-hud-world-channel-workshop-craft-equip-growth-goals-settings-keyboard-tabs-chat-pause",["models"]=ui.Snapshot["models"]?.DeepClone(),["worldId"]=ui.Snapshot["worldId"],["revision"]=ui.Snapshot["revision"],["itemId"]=item,["frameSamples"]=frames.Count,["frameP50Ms"]=frames[frames.Count/2],["frameP95Ms"]=frames[(int)(frames.Count*.95)]}.ToString());Application.Quit(0);
        }
    }
}
