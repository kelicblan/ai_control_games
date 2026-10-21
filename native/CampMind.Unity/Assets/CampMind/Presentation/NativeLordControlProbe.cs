using System;
using System.IO;
using System.Collections;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace CampMind.Presentation
{
    // Explicitly installed by the editor audit. No startup hooks or save mutations.
    public sealed class NativeLordControlProbe:MonoBehaviour
    {
        string output;
        public void Begin(string directory){output=directory;StartCoroutine(Run());}
        IEnumerator Run()
        {
            var ui=GetComponent<NativeVillageUi>();var view=GetComponent<NativeCampView>();float deadline=Time.realtimeSinceStartup+180;
            while(ui.Snapshot==null||(long?)ui.Snapshot["catchupTicks"]>0||!ui.VillageActive||NativeStartup.Active||view.InputBlocked)
            {
                if(Time.realtimeSinceStartup>deadline){Write(new JObject{["success"]=false,["reason"]="world not ready",["remaining"]=ui.Snapshot?["catchupTicks"]});yield break;}
                yield return new WaitForSecondsRealtime(.2f);
            }
            if((bool?)ui.Snapshot["paused"]==true){Write(new JObject{["success"]=false,["reason"]="world paused"});yield break;}
            bool priorMode=view.lordView;view.lordView=true;
            var initial=ui.Snapshot["actors"]["player"]["position"];
            var forward=NativeCameraProfile.LogicalMove(Vector2.up,view.lordYaw);
            var grid=JObject.Parse(File.ReadAllText(Path.GetFullPath(Path.Combine(Application.dataPath,"../../../native/ArtSource/new-world-runtime.json"))));
            Vector2 setupTarget=Vector2.zero;bool found=false;
            for(int i=0;i<32;i++){float angle=i*Mathf.PI/16;var direction=new Vector2(forward.x*Mathf.Cos(angle)-forward.y*Mathf.Sin(angle),forward.x*Mathf.Sin(angle)+forward.y*Mathf.Cos(angle));var p=new Vector2((float)initial["x"],(float)initial["y"])-direction*18;int x=Mathf.RoundToInt((p.x-(float)grid["minX"])/(float)grid["step"]),y=Mathf.RoundToInt((p.y-(float)grid["minY"])/(float)grid["step"]);if(x<0||y<0||x>=(int)grid["width"]||y>=(int)grid["height"]||(int)grid["walkable"][y*(int)grid["width"]+x]!=1)continue;setupTarget=p;found=true;break;}
            if(!found){Write(new JObject{["success"]=false,["reason"]="no accessible existing-movement target"});yield break;}
            var setupOperation="controls-existing-"+Guid.NewGuid().ToString("N");
            ui.Command("REPOSITION",null,new JObject{["x"]=setupTarget.x,["y"]=setupTarget.y},setupOperation);
            string priorTask=null;float setupUntil=Time.realtimeSinceStartup+5;
            while(Time.realtimeSinceStartup<setupUntil)
            {
                priorTask=(ui.Snapshot["executions"] as JObject)?.Properties().FirstOrDefault(p=>(string)p.Value["command"]?["operationId"]==setupOperation&&new[]{"accepted","running"}.Contains((string)p.Value["status"]))?.Name;
                if(priorTask!=null)break;yield return null;
            }
            if(priorTask==null){Write(new JObject{["success"]=false,["reason"]="existing movement setup did not start",["error"]=ui.Error});yield break;}
            var before=ui.Snapshot["actors"]["player"]["position"].DeepClone();var renderedBefore=view.lord.position;
            var previousBehavior=InputSystem.settings.backgroundBehavior;var keyboard=InputSystem.AddDevice<Keyboard>();
            try
            {
                InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;
                InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.W));yield return new WaitForSecondsRealtime(3);
                InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;
            }
            finally{InputSystem.RemoveDevice(keyboard);InputSystem.settings.backgroundBehavior=previousBehavior;}
            yield return new WaitForSecondsRealtime(.8f);
            var after=ui.Snapshot["actors"]["player"]["position"].DeepClone();float dx=(float)after["x"]-(float)before["x"],dy=(float)after["y"]-(float)before["y"];
            var distance=Mathf.Sqrt(dx*dx+dy*dy);var rendered=Vector2.Distance(new Vector2(renderedBefore.x,renderedBefore.z),new Vector2(view.lord.position.x,view.lord.position.z));
            bool interrupted=priorTask!=null&&(string)ui.Snapshot["executions"]?[priorTask]?["status"]=="cancelled";
            Write(new JObject{["success"]=distance>.1f&&rendered>.1f&&interrupted,["inputSystemWKey"]=true,["interruptedExistingTask"]=interrupted,["cancellationDedupLoaded"]=typeof(NativeVillageUi).GetField("keyboardCancellingTask",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!=null,["before"]=before,["after"]=after,["authorityDistance"]=distance,["renderedDistance"]=rendered,["error"]=ui.Error,["inputBlocked"]=view.InputBlocked,["catchup"]=ui.Snapshot["catchupTicks"]});view.lordView=priorMode;
        }
        void Write(JObject data){File.WriteAllText(Path.Combine(output,"movement-validation.json"),data.ToString());Destroy(this);}
    }
}
