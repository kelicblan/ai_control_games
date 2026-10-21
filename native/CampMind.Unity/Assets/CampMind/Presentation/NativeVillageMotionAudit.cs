using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation {
 // Opt-in observation of the actual rendered models, never authoring simulation state.
 public sealed class NativeVillageMotionAudit:MonoBehaviour {
  string output;readonly JArray samples=new JArray();
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Install(){var dir=Environment.GetEnvironmentVariable("CAMP_VILLAGE_MOTION_AUDIT");if(String.IsNullOrEmpty(dir)||UnityEngine.Object.FindFirstObjectByType<NativeVillageMotionAudit>()!=null)return;var g=new GameObject("Village rendered motion audit");DontDestroyOnLoad(g);var a=g.AddComponent<NativeVillageMotionAudit>();a.output=dir;a.StartCoroutine(a.Run());}
  static JObject V(Vector3 p)=>new JObject{["x"]=p.x,["y"]=p.y,["z"]=p.z};
  IEnumerator Run(){
   Directory.CreateDirectory(output);NativeVillageUi ui=null;
   while(ui==null||!ui.VillageActive||ui.Snapshot==null||NativeStartup.Active){ui=UnityEngine.Object.FindFirstObjectByType<NativeVillageUi>();yield return null;}
   var view=ui.GetComponent<NativeCampView>();var start=Time.realtimeSinceStartup;var nextShot=0f;
   while(Time.realtimeSinceStartup-start<120){
    yield return new WaitForEndOfFrame();var entries=new JArray();
    foreach(var pair in ((JObject)ui.Snapshot["actors"]).Properties().Select(p=>(id:p.Name,state:p.Value,kind:"npc")).Concat(((JArray)ui.Snapshot["ecology"]["animals"]).Select(a=>(id:(string)a["id"],state:a,kind:"animal")))){
     var model=GameObject.Find(pair.id);if(model==null)continue;var animator=model.GetComponentInChildren<Animator>();var skin=model.GetComponentInChildren<SkinnedMeshRenderer>();
     entries.Add(new JObject{["id"]=pair.id,["kind"]=pair.kind,["authority"]=pair.state["position"].DeepClone(),["rendered"]=V(model.transform.position),["activity"]=pair.state["activity"]?.DeepClone()??pair.state["mode"]?.DeepClone(),["animation"]=animator?.GetCurrentAnimatorStateInfo(0).fullPathHash,["animationTime"]=animator?.GetCurrentAnimatorStateInfo(0).normalizedTime,["animationSpeed"]=animator?.speed,["bones"]=new JArray((skin?.bones??Array.Empty<Transform>()).Where(b=>b!=null).Take(16).Select(b=>new JObject{["name"]=b.name,["rotation"]=V(b.localEulerAngles)}))});
    }
    samples.Add(new JObject{["realSeconds"]=Time.realtimeSinceStartup-start,["tick"]=ui.Snapshot["tick"],["paused"]=ui.Snapshot["paused"],["entities"]=entries});
    File.WriteAllText(Path.Combine(output,"rendered-motion.json"),new JObject{["worldId"]=ui.Snapshot["worldId"],["samples"]=samples,["complete"]=false}.ToString());
    if(Time.realtimeSinceStartup-start>=nextShot){ScreenCapture.CaptureScreenshot(Path.Combine(output,"motion-"+Mathf.RoundToInt(nextShot)+".png"));nextShot+=30;}
    if(Environment.GetEnvironmentVariable("CAMP_VILLAGE_MOTION_CAMERA")=="1") {view.lordView=false;var group=Time.realtimeSinceStartup-start<40?((JObject)ui.Snapshot["actors"]).Properties().Where(p=>p.Name!="player").Select(p=>p.Value):((JArray)ui.Snapshot["ecology"]["animals"]).Where(a=>(double)a["hp"]>0);var target=group.ElementAt(Mathf.FloorToInt((Time.realtimeSinceStartup-start)/10)%group.Count())["position"];view.focus=view.Space.ToUnity(new Vector2((float)target["x"],(float)target["y"]),1);view.zoom=2.5f;}
    yield return new WaitForSecondsRealtime(.5f);
   }
   File.WriteAllText(Path.Combine(output,"rendered-motion.json"),new JObject{["worldId"]=ui.Snapshot["worldId"],["samples"]=samples,["complete"]=true}.ToString());
  }
 }
}
