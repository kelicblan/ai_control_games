using System;
using System.Collections;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace CampMind.Presentation
{
    // Presentation preview only. M2 connects this view to the single TS authority.
    public sealed class NativeCampView : MonoBehaviour
    {
        public Transform lord;
        public Camera viewCamera;
        public Light sun;
        public ParticleSystem rain;
        public Transform[] characters;
        public Vector3 focus = new Vector3(50, 0, 65);
        public float yaw = 0, pitch = 52, distance = 260;
        public bool lordView, storm;
        public float day = .42f;
        private bool focused = true;
        private Vector2 movement;
        private Vector3 velocity;
        private float frameSeconds, sampleSeconds;
        private int frames;
        private bool probing;
        private Animator lordAnimator;
        private string activeClip;
        private TsWorldBridge bridge;
        private JObject world;
        private readonly Dictionary<string,Vector3> targets=new Dictionary<string,Vector3>();
        private readonly Dictionary<string,string> actions=new Dictionary<string,string>();
        private readonly Dictionary<string,string> actorClips=new Dictionary<string,string>();
        private string selected="azhuang";
        private float nextMotion;
        private NativeWeatherView weatherView;
        public Transform Selection=>characters.FirstOrDefault(actor=>actor.name==selected&&actor.gameObject.activeSelf)??lord;

        private void Start()
        {
            lordAnimator = lord.GetComponentInChildren<Animator>();
            weatherView=GetComponent<NativeWeatherView>();
            if (!probing && PlayerPrefs.HasKey("camp.native.camera")) {
                try { var v=JsonConvert.DeserializeObject<float[]>(PlayerPrefs.GetString("camp.native.camera"));
                    if(v?.Length==7 && Array.TrueForAll(v,float.IsFinite)) {focus=new Vector3(v[0],v[1],v[2]);yaw=v[3];pitch=Mathf.Clamp(v[4],15,80);distance=Mathf.Clamp(v[5],18,750);lordView=v[6]>0;}
                } catch { /* Invalid camera preferences do not touch the world/save. */ }
            }
            var args=Environment.GetCommandLineArgs();var i=Array.IndexOf(args,"-campmind-scene-probe");
            if(i>=0 && i+1<args.Length){if(Array.IndexOf(args,"-batchmode")>=0){Debug.LogError("Visual probe requires a rendered window; batch mode evidence is invalid");Application.Quit(2);return;}probing=true;StartCoroutine(Probe(Path.GetFullPath(args[i+1])));}
            var endpoint=Array.IndexOf(args,"-campmind-world-url");var identity=Array.IndexOf(args,"-campmind-player");
            if(endpoint>=0&&identity>=0&&endpoint+1<args.Length&&identity+1<args.Length){bridge=gameObject.AddComponent<TsWorldBridge>();bridge.Published+=PublishWorld;bridge.Connect(args[endpoint+1],args[identity+1]);}
            var bridgeProbe=Array.IndexOf(args,"-campmind-bridge-probe");if(bridgeProbe>=0&&bridgeProbe+1<args.Length){probing=true;StartCoroutine(ProbeBridge(Path.GetFullPath(args[bridgeProbe+1])));}
            var aiProbe=Array.IndexOf(args,"-campmind-ai-probe");if(aiProbe>=0&&aiProbe+1<args.Length){probing=true;StartCoroutine(ProbeAi(Path.GetFullPath(args[aiProbe+1])));}
            var frameProbe=Array.IndexOf(args,"-campmind-frame-probe");if(frameProbe>=0&&frameProbe+4<args.Length){probing=true;var probe=gameObject.AddComponent<NativeFrameProbe>();probe.view=this;StartCoroutine(probe.Run(Path.GetFullPath(args[frameProbe+1]),args[frameProbe+2],float.Parse(args[frameProbe+3],System.Globalization.CultureInfo.InvariantCulture),float.Parse(args[frameProbe+4],System.Globalization.CultureInfo.InvariantCulture)));}
        }
        private void OnApplicationFocus(bool value){focused=value;movement=Vector2.zero;if(!value)bridge?.ReleaseMotion();}
        private void OnApplicationQuit(){if(!probing){PlayerPrefs.SetString("camp.native.camera",JsonConvert.SerializeObject(new[]{focus.x,focus.y,focus.z,yaw,pitch,distance,lordView?1f:0f}));PlayerPrefs.Save();}}
        private void Update()
        {
            frames++;frameSeconds+=Time.unscaledDeltaTime;sampleSeconds+=Time.unscaledDeltaTime;
            if(focused&&!probing){
                var k=Keyboard.current;var m=Mouse.current;
                if(k!=null){
                    if(k.tabKey.wasPressedThisFrame){lordView=!lordView;bridge?.ReleaseMotion();}
                    if(k.f6Key.wasPressedThisFrame){if(bridge==null)storm=!storm;else Command("weather",new JObject{["weather"]=storm?"clear":"storm"});}
                    if(k.f7Key.wasPressedThisFrame&&bridge==null)day=day>.25f?.05f:.42f;
                    movement=new Vector2((k.dKey.isPressed?1:0)-(k.aKey.isPressed?1:0),(k.wKey.isPressed?1:0)-(k.sKey.isPressed?1:0));
                    if(k.homeKey.wasPressedThisFrame){focus=new Vector3(50,0,65);distance=260;yaw=0;pitch=52;}
                }
                if(m!=null){
                    if(m.rightButton.isPressed){var d=m.delta.ReadValue();yaw+=d.x*.2f;pitch=Mathf.Clamp(pitch-d.y*.15f,15,80);}
                    distance=Mathf.Clamp(distance-m.scroll.ReadValue().y*.1f,18,750);
                }
                if(lordView){if(bridge==null)MovePreview(movement,Time.unscaledDeltaTime);else if(Time.realtimeSinceStartup>=nextMotion){var d=Quaternion.Euler(0,yaw,0)*new Vector3(movement.x,0,movement.y);bridge.SendMotion(new Vector2(d.x,d.z));nextMotion=Time.realtimeSinceStartup+.1f;}}
                else {var rotation=Quaternion.Euler(0,yaw,0);focus+=rotation*new Vector3(movement.x,0,movement.y)*Time.unscaledDeltaTime*distance*.45f;}
            }
            var emission=rain.emission;emission.rateOverTime=storm?3500:0;
            if(storm&&!rain.isPlaying)rain.Play();
            rain.transform.position=(lordView?lord.position:focus)+Vector3.up*40;
            if(bridge==null)day=Mathf.Repeat(day+Time.deltaTime/900,1);else PresentWorld();
            sun.transform.rotation=Quaternion.Euler(day*360-90,140,0);
            var daylight=world!=null?(float)NativeSolarView.Daylight((double)world["elapsed"]):Mathf.Clamp01(Mathf.Sin(day*Mathf.PI*2));sun.intensity=Mathf.Lerp(.12f,1.3f,daylight)*(storm?.5f:1);
            RenderSettings.ambientLight=Color.Lerp(new Color(.12f,.16f,.24f),new Color(.65f,.7f,.72f),daylight);
            viewCamera.backgroundColor=storm?new Color(.27f,.34f,.39f):Color.Lerp(new Color(.04f,.07f,.13f),new Color(.62f,.77f,.85f),daylight);
            RenderSettings.fogColor=viewCamera.backgroundColor;
            weatherView?.Conditions(world!=null?(float)world["atmosphere"]["windStrength"]:storm?.7f:.12f,world!=null?(float)world["atmosphere"]["windAngle"]:.5f,world!=null?(double)world["atmosphere"]["lightningAt"]:storm?Math.Floor(Time.time/15)*15:0);
            if(lordAnimator!=null&&bridge==null){var next=velocity.sqrMagnitude>.01f?"Walk":"Idle";if(next!=activeClip){lordAnimator.CrossFade(next,.15f);activeClip=next;}}
            velocity=Vector3.zero;
        }
        public void MovePreview(Vector2 input,float dt)
        {
            input=Vector2.ClampMagnitude(input,1);var delta=Quaternion.Euler(0,yaw,0)*new Vector3(input.x,0,input.y)*(8*dt);
            if(delta.sqrMagnitude<.000001f)return;
            // Preview only: no inventory, world ticks or game saves are written here.
            var point=lord.position+delta;
            if(Physics.CheckCapsule(point+Vector3.up*1.5f,point+Vector3.up*5.5f,1.2f,1<<8))return;
            if(Physics.Raycast(point+Vector3.up*400,Vector3.down,out var hit,800,1<<9)){
                if(hit.normal.y<.5f)return;point.y=hit.point.y;lord.position=point;lord.rotation=Quaternion.LookRotation(delta);velocity=delta;
            }
        }
        private void LateUpdate()
        {
            var target=lordView?lord.position+Vector3.up*5:focus;
            var length=lordView?Mathf.Clamp(distance*.12f,18,45):distance;
            var rotation=Quaternion.Euler(lordView?Mathf.Clamp(pitch*.45f,12,35):pitch,yaw,0);
            var desired=target-rotation*Vector3.forward*length;
            if(lordView&&Physics.Linecast(target,desired,out var hit,(1<<8)|(1<<9)))desired=hit.point+hit.normal*1.2f;
            viewCamera.transform.position=desired;viewCamera.transform.LookAt(target);
        }
        private void OnGUI()
        {
            if(bridge!=null){DrawWorldHud();return;}
            GUI.Box(new Rect(15,15,560,66),"CampMind native scene preview | game authority not connected\nTab: camera  WASD: move/pan  RMB: orbit  Wheel: zoom\nF6: storm  F7: day/night  Home: reset camera");
        }
        private void Command(string type,JObject values=null){var command=values??new JObject();command["type"]=type;bridge.Enqueue(new JObject{["type"]="command",["command"]=command});}
        public bool GateOpen=>(bool?)world?["world"]?["gateOpen"]??true;
        private void PublishWorld(JObject snapshot)
        {
            world=snapshot["state"] as JObject;GetComponentInChildren<NativeWildernessView>()?.SetSnapshot(world);if(world==null){targets.Clear();return;}
            void Target(string id,JToken point){if(point==null)return;var pos=new Vector3((float)point["x"],0,(float)point["y"]);if(Physics.Raycast(pos+Vector3.up*500,Vector3.down,out var hit,1000,1<<9))pos.y=hit.point.y;targets[id]=pos;}
            Target("lord",world["lord"]?["position"]);
            foreach(var npc in world["npcs"]??new JArray()){var id=(string)npc["id"];Target(id,npc["position"]);actions[id]=(bool?)npc["alive"]==false?"dead":(string)npc["action"]??"Idle";}
            storm=(string)world["weather"]=="storm"||(float?)world["atmosphere"]?["rainIntensity"]>.3f;
            var cycle=(float)world["elapsed"]%600;day=Mathf.Repeat(cycle<420?.25f+cycle/420*.5f:.75f+(cycle-420)/180*.5f,1);
        }
        private void PresentWorld()
        {
            foreach(var actor in characters){if(!targets.TryGetValue(actor.name,out var target))continue;var before=actor.position;actor.position=Vector3.Lerp(before,target,1-Mathf.Exp(-Time.unscaledDeltaTime*15));var delta=actor.position-before;
                var moving=delta.sqrMagnitude>.000001f;if(moving)actor.rotation=Quaternion.LookRotation(new Vector3(delta.x,0,delta.z));
                var action=actions.TryGetValue(actor.name,out var value)?value:"";var next=moving?"Walk":action=="wood"?"Work":action=="food"||action=="eat"?"Gather":action=="rest"?"Rest":"Idle";
                if(actor.name=="lord"&&next!="Walk")next="Idle";var animator=actor.GetComponentInChildren<Animator>();
                animator.speed=(string)world["status"]=="playing"?1:0;
                if(!actorClips.TryGetValue(actor.name,out var current)||current!=next){animator.CrossFade(next,.15f);actorClips[actor.name]=next;}
                if(action=="dead"){animator.speed=0;actor.rotation=Quaternion.Euler(0,actor.eulerAngles.y,90);actor.position=target+Vector3.up*.67f;}
            }
        }
        private void DrawWorldHud()
        {
            GUILayout.BeginArea(new Rect(15,15,560,580),GUI.skin.box);
            GUILayout.Label("CampMind | Native playable slice");
            if(world==null){GUILayout.Label(bridge.Error);if(bridge.Connected&&GUILayout.Button("Create independent test world"))bridge.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17}});GUILayout.EndArea();return;}
            GUILayout.Label($"Day {world["day"]}  Food {world["food"]}  Wood {world["wood"]}  Fire {world["fire"]}  Weather {world["weather"]}");
            GUILayout.Label($"Revision {bridge.gate.Revision} | {(bridge.Connected?"Connected":"Reconnecting")} | {bridge.Error}");
            GUILayout.BeginHorizontal();if(GUILayout.Button("Pause / Resume"))bridge.Enqueue(new JObject{["type"]="pause",["paused"]=(string)world["status"]=="playing"});
            if(GUILayout.Button("Storm / Clear"))Command("weather",new JObject{["weather"]=storm?"clear":"storm"});if(GUILayout.Button("1x"))bridge.Enqueue(new JObject{["type"]="speed",["speed"]=1});if(GUILayout.Button("3x"))bridge.Enqueue(new JObject{["type"]="speed",["speed"]=3});GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();foreach(var npc in world["npcs"]){var id=(string)npc["id"];if(GUILayout.Button(id))selected=id;}GUILayout.EndHorizontal();
            foreach(var npc in world["npcs"])if((string)npc["id"]==selected){GUILayout.Label($"{selected}: {npc["action"]} | Health {npc["health"]:0} Hunger {npc["hunger"]:0} Energy {npc["energy"]:0}");GUILayout.Label((string)npc["speech"]??"");}
            GUILayout.BeginHorizontal();foreach(var action in new[]{"food","wood","eat","rest","camp","explore"})if(GUILayout.Button(action))Command("assign",new JObject{["npcId"]=selected,["action"]=action});GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();if(GUILayout.Button("Feed"))Command("feed",new JObject{["npcId"]=selected});if(GUILayout.Button("Praise"))Command("praise",new JObject{["npcId"]=selected});if(GUILayout.Button("Recall"))Command("recall");if(GUILayout.Button("Gate"))Command("gate-toggle");GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();if(GUILayout.Button("MiniMind3"))bridge.Enqueue(new JObject{["type"]="agency-model",["modelId"]="minimind3"});
            if(GUILayout.Button("Local Qwen 0.8B"))bridge.Enqueue(new JObject{["type"]="agency-model",["modelId"]="native:qwen3.5-0.8b"});
            if(GUILayout.Button("Local Qwen 2B"))bridge.Enqueue(new JObject{["type"]="agency-model",["modelId"]="native:qwen3.5-2b"});
            if(GUILayout.Button("Talk"))Command("social-open",new JObject{["npcId"]=selected});GUILayout.EndHorizontal();
            GUILayout.Label("Model: "+(string)world["agency"]?["modelId"]);
            foreach(var message in (world["socialLife"]?["messages"]??new JArray()).Reverse().Take(4).Reverse())GUILayout.Label($"{message["from"]} [{message["source"]}]: {message["text"]}");
            foreach(var set in world["socialLife"]?["choices"]??new JArray())if((string)set["npcId"]==selected&&(double)set["expiresAt"]>=(double)world["elapsed"])foreach(var choice in set["options"])
                if(GUILayout.Button((string)choice["text"]))bridge.Enqueue(new JObject{["type"]="social-choice",["setId"]=(string)set["id"],["choiceId"]=(string)choice["id"],["scope"]=bridge.gate.Scope});
            GUILayout.BeginHorizontal();GUILayout.Label("Quality (native resolution):");for(var level=0;level<3;level++)if(GUILayout.Button(new[]{"Low","Medium","High"}[level]))GetComponent<NativeQualityView>().Apply(level);GUILayout.EndHorizontal();
            GUILayout.Label("Tab: camera  WASD: move/pan  RMB: orbit  Wheel: zoom");GUILayout.EndArea();
        }
        private IEnumerator Probe(string directory)
        {
            Directory.CreateDirectory(directory);focus=new Vector3(50,0,65);distance=320;yaw=0;pitch=52;lordView=false;day=.42f;
            yield return new WaitForSeconds(3);
            var bones=lord.GetComponentInChildren<SkinnedMeshRenderer>().bones;var rotations=new Quaternion[bones.Length];for(var b=0;b<bones.Length;b++)rotations[b]=bones[b].localRotation;
            yield return new WaitForSeconds(.3f);var animatedBones=0;for(var b=0;b<bones.Length;b++)if(Quaternion.Angle(rotations[b],bones[b].localRotation)>.01f)animatedBones++;
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"camp-overview.png"));
            yield return new WaitForSeconds(1);lordView=true;distance=260;
            var before=lord.position;for(var t=0f;t<2;t+=Time.deltaTime){MovePreview(Vector2.up,Time.deltaTime);yield return null;}
            yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"lord-view.png"));
            storm=true;yield return new WaitForSeconds(2);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"storm.png"));
            day=.05f;yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"night.png"));
            yield return new WaitForSeconds(1);
            var movementDistance=Vector3.Distance(before,lord.position);
            var indoors=GetComponent<NativeInteriorView>();var room=indoors.rooms.First(r=>r.id=="lord-house");
            storm=true;day=.42f;lordView=true;lord.position=room.center+Vector3.up*.1f;yaw=180;pitch=25;yield return new WaitForSeconds(1);
            indoors.Observe(lord.position);var interiorVisible=room.interior.activeSelf&&room.exterior.All(r=>!r.enabled);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"interior.png"));yield return new WaitForSeconds(1);
            lord.position=new Vector3(50,0,65);lordView=false;focus=lord.position;yield return new WaitForSeconds(.5f);indoors.Observe(lord.position);
            var exteriorRestored=room.exterior.All(r=>r.enabled)&&!room.interior.activeSelf;
            var result=new{version=1,kind="native-presentation-preview",characters=characters.Length,skinnedMeshes=FindObjectsByType<SkinnedMeshRenderer>(FindObjectsSortMode.None).Length,
                graphicsApi=SystemInfo.graphicsDeviceType.ToString(),moved=movementDistance,frames,averageFrameMs=frameSeconds/Mathf.Max(1,frames)*1000,
                stormParticles=rain.particleCount,animatedBones,interiorVisible,exteriorRestored,authorityConnected=false};
            File.WriteAllText(Path.Combine(directory,"result.json"),JsonConvert.SerializeObject(result,Formatting.Indented));Application.Quit();
        }
        private IEnumerator ProbeBridge(string directory)
        {
            Directory.CreateDirectory(directory);var deadline=Time.realtimeSinceStartup+20;
            while(bridge!=null&&!bridge.Connected&&Time.realtimeSinceStartup<deadline)yield return null;
            if(bridge==null||!bridge.Connected){BridgeFailure(directory,"World bridge did not connect");yield break;}
            if(world==null)bridge.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17}});
            while(world==null&&Time.realtimeSinceStartup<deadline)yield return null;
            if(world==null){BridgeFailure(directory,"World was not created");yield break;}
            var initialElapsed=(double)world["elapsed"];var initialRevision=bridge.gate.Revision;
            bridge.Enqueue(new JObject{["type"]="agency-settings",["enabled"]=true,["cognition"]=false,["modelId"]=(string)world["agency"]?["modelId"]??"minimind3"});
            if((string)world["status"]!="playing")bridge.Enqueue(new JObject{["type"]="pause",["paused"]=false});
            yield return new WaitForSecondsRealtime(1);
            var start=lord.position;var npcStart=characters[1].position;
            Command("assign",new JObject{["npcId"]="azhuang",["action"]="food"});
            lordView=true;
            for(var n=0;n<20;n++){bridge.SendMotion(Vector2.up);yield return new WaitForSecondsRealtime(.1f);}
            bridge.ReleaseMotion();yield return new WaitForSecondsRealtime(1);
            var stopped=lord.position;yield return new WaitForSecondsRealtime(.6f);var drift=Vector3.Distance(stopped,lord.position);
            var motionDistance=Vector3.Distance(start,lord.position);var npcDistance=Vector3.Distance(npcStart,characters[1].position);
            var bones=lord.GetComponentInChildren<SkinnedMeshRenderer>().bones;var rotations=new Quaternion[bones.Length];for(var b=0;b<bones.Length;b++)rotations[b]=bones[b].localRotation;
            yield return new WaitForSecondsRealtime(.31f);var animatedBones=0;for(var b=0;b<bones.Length;b++)if(Quaternion.Angle(rotations[b],bones[b].localRotation)>.01f)animatedBones++;
            Command("weather",new JObject{["weather"]="storm"});yield return new WaitForSecondsRealtime(1);
            bridge.Enqueue(new JObject{["type"]="pause",["paused"]=true});yield return new WaitForSecondsRealtime(.6f);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"native-slice.png"));yield return new WaitForSecondsRealtime(.5f);
            var wilderness=GetComponentInChildren<NativeWildernessView>();var sourceResources=world["world"]["ecology"]["resources"].Count();var sourceAnimals=world["world"]["ecology"]["animals"].Count();
            var ecologyProjected=wilderness!=null&&wilderness.ResourceSnapshotCount==sourceResources&&wilderness.AnimalSnapshotCount==sourceAnimals&&wilderness.resources.Any(r=>r.root.gameObject.activeSelf);
            var success=bridge.Connected&&motionDistance>1&&drift<.5f&&bridge.gate.Revision>initialRevision&&(double)world["elapsed"]>initialElapsed&&ecologyProjected;
            var report=new{version=1,success,authority="typescript",scope=bridge.gate.Scope,revision=bridge.gate.Revision,initialRevision,initialElapsed,elapsed=(double)world["elapsed"],motionDistance,inputReleaseDrift=drift,npcDistance,animatedBones,ecologyProjected,sourceResources,sourceAnimals,weather=(string)world["weather"],socialMode="offline-test",error=bridge.Error};
            File.WriteAllText(Path.Combine(directory,"bridge-result.json"),JsonConvert.SerializeObject(report,Formatting.Indented));Application.Quit(success?0:1);
        }
        private void BridgeFailure(string directory,string error){File.WriteAllText(Path.Combine(directory,"bridge-result.json"),JsonConvert.SerializeObject(new{version=1,success=false,error}));Application.Quit(1);}
        private IEnumerator ProbeAi(string directory)
        {
            Directory.CreateDirectory(directory);var deadline=Time.realtimeSinceStartup+20;
            while(bridge!=null&&!bridge.Connected&&Time.realtimeSinceStartup<deadline)yield return null;
            if(bridge==null||!bridge.Connected){AiFailure(directory,"Authority did not connect");yield break;}
            if(world==null)bridge.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17}});
            while(world==null&&Time.realtimeSinceStartup<deadline)yield return null;
            if(world==null){AiFailure(directory,"No test world");yield break;}
            selected="azhuang";
            var args=Environment.GetCommandLineArgs();var modelIndex=Array.IndexOf(args,"-campmind-ai-model");var modelId=modelIndex>=0&&modelIndex+1<args.Length?args[modelIndex+1]:"native:qwen3.5-2b";
            bridge.Enqueue(new JObject{["type"]="agency-settings",["enabled"]=true,["cognition"]=false,["modelId"]=modelId});
            bridge.Enqueue(new JObject{["type"]="pause",["paused"]=false});Command("assign",new JObject{["npcId"]=selected,["action"]="food"});
            yield return new WaitForSecondsRealtime(2.5f);
            bridge.Enqueue(new JObject{["type"]="pause",["paused"]=true});bridge.Enqueue(new JObject{["type"]="agency-model",["modelId"]=modelId});
            deadline=Time.realtimeSinceStartup+15;
            while(((string)world["agency"]?["modelId"]!=modelId||(string)world["status"]!="paused"||(bool?)world["agency"]?["cognition"]!=true)&&Time.realtimeSinceStartup<deadline)yield return null;
            var sequence=(long?)world["socialLife"]?["sequence"]??0;
            var oldIds=new HashSet<string>((world["socialLife"]?["messages"]??new JArray()).Select(m=>(string)m["id"]));
            Command("social-open",new JObject{["npcId"]=selected});
            JObject reply=null;deadline=Time.realtimeSinceStartup+85;
            while(reply==null&&Time.realtimeSinceStartup<deadline){
                reply=(world["socialLife"]?["messages"]??new JArray()).OfType<JObject>().FirstOrDefault(m=>(string)m["from"]==selected&&(string)m["source"]==modelId&&!oldIds.Contains((string)m["id"])&&m["replyTo"]!=null);
                if(reply==null)yield return new WaitForSecondsRealtime(.2f);
            }
            if(reply==null){AiFailure(directory,"No accepted actual-model reply in deadline");yield break;}
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"native-ai.png"));yield return new WaitForSecondsRealtime(.5f);
            File.WriteAllText(Path.Combine(directory,"ai-result.json"),JsonConvert.SerializeObject(new{version=1,success=true,authority="typescript",scope=bridge.gate.Scope,revision=bridge.gate.Revision,dialogueId=(string)reply["id"],replyTo=(string)reply["replyTo"],source=(string)reply["source"],text=(string)reply["text"],workAction=(string)world["npcs"].First(n=>(string)n["id"]==selected)["action"],sequenceBefore=sequence},Formatting.Indented));Application.Quit();
        }
        private void AiFailure(string directory,string error){File.WriteAllText(Path.Combine(directory,"ai-result.json"),JsonConvert.SerializeObject(new{version=1,success=false,error,bridgeError=bridge?.Error,model=(string)world?["agency"]?["modelId"]}));Application.Quit(1);}
    }
}
