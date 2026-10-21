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
    // Native presentation; world rules and saves remain TS-authoritative until M4.
    [DefaultExecutionOrder(100)]
    public sealed class NativeCampView : MonoBehaviour
    {
        public Transform lord;
        public Camera viewCamera;
        public Light sun;
        public Light fill;
        public ParticleSystem rain;
        public Transform[] characters;
        public Vector2 logicalOrigin=new Vector2(50,50);
        public WorldVisualSpace Space=>new WorldVisualSpace(logicalOrigin);
        public Vector3 focus = new Vector3(0,1.5f,5);
        public float yaw=-.18f,pitch=.60f,zoom=.16f,lordYaw=.46f,lordPitch=.28f,lordDistance=24;
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
        private CampRenderFrame visual;
        private string presentedScope;
        private readonly Dictionary<string,Vector3> targets=new Dictionary<string,Vector3>();
        private readonly Dictionary<string,string> actions=new Dictionary<string,string>();
        private readonly Dictionary<string,bool> carrying=new Dictionary<string,bool>();
        private readonly Dictionary<string,string> actorClips=new Dictionary<string,string>();
        private readonly Dictionary<Transform,Bounds> actorGeometry=new Dictionary<Transform,Bounds>();
        private readonly Dictionary<Transform,Vector3> actorSoles=new Dictionary<Transform,Vector3>();
        private readonly Dictionary<Transform,SkinnedMeshRenderer[]> actorSkins=new Dictionary<Transform,SkinnedMeshRenderer[]>();
        private readonly Dictionary<SkinnedMeshRenderer,byte[]> footVertices=new Dictionary<SkinnedMeshRenderer,byte[]>();
        private readonly Dictionary<Transform,Vector3[]> actorFeet=new Dictionary<Transform,Vector3[]>();
        private readonly List<Vector3> bakedVertices=new List<Vector3>();
        private Mesh poseMesh;
        private string selected="azhuang";
        private float nextMotion;
        private NativeWeatherView weatherView;
        public TsWorldBridge Authority=>bridge;
        public JObject World=>world;
        public JObject EnvironmentPresentation {get;private set;}
        public void PresentVillageEnvironment(JObject state,JObject presentation){EnvironmentPresentation=presentation;ApplyWorldState(state);}
        public string SelectedNpc=>selected;
        public bool InputBlocked {get;set;}
        public bool ExternalInputDriver {get;set;}
        public bool HasInputFocus=>focused;
        public bool PointerBlocked {get;set;}
        public void ApplyPanInput(Vector2 delta,int height)
        {
            if(InputBlocked||PointerBlocked||lordView||viewCamera==null)return;
            var units=2*viewCamera.orthographicSize/Mathf.Max(1,height);var c=Mathf.Cos(yaw);var s=Mathf.Sin(yaw);var vertical=1/Mathf.Max(.2f,Mathf.Sin(pitch));
            var dy=-delta.y;focus+=Space.Direction(new Vector2(-(delta.x*c+dy*s*vertical)*units,-(-delta.x*s+dy*c*vertical)*units));
        }
        public void ApplyPointerInput(Vector2 delta,float scroll,bool rotate)
        {
            if(InputBlocked||PointerBlocked)return;
            if(rotate){if(lordView){lordYaw-=delta.x*.0055f;lordPitch=Mathf.Clamp(lordPitch-delta.y*.0034f,.08f,1.35f);}else{yaw-=delta.x*.0055f;pitch=Mathf.Clamp(pitch-delta.y*.0034f,.25f,1.35f);}}
            var factor=Mathf.Exp(-scroll*(lordView?.001f:.0013f));if(lordView)lordDistance=Mathf.Clamp(lordDistance*factor,10,650);else zoom=Mathf.Clamp(zoom/factor,GetComponent<NewWorldGameProfile>()?.06f:.15f,2.8f);
        }
        public void ApplyWheelInput(float delta,bool normalized)
        {
            if(!float.IsFinite(delta))return;
            // Input System normalizes a Windows notch from 120 to 1.
            // Browser wheel events in the source camera use 100 CSS pixels/notch.
            ApplyPointerInput(Vector2.zero,delta*(normalized?100f:100f/120f),false);
        }
        public void SelectNpc(string id){selected=id;SendCommand("select",new JObject{["npcId"]=id});}
        public string PickNpc(Ray ray)
        {
            string result=null;var nearest=float.PositiveInfinity;
            foreach(var actor in characters??Array.Empty<Transform>())
            {
                if(actor==null||actor==lord||!actor.gameObject.activeInHierarchy)continue;
                foreach(var renderer in actor.GetComponentsInChildren<SkinnedMeshRenderer>())
                    if(renderer.bounds.IntersectRay(ray,out var distance)&&distance<nearest){nearest=distance;result=actor.name;}
            }
            return result;
        }
        public void SendCommand(string type,JObject values=null){var village=GetComponent<NativeVillageUi>();if(village!=null&&village.HandleOriginalCommand(type,values))return;if(bridge!=null)Command(type,values);}
        public Transform Selection=>characters.FirstOrDefault(actor=>actor.name==selected&&actor.gameObject.activeSelf)??lord;
        public double VisualTime=>visual?.Elapsed??Time.timeAsDouble;
        public bool WorldPaused=>visual!=null&&visual.Status!="playing";

        private void Start()
        {
            lordAnimator = lord.GetComponentInChildren<Animator>();
            weatherView=GetComponent<NativeWeatherView>();
            if (!probing && PlayerPrefs.HasKey((GetComponent<NewWorldGameProfile>()?"camp.native.camera.new-world.v1":"camp.native.camera.v2"))) {
                try { var v=JsonConvert.DeserializeObject<float[]>(PlayerPrefs.GetString((GetComponent<NewWorldGameProfile>()?"camp.native.camera.new-world.v1":"camp.native.camera.v2")));
                    if(v?.Length==10 && Array.TrueForAll(v,float.IsFinite)) {focus=new Vector3(v[0],v[1],v[2]);yaw=v[3];pitch=Mathf.Clamp(v[4],.25f,1.35f);zoom=Mathf.Clamp(v[5],GetComponent<NewWorldGameProfile>()?.06f:.15f,2.8f);lordYaw=v[6];lordPitch=Mathf.Clamp(v[7],.08f,1.35f);lordDistance=Mathf.Clamp(v[8],10,650);lordView=v[9]>0;}
                } catch { /* Invalid camera preferences do not touch the world/save. */ }
            }
            var args=Environment.GetCommandLineArgs();var i=Array.IndexOf(args,"-campmind-scene-probe");
            if(i>=0 && i+1<args.Length){if(Array.IndexOf(args,"-batchmode")>=0){Debug.LogError("Visual probe requires a rendered window; batch mode evidence is invalid");Application.Quit(2);return;}probing=true;StartCoroutine(Probe(Path.GetFullPath(args[i+1])));}
            var endpoint=Array.IndexOf(args,"-campmind-world-url");var identity=Array.IndexOf(args,"-campmind-player");
            if(endpoint>=0&&identity>=0&&endpoint+1<args.Length&&identity+1<args.Length)ConnectAuthority(args[endpoint+1],args[identity+1]);
            var bridgeProbe=Array.IndexOf(args,"-campmind-bridge-probe");if(bridgeProbe>=0&&bridgeProbe+1<args.Length){probing=true;StartCoroutine(ProbeBridge(Path.GetFullPath(args[bridgeProbe+1])));}
            var aiProbe=Array.IndexOf(args,"-campmind-ai-probe");if(aiProbe>=0&&aiProbe+1<args.Length){probing=true;StartCoroutine(ProbeAi(Path.GetFullPath(args[aiProbe+1])));}
            var frameProbe=Array.IndexOf(args,"-campmind-frame-probe");if(frameProbe>=0&&frameProbe+4<args.Length){probing=true;var probe=gameObject.AddComponent<NativeFrameProbe>();probe.view=this;StartCoroutine(probe.Run(Path.GetFullPath(args[frameProbe+1]),args[frameProbe+2],float.Parse(args[frameProbe+3],System.Globalization.CultureInfo.InvariantCulture),float.Parse(args[frameProbe+4],System.Globalization.CultureInfo.InvariantCulture)));}
            var valleyProbe=Array.IndexOf(args,"-campmind-valley-probe");if(valleyProbe>=0&&valleyProbe+1<args.Length){probing=true;gameObject.AddComponent<NativeValleyCapture>().Begin(this,args[valleyProbe+1]);}
            if(!probing&&!NativeStartup.Active)CompleteStartup();
            var uiProbe=Array.IndexOf(args,"-campmind-ui-probe");if(uiProbe>=0&&uiProbe+1<args.Length){probing=true;gameObject.AddComponent<NativeUiProbe>().Begin(this,Path.GetFullPath(args[uiProbe+1]));}
        }
        public void CompleteStartup()
        {
            if(probing)return;
            if(GetComponent<NativeGameAudio>()==null)gameObject.AddComponent<NativeGameAudio>().Initialize(this);
            if(GetComponent<NativeGameUi>()==null)gameObject.AddComponent<NativeGameUi>().Initialize(this);
        }
        public void ConnectAuthority(string endpoint,string player)
        {
            if(bridge!=null)return;
            bridge=gameObject.AddComponent<TsWorldBridge>();bridge.Published+=PublishWorld;bridge.Connect(endpoint,player);
        }
        private void OnApplicationFocus(bool value){focused=value;movement=Vector2.zero;if(!value)bridge?.ReleaseMotion();}
        private void OnApplicationQuit(){if(!probing){PlayerPrefs.SetString((GetComponent<NewWorldGameProfile>()?"camp.native.camera.new-world.v1":"camp.native.camera.v2"),JsonConvert.SerializeObject(new[]{focus.x,focus.y,focus.z,yaw,pitch,zoom,lordYaw,lordPitch,lordDistance,lordView?1f:0f}));PlayerPrefs.Save();}}
        private void Update()
        {
            if(bridge!=null){bridge.AudioListener=Space.ToLogical(lordView?lord.position:Selection.position);bridge.AudioRight=Space.LogicalDirection(viewCamera.transform.right).normalized;bridge.HasAudioListener=true;}
            frames++;frameSeconds+=Time.unscaledDeltaTime;sampleSeconds+=Time.unscaledDeltaTime;
            if(focused&&!probing&&!ExternalInputDriver&&!InputBlocked&&!NativeStartup.Active){
                var k=Keyboard.current;var m=Mouse.current;
                if(k!=null){
                    if(k.tabKey.wasPressedThisFrame){lordView=!lordView;bridge?.ReleaseMotion();}
                    if(k.f6Key.wasPressedThisFrame){if(bridge==null)storm=!storm;else Command("weather",new JObject{["weather"]=storm?"clear":"storm"});}
                    if(k.f7Key.wasPressedThisFrame&&bridge==null)day=day>.25f?.05f:.42f;
                    movement=lordView?new Vector2((k.dKey.isPressed?1:0)-(k.aKey.isPressed?1:0),(k.wKey.isPressed?1:0)-(k.sKey.isPressed?1:0)):Vector2.zero;
                    if(k.homeKey.wasPressedThisFrame&&GetComponent<NewWorldGameProfile>() is NewWorldGameProfile profile){focus=profile.referenceFocus;yaw=profile.referenceYaw;pitch=profile.referencePitch;zoom=profile.referenceZoom;}
                    else if(k.homeKey.wasPressedThisFrame){if(lordView){lordYaw=.46f;lordPitch=.28f;lordDistance=24;}else{focus=Space.ToUnity(new Vector2(50,55),1.5f);yaw=-.18f;pitch=.60f;zoom=.16f;}}
                }
                if(m!=null){
                    ApplyPointerInput(m.delta.ReadValue(),0,m.rightButton.isPressed);
                    ApplyWheelInput(m.scroll.ReadValue().y,InputSystem.settings.scrollDeltaBehavior==InputSettings.ScrollDeltaBehavior.UniformAcrossAllPlatforms);
                }
                if(lordView){if(bridge==null)MovePreview(movement,Time.unscaledDeltaTime);else if(!WorldPaused&&Time.realtimeSinceStartup>=nextMotion){bridge.SendMotion(NativeCameraProfile.LogicalMove(movement,lordYaw));nextMotion=Time.realtimeSinceStartup+.1f;}}
                else focus+=Space.Direction(NativeCameraProfile.LogicalMove(movement,yaw))*Time.unscaledDeltaTime*Mathf.Max(12,viewCamera.orthographicSize*.65f);
            }
            var emission=rain.emission;emission.rateOverTime=storm?3500:0;
            if(WorldPaused){if(rain.isPlaying)rain.Pause();}else if(storm&&!rain.isPlaying)rain.Play();
            rain.transform.position=(lordView?lord.position:focus)+Vector3.up*40;
            if(visual==null)day=Mathf.Repeat(day+Time.deltaTime/900,1);else PresentWorld();
            NativeSolarView.Apply(visual?.Elapsed??NativeSolarView.ElapsedAtPhase(day),visual?.Cloud??(storm?1:0),sun,fill,viewCamera,Space);
            weatherView?.Conditions(visual?.Wind??(storm?.7f:.12f),visual?.WindAngle??.5f,visual?.Lightning??(storm?Math.Floor(Time.time/15)*15:0));
            if(lordAnimator!=null&&visual==null){var next=velocity.sqrMagnitude>.01f?"Walk":"Idle";if(next!=activeClip){lordAnimator.CrossFade(next,.15f);activeClip=next;}}
            velocity=Vector3.zero;
        }
        public void MovePreview(Vector2 input,float dt)
        {
            input=Vector2.ClampMagnitude(input,1);var logical=NativeCameraProfile.LogicalMove(input,lordYaw);var delta=Space.Direction(logical)*(8*dt);
            if(delta.sqrMagnitude<.000001f)return;
            // Preview only: no inventory, world ticks or game saves are written here.
            var point=lord.position+delta;
            if(Physics.CheckCapsule(point+Vector3.up*1.5f,point+Vector3.up*5.5f,1.2f,1<<8))return;
            if(Physics.Raycast(point+Vector3.up*400,Vector3.down,out var hit,800,1<<9)){
                if(hit.normal.y<.5f)return;point.y=hit.point.y;lord.position=point;FaceMovement(lord,delta);velocity=delta;
            }
        }
        public static void FaceMovement(Transform actor,Vector3 direction)
        {
            direction=Vector3.ProjectOnPlane(direction,Vector3.up);if(direction.sqrMagnitude<.000001f)return;
            var model=actor.GetComponentInChildren<Animator>();if(!model)return;
            // Source rigs face glTF +X (Unity importer -X). Include the model's
            // authored yaw, mirrored basis and ancestor scale, rather than assuming root +Z.
            var front=Vector3.ProjectOnPlane(model.transform.TransformVector(Vector3.left),Vector3.up);
            if(front.sqrMagnitude>.000001f)actor.rotation=Quaternion.FromToRotation(front,direction)*actor.rotation;
        }
        public Bounds ActorGeometry(Transform actor)
        {
            if(actorGeometry.TryGetValue(actor,out var cached))return cached;
            return RefreshActorGeometry(actor);
        }
        private Bounds RefreshActorGeometry(Transform actor)
        {
            if(!poseMesh)poseMesh=new Mesh {name="Character contact pose"};
            if(!actorSkins.TryGetValue(actor,out var skins)){skins=actor.GetComponentsInChildren<SkinnedMeshRenderer>();actorSkins[actor]=skins;}
            var bounds=new Bounds();var first=true;var sole=Vector3.zero;var lowest=float.PositiveInfinity;
            var left=Vector3.zero;var right=Vector3.zero;var leftY=float.PositiveInfinity;var rightY=float.PositiveInfinity;
            var toActor=actor.worldToLocalMatrix;
            foreach(var skin in skins)
            {
                // true is essential for these mirrored/scaled imported rigs. Verified
                // against independent bone * bindpose skinning of the shipped meshes.
                skin.BakeMesh(poseMesh,true);poseMesh.GetVertices(bakedVertices);
                var toWorld=skin.transform.localToWorldMatrix;var skinToActor=toActor*toWorld;
                if(!footVertices.TryGetValue(skin,out var groups))
                {
                    // Anatomical foot joints in the two shipped rig families, including toe descendants.
                    byte Foot(Transform bone){for(var t=bone;t&&t!=actor;t=t.parent){if(t.name=="LeftFoot"||t.name=="bone_49")return 1;if(t.name=="RightFoot"||t.name=="bone_53")return 2;}return 0;}
                    var bones=skin.bones;var weights=skin.sharedMesh.boneWeights;var boneFeet=bones.Select(Foot).ToArray();groups=new byte[bakedVertices.Count];
                    for(int i=0;i<weights.Length;i++){var w=weights[i];float l=0,r=0;void Add(int bone,float weight){if(boneFeet[bone]==1)l+=weight;else if(boneFeet[bone]==2)r+=weight;}Add(w.boneIndex0,w.weight0);Add(w.boneIndex1,w.weight1);Add(w.boneIndex2,w.weight2);Add(w.boneIndex3,w.weight3);groups[i]=l>.4f?(byte)1:r>.4f?(byte)2:(byte)0;}
                    footVertices[skin]=groups;
                }
                for(int i=0;i<bakedVertices.Count;i++)
                {
                    var world=toWorld.MultiplyPoint3x4(bakedVertices[i]);var local=skinToActor.MultiplyPoint3x4(bakedVertices[i]);if(first){bounds=new Bounds(local,Vector3.zero);first=false;}else bounds.Encapsulate(local);
                    if(world.y<lowest){lowest=world.y;sole=local;}
                    if(groups[i]==1&&world.y<leftY){leftY=world.y;left=local;}if(groups[i]==2&&world.y<rightY){rightY=world.y;right=local;}
                }
                poseMesh.Clear();
            }
            if(!actorFeet.TryGetValue(actor,out var feet)){feet=new Vector3[2];actorFeet[actor]=feet;}
            feet[0]=float.IsFinite(leftY)?left:sole;feet[1]=float.IsFinite(rightY)?right:sole;
            actorGeometry[actor]=bounds;actorSoles[actor]=sole;return bounds;
        }
        public Vector3 ActorHead(Transform actor)
        {
            var bounds=ActorGeometry(actor);return actor.TransformPoint(new Vector3(bounds.center.x,bounds.max.y,bounds.center.z));
        }
        public Vector3 ActorSole(Transform actor){ActorGeometry(actor);return actor.TransformPoint(actorSoles[actor]);}
        public void GroundActor(Transform actor)
        {
            RefreshActorGeometry(actor);
            // Cast near the feet, including solid props/platforms. Starting at y=500
            // hits roofs above the person and ignores the surface they actually occupy.
            var correction=float.NegativeInfinity;var contact=actorSoles[actor];
            foreach(var local in actorFeet[actor])
            {
                var foot=actor.TransformPoint(local);var from=new Vector3(foot.x,Mathf.Max(actor.position.y,foot.y)+.5f,foot.z);
                var hits=Physics.RaycastAll(from,Vector3.down,4,(1<<8)|(1<<9),QueryTriggerInteraction.Ignore);
                foreach(var hit in hits)if(hit.normal.y>=.6f&&!hit.collider.transform.IsChildOf(actor)&&hit.point.y-foot.y>correction){correction=hit.point.y-foot.y;contact=local;}
            }
            if(float.IsFinite(correction)){actor.position+=Vector3.up*correction;actorSoles[actor]=contact;}
        }
        private void OnDestroy(){if(poseMesh){if(Application.isPlaying)Destroy(poseMesh);else DestroyImmediate(poseMesh);}}
        private void LateUpdate()
        {
            foreach(var actor in characters??Array.Empty<Transform>())
            {
                if(!actor||actions.TryGetValue(actor.name,out var action)&&action=="dead")continue;
                GroundActor(actor);
            }
            UpdateCamera();
        }
        public void UpdateCamera()
        {
            if(!lordView&&Physics.Raycast(new Vector3(focus.x,500,focus.z),Vector3.down,out var ground,1000,1<<9))focus.y=Mathf.Max(-.05f,ground.point.y)+1.5f;
            var newMap=GetComponent<NewWorldGameProfile>();if(newMap&&!lordView){newMap.ApplyOverview();return;}
            var pose=lordView?NativeCameraProfile.Lord(lord.position,lordYaw,lordPitch,lordDistance):NativeCameraProfile.God(Screen.width,Screen.height,focus,yaw,pitch,zoom);
            if(lordView){if(lordDistance<=80&&Physics.Linecast(pose.Target,pose.Position,out var hit,(1<<8)|(1<<9)))pose.Position=hit.point+hit.normal*1.2f;
                if(Physics.Raycast(pose.Position+Vector3.up*500,Vector3.down,out var floor,1000,1<<9))pose.Position.y=Mathf.Max(pose.Position.y,floor.point.y+2);}
            pose.Apply(viewCamera);
        }
        private void OnGUI()
        {
            if(GetComponent<NativeValleyCapture>()!=null)return;
            if(GetComponent<NativeGameUi>()!=null)return;
            if(bridge!=null){DrawWorldHud();return;}
            GUI.Box(new Rect(15,15,560,66),"CampMind native scene preview | game authority not connected\nTab: camera  WASD: move/pan  RMB: orbit  Wheel: zoom\nF6: storm  F7: day/night  Home: reset camera");
        }
        private void Command(string type,JObject values=null){var command=values??new JObject();command["type"]=type;bridge.Enqueue(new JObject{["type"]="command",["command"]=command});}
        public bool GateOpen {get{var village=GetComponent<NativeVillageUi>();if(village!=null&&village.VillageActive&&village.Snapshot?["combat"] is JObject combat)return (double?)village.Snapshot["economy"]?["fence"]?["hp"]<=0||(bool?)combat["gateOpen"]==true;return visual?.GateOpen??true;}}
        private void PublishWorld(JObject snapshot)
        {
            if(ExternalInputDriver&&EnvironmentPresentation!=null)return;
            ApplyWorldState(snapshot["state"] as JObject);
            var scope=(string)snapshot["dialogueScope"];if(world!=null&&scope!=presentedScope){presentedScope=scope;selected=(string)world["selectedNpc"]??"azhuang";}
        }
        public void PresentReplayState(JObject state)
        {
            PresentReplayFrame(CampRenderFrame.FromState(state));
        }
        public void PresentReplayFrame(CampRenderFrame frame)
        {
            if(bridge!=null)throw new InvalidOperationException("Cannot apply replay frames while attached to an authority");ApplyVisualFrame(frame);
        }
        private void ApplyWorldState(JObject state)
        {
            world=state;ApplyVisualFrame(CampRenderFrame.FromState(state));
        }
        private void ApplyVisualFrame(CampRenderFrame frame)
        {
            visual=frame;GetComponentInChildren<NativeWildernessView>()?.SetFrame(frame);targets.Clear();if(frame==null)return;
            void Target(string id,Vector2 point){var pos=Space.ToUnity(point,0);if(Physics.Raycast(pos+Vector3.up*500,Vector3.down,out var hit,1000,1<<9))pos.y=hit.point.y;targets[id]=pos;}
            if(frame.HasLord)Target("lord",frame.Lord);
            foreach(var npc in frame.Actors){Target(npc.Id,npc.Position);actions[npc.Id]=!npc.Alive?"dead":npc.HuntWork?"wood":npc.Action;carrying[npc.Id]=npc.Carrying;characters.FirstOrDefault(actor=>actor.name==npc.Id)?.GetComponent<NativeCarryView>()?.SetActor(npc);}
            storm=frame.Weather=="storm"||frame.Rain>.3f;var cycle=(float)(frame.Elapsed%600);day=Mathf.Repeat(cycle<420?.25f+cycle/420*.5f:.75f+(cycle-420)/180*.5f,1);
        }
        public static void NormalizeAliveRoot(Transform actor)
        {
            actor.localRotation=Quaternion.Euler(0,actor.localEulerAngles.y,0);
        }
        private void PresentWorld()
        {
            // Village presentation owns these same rigs while its external driver is active.
            // Applying the paused legacy frame here overwrites both poses and animator speed
            // before Unity evaluates animation, even though Village restores positions later.
            if(ExternalInputDriver)return;
            foreach(var actor in characters){if(!targets.TryGetValue(actor.name,out var target))continue;var before=actor.position;actor.position=Vector3.Lerp(before,target,1-Mathf.Exp(-Time.unscaledDeltaTime*15));var delta=actor.position-before;
                var flat=new Vector3(delta.x,0,delta.z);var moving=flat.sqrMagnitude>.000001f;if(moving)FaceMovement(actor,flat);
                var animator=actor.GetComponentInChildren<Animator>();var held=carrying.TryGetValue(actor.name,out var stock)&&stock;
                var action=actions.TryGetValue(actor.name,out var value)?value:"";var next=held?(moving&&animator.HasState(0,Animator.StringToHash("WalkCarry"))?"WalkCarry":"Carry"):moving?"Walk":action=="wood"?"Work":action=="food"||action=="eat"||action=="help"?"Gather":action=="rest"?"Rest":"Idle";
                if(actor.name=="lord"&&next!="Walk")next="Idle";
                animator.speed=WorldPaused?0:1;
                if(!actorClips.TryGetValue(actor.name,out var current)||current!=next){animator.CrossFade(next,.15f);actorClips[actor.name]=next;}
                if(action=="dead"){animator.speed=0;actor.localRotation=Quaternion.Euler(0,actor.localEulerAngles.y,90);actor.position=target+Vector3.up*.67f;}else NormalizeAliveRoot(actor);
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
            if(GUILayout.Button("Storm / Clear"))Command("weather",new JObject{["weather"]=storm?"clear":"storm"});if(GUILayout.Button("1x"))bridge.Enqueue(new JObject{["type"]="speed",["speed"]=1});if(GUILayout.Button("4x"))bridge.Enqueue(new JObject{["type"]="speed",["speed"]=4});GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();foreach(var npc in world["npcs"]){var id=(string)npc["id"];if(GUILayout.Button(id))selected=id;}GUILayout.EndHorizontal();
            foreach(var npc in world["npcs"])if((string)npc["id"]==selected){GUILayout.Label($"{selected}: {npc["action"]} | Health {npc["health"]:0} Hunger {npc["hunger"]:0} Energy {npc["energy"]:0}");GUILayout.Label((string)npc["speech"]??"");}
            GUILayout.BeginHorizontal();foreach(var action in new[]{"food","wood","eat","rest","camp","explore"})if(GUILayout.Button(action))Command("assign",new JObject{["npcId"]=selected,["action"]=action});GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();if(GUILayout.Button("Feed"))Command("feed",new JObject{["npcId"]=selected});if(GUILayout.Button("Praise"))Command("praise",new JObject{["npcId"]=selected});if(GUILayout.Button("Recall"))Command("recall");if(GUILayout.Button("Gate"))Command("gate-toggle");GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();if(GUILayout.Button("MiniMind3"))bridge.Enqueue(new JObject{["type"]="agency-model",["modelId"]="minimind3"});
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
            Directory.CreateDirectory(directory);focus=Space.ToUnity(new Vector2(50,55),1.5f);zoom=.16f;yaw=-.18f;pitch=.60f;lordYaw=.46f;lordPitch=.28f;lordDistance=24;lordView=false;day=.42f;
            yield return new WaitForSeconds(3);
            var bones=lord.GetComponentInChildren<SkinnedMeshRenderer>().bones;var rotations=new Quaternion[bones.Length];for(var b=0;b<bones.Length;b++)rotations[b]=bones[b].localRotation;
            yield return new WaitForSeconds(.3f);var animatedBones=0;for(var b=0;b<bones.Length;b++)if(Quaternion.Angle(rotations[b],bones[b].localRotation)>.01f)animatedBones++;
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"camp-overview.png"));
            yield return new WaitForSeconds(1);lordView=true;
            var before=lord.position;for(var t=0f;t<2;t+=Time.deltaTime){MovePreview(Vector2.up,Time.deltaTime);yield return null;}
            yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"lord-view.png"));
            storm=true;yield return new WaitForSeconds(2);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"storm.png"));
            day=.05f;yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"night.png"));
            yield return new WaitForSeconds(1);
            var movementDistance=Vector3.Distance(before,lord.position);
            var indoors=GetComponent<NativeInteriorView>();var room=indoors.rooms.First(r=>r.id=="lord-house");
            storm=true;day=.42f;lordView=true;lord.position=room.center+Vector3.up*.1f;lordYaw=3.60f;lordPitch=.28f;yield return new WaitForSeconds(1);
            indoors.Observe(lord.position);var interiorVisible=room.interior.activeSelf&&room.exterior.All(r=>!r.enabled);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"interior.png"));yield return new WaitForSeconds(1);
            lord.position=Space.ToUnity(new Vector2(50,65),0);lordView=false;focus=lord.position;yield return new WaitForSeconds(.5f);indoors.Observe(lord.position);
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
            deadline=Time.realtimeSinceStartup+90;
            while(!bridge.ReadyForActions&&Time.realtimeSinceStartup<deadline)yield return null;
            if(!bridge.ReadyForActions){BridgeFailure(directory,"World is still catching up; no gameplay mutation was attempted");yield break;}
            if(world==null)bridge.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17}});
            while(world==null&&Time.realtimeSinceStartup<deadline)yield return null;
            if(world==null){BridgeFailure(directory,"World was not created");yield break;}
            var initialElapsed=(double)world["elapsed"];var initialRevision=bridge.gate.Revision;
            bridge.Enqueue(new JObject{["type"]="agency-settings",["enabled"]=true,["cognition"]=false,["modelId"]=(string)world["agency"]?["modelId"]??"minimind3"});
            deadline=Time.realtimeSinceStartup+20;
            while(((bool?)world["agency"]?["cognition"]!=false||bridge.gate.Revision<=initialRevision)&&Time.realtimeSinceStartup<deadline)yield return null;
            if((bool?)world["agency"]?["cognition"]!=false){BridgeFailure(directory,"Agency settings were not confirmed");yield break;}
            if((string)world["status"]!="playing"){
                bridge.Enqueue(new JObject{["type"]="pause",["paused"]=false});deadline=Time.realtimeSinceStartup+20;
                while((string)world["status"]!="playing"&&Time.realtimeSinceStartup<deadline)yield return null;
            }
            if((string)world["status"]!="playing"){BridgeFailure(directory,"Resume was not confirmed");yield break;}
            var start=lord.position;var npcStart=characters[1].position;
            Command("assign",new JObject{["npcId"]="azhuang",["action"]="food"});
            lordView=true;
            deadline=Time.realtimeSinceStartup+15;
            while(Vector3.Distance(start,lord.position)<12&&Time.realtimeSinceStartup<deadline){bridge.SendMotion(Vector2.up);yield return new WaitForSecondsRealtime(.1f);}
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
