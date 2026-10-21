using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed class NativeAnimalProbe:MonoBehaviour
    {
        string output;NativeVillageUi ui;NativeCampView view;readonly List<double> frames=new List<double>();
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Install(){var dir=Environment.GetEnvironmentVariable("CAMP_ANIMAL_PROBE_OUTPUT");if(!String.IsNullOrEmpty(dir)){var root=new GameObject("Animal gameplay acceptance");DontDestroyOnLoad(root);var p=root.AddComponent<NativeAnimalProbe>();p.output=dir;p.StartCoroutine(p.Guard(p.Run()));}}
        IEnumerator Guard(IEnumerator steps){Directory.CreateDirectory(output);var stack=new Stack<IEnumerator>();stack.Push(steps);while(stack.Count>0){bool more;object current;try{more=stack.Peek().MoveNext();current=more?stack.Peek().Current:null;}catch(Exception e){File.WriteAllText(Path.Combine(output,"animal-result.json"),new JObject{["success"]=false,["error"]=e.ToString()}.ToString());Application.Quit(1);yield break;}if(!more){stack.Pop();continue;}if(current is IEnumerator nested)stack.Push(nested);else yield return current;}}
        IEnumerator Until(Func<bool> check,float seconds){var end=Time.realtimeSinceStartup+seconds;while(!check()){if(Time.realtimeSinceStartup>end)throw new Exception("Animal probe timed out");yield return null;}}
        IEnumerator Capture(string name){yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,name+".png"));yield return null;}
        IEnumerator Run(){
            yield return Until(()=>UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>()!=null,60);ui=UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>();view=ui.GetComponent<NativeCampView>();
            yield return Until(()=>!NativeStartup.Active&&ui.VillageActive&&ui.Snapshot?["ecology"]?["animals"] is JArray,150);
            if(ui.Snapshot["ecology"]?["model"]==null||ui.Snapshot["ecology"]?["model"].Type==JTokenType.Null)throw new Exception("Animal model unavailable: "+ui.Snapshot["ecology"]?["policyError"]);
            if((bool?)ui.Snapshot["paused"]==true){ui.TogglePause();yield return Until(()=>(bool?)ui.Snapshot["paused"]==false,20);}
            var initial=ui.Snapshot["ecology"]["animals"].DeepClone();var captures=new JArray();view.lordView=false;
            var huntUi=false;
            if(Environment.GetEnvironmentVariable("CAMP_ANIMAL_HUNT_UI_PROBE")=="1"){
                ui.ShowManagement("狩猎");yield return Until(()=>UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name.EndsWith(" · 追猎")),20);
                UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name.EndsWith(" · 追猎")).onClick.Invoke();
                yield return Until(()=>ui.Snapshot?["ecology"]?["hunt"] is JObject,20);yield return Until(()=>UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name=="停止追猎"),20);yield return Capture("forest-hunt-ui");
                UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name=="停止追猎").onClick.Invoke();yield return Until(()=>ui.Snapshot?["ecology"]?["hunt"] is not JObject,20);
                UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name=="关闭详情").onClick.Invoke();huntUi=true;
            }
            yield return Capture("forest-overview");
            foreach(var species in new[]{"rabbit","pheasant","deer","boar","bear","tiger"}){
                var a=((JArray)ui.Snapshot["ecology"]["animals"]).First(t=>(string)t["species"]==species&&(double)t["hp"]>0);var p=a["position"];var focus=view.Space.ToUnity(new Vector2((float)p["x"],(float)p["y"]),0);
                if(Physics.Raycast(focus+Vector3.up*500,Vector3.down,out var ground,1000,1<<9))focus.y=ground.point.y+1;
                view.focus=focus;view.zoom=2.5f;view.pitch=.85f;yield return new WaitForSecondsRealtime(1);
                var model=GameObject.Find((string)a["id"]);if(model==null||!model.activeInHierarchy||model.GetComponentsInChildren<SkinnedMeshRenderer>().Length==0)throw new Exception("Animal not rendered: "+species);
                var animator=model.GetComponentInChildren<Animator>();if(animator==null||animator.runtimeAnimatorController==null)throw new Exception("Animal animation absent: "+species);
                captures.Add(new JObject{["species"]=species,["id"]=a["id"],["position"]=a["position"].DeepClone(),["mode"]=a["mode"],["rendererCount"]=model.GetComponentsInChildren<SkinnedMeshRenderer>().Length,["animationState"]=animator.GetCurrentAnimatorStateInfo(0).fullPathHash});
                yield return Capture("forest-"+species);
            }
            var end=Time.realtimeSinceStartup+5;while(Time.realtimeSinceStartup<end){frames.Add(Time.unscaledDeltaTime*1000);yield return null;}
            var after=ui.Snapshot["ecology"]["animals"];var moved=((JArray)after).Any(a=>{var old=((JArray)initial).First(t=>(string)t["id"]==(string)a["id"]);return !JToken.DeepEquals(old["position"],a["position"]);});if(!moved)throw new Exception("Animal authority did not move");
            ui.TogglePause();yield return Until(()=>(bool?)ui.Snapshot["paused"]==true,20);var clock=ui.Snapshot["ecology"]["time"].DeepClone();yield return new WaitForSecondsRealtime(1);if(!JToken.DeepEquals(clock,ui.Snapshot["ecology"]["time"]))throw new Exception("Paused animals advanced");
            if(Environment.GetEnvironmentVariable("CAMP_ANIMAL_RESET_UI_PROBE")=="1"){
                var oldId=(string)ui.Snapshot["worldId"];var modelId=(string)view.World?["agency"]?["modelId"];
                void Click(string name){UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(b=>b.gameObject.activeInHierarchy&&b.name==name).onClick.Invoke();}
                Click("菜单");yield return Until(()=>UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).Any(b=>b.gameObject.activeInHierarchy&&b.name=="对话与认知"),20);Click("对话与认知");yield return null;Click("重置游戏");yield return null;Click("确认重置世界");
                yield return Until(()=>(string)ui.Snapshot?["worldId"]!=oldId&&(long?)ui.Snapshot?["tick"]==0,30);
                if((int?)ui.Snapshot["inventory"]?["wood"]!=35||(int?)ui.Snapshot["inventory"]?["food"]!=30||(bool?)ui.Snapshot["paused"]!=false||((JObject)ui.Snapshot["executions"]).Count!=0||((JArray)ui.Snapshot["ecology"]["animals"]).Count!=22)throw new Exception("Reset did not restore the running initial village/ecology");
                var initialInventory=ui.Snapshot["inventory"].DeepClone();
                yield return Until(()=>(long?)ui.Snapshot?["tick"]>0&&(double?)ui.Snapshot?["ecology"]?["time"]>0,30);
                ui.TogglePause();yield return Until(()=>(bool?)ui.Snapshot?["paused"]==true,20);
                var resetClock=ui.Snapshot["ecology"]["time"].DeepClone();yield return new WaitForSecondsRealtime(.5f);if(!JToken.DeepEquals(resetClock,ui.Snapshot["ecology"]["time"]))throw new Exception("Reset world did not honor explicit pause");
                if((string)view.World?["agency"]?["modelId"]!=modelId)throw new Exception("Reset lost selected model");
                yield return Capture("forest-reset-initial");File.WriteAllText(Path.Combine(output,"reset-result.json"),new JObject{["success"]=true,["originalConfirmationUi"]=true,["previousWorldId"]=oldId,["worldId"]=ui.Snapshot["worldId"],["tick"]=ui.Snapshot["tick"],["initialInventory"]=initialInventory,["inventory"]=ui.Snapshot["inventory"].DeepClone(),["automaticRunVerified"]=true,["explicitPauseVerified"]=true,["modelSettingsRetained"]=true,["paused"]=true,["animalCount"]=22}.ToString());
            }
            frames.Sort();File.WriteAllText(Path.Combine(output,"animal-result.json"),new JObject{["success"]=true,["authority"]="typescript",["worldId"]=ui.Snapshot["worldId"],["species"]=captures,["visibleModels"]=ui.AnimalVisualCount,["moved"]=moved,["huntUiVerified"]=huntUi,["pauseVerified"]=true,["model"]=ui.Snapshot["ecology"]["model"].DeepClone(),["metrics"]=ui.Snapshot["ecology"]["metrics"].DeepClone(),["p50Ms"]=frames[frames.Count/2],["p95Ms"]=frames[(int)(frames.Count*.95)]}.ToString());Application.Quit(0);
        }
    }
}
