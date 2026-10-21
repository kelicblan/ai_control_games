using System;
using System.IO;
using System.Collections.Generic;
using System.Collections;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation {
 public sealed class NativeWildlifeTideProbe:MonoBehaviour {
  readonly Queue<string> captures=new Queue<string>();bool capturing;
  void Capture(string path){captures.Enqueue(path);if(!capturing)StartCoroutine(CaptureQueue());}
  IEnumerator CaptureQueue(){capturing=true;while(captures.Count>0){yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(captures.Dequeue());yield return new WaitForSecondsRealtime(.18f);}capturing=false;}
  static JToken Copy(JToken token)=>token?.DeepClone();
  static JObject Sample(JObject s,NativeWildlifeAlert alert,NativeCombatFeedback combat){
   var ecology=s["ecology"];var animals=new JArray();foreach(var a in ecology?["animals"] as JArray??new JArray())animals.Add(new JObject{["id"]=Copy(a["id"]),["species"]=Copy(a["species"]),["position"]=Copy(a["position"]),["hp"]=Copy(a["hp"]),["mode"]=Copy(a["mode"]),["source"]=Copy(a["source"]),["intent"]=Copy(a["intent"])});
   var actors=new JObject();foreach(var a in (s["actors"] as JObject)?.Properties()??new JObject().Properties())actors[a.Name]=new JObject{["position"]=Copy(a.Value["position"]),["hp"]=Copy(a.Value["body"]?["hp"])};
   return new JObject{["tick"]=Copy(s["tick"]),["ecology"]=new JObject{["animals"]=animals,["time"]=Copy(ecology?["time"]),["tide"]=Copy(ecology?["tide"]),["population"]=Copy(ecology?["population"]),["metrics"]=Copy(ecology?["metrics"]),["model"]=Copy(ecology?["model"]),["policyError"]=Copy(ecology?["policyError"])},["fenceHp"]=Copy(s["economy"]?["fence"]?["hp"]),["actors"]=actors,["damageFeedbacks"]=combat?.DamageCount??0,["lastDamageTarget"]=combat?.LastTarget,["lastDamageAmount"]=combat?.LastAmount??0,["banner"]=alert?.BannerVisible??false,["announcements"]=alert?.AnnouncementCount??0,["managedBytes"]=GC.GetTotalMemory(false)};
  }
  IEnumerator Start(){
   if(Environment.GetEnvironmentVariable("CAMP_WILDLIFE_TIDE_PROBE")!="1")yield break;var output=Environment.GetEnvironmentVariable("CAMP_WILDLIFE_TIDE_AUDIT");if(string.IsNullOrEmpty(output))yield break;
   Directory.CreateDirectory(output);var file=Path.Combine(output,"wildlife-tide-probe.jsonl");var ui=GetComponent<NativeVillageUi>();var start=Time.realtimeSinceStartup;var shot=false;var lastShot="";var combatShot=false;long lastTick=-1;
   while(Time.realtimeSinceStartup-start<300){yield return new WaitForSecondsRealtime(1f);var s=ui.Snapshot;if(s==null||NativeStartup.Active)continue;var alert=GetComponent<NativeWildlifeAlert>();var phase=(string)s["ecology"]?["tide"]?["alert"]?["phase"]??"none";
    if(alert!=null&&alert.BannerVisible&&phase!=lastShot&&alert.AlertTitle==(string)s["ecology"]?["tide"]?["alert"]?["title"]){yield return new WaitForEndOfFrame();Capture(Path.Combine(output,shot?"wildlife-alert-"+phase+".png":"wildlife-alert.png"));shot=true;lastShot=phase;StartCoroutine(MotionFrames(output,phase));}
    var combat=GetComponent<NativeCombatFeedback>();if(!combatShot&&combat!=null&&combat.DamageCount>0){yield return new WaitForEndOfFrame();Capture(Path.Combine(output,"combat-damage.png"));combatShot=true;}
    var tick=(long?)s["tick"]??0;if(tick==lastTick)continue;lastTick=tick;
    // Keep one compact sample in memory; never reparent/clone the growing history.
    File.AppendAllText(file,Sample(s,alert,combat).ToString(Formatting.None)+"\n");
   }
  }
  IEnumerator MotionFrames(string output,string phase){for(var i=0;i<3;i++){yield return new WaitForSecondsRealtime(i==0?.12f:.4f);yield return new WaitForEndOfFrame();Capture(Path.Combine(output,"wildlife-"+phase+"-motion-"+i+".png"));}}
 }
}
