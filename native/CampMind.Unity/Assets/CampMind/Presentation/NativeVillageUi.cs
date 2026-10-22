using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UnityEngine.InputSystem;

namespace CampMind.Presentation
{
    // Projection and command transport only. No HP, stock, promises or time are authored here.
    [DefaultExecutionOrder(250)]
    public sealed partial class NativeVillageUi:MonoBehaviour
    {
        public JObject Snapshot {get;private set;}
        public string Error {get;private set;}="";
        public bool VillageActive {get;private set;}
        public bool Pending=>pending;
        JObject queued;
        NativeCampView view;NativeGameUi legacyUi;Font font;RectTransform root,panel,content;
        Text heading;ScrollRect scroll;string selected="player",tab="营地",signature="";
        bool pending,mutationPending,hideChat;float pollAt;readonly List<(Text text,Func<string> value)> bindings=new List<(Text,Func<string>)>();
        bool panelOpen=false;float inputAt,errorExpires;readonly Dictionary<string,Text> actorLabels=new Dictionary<string,Text>();
        string keyboardOperation;Vector2 keyboardDirection;long keyboardRevision=-1;
        string keyboardCancellingTask,keyboardCancellationId;float keyboardCancellationAt;
        readonly Dictionary<string,Transform> actors=new Dictionary<string,Transform>();
        readonly Dictionary<string,GameObject> enemies=new Dictionary<string,GameObject>();
        readonly Dictionary<string,GameObject> nodes=new Dictionary<string,GameObject>();
        readonly Dictionary<string,Vector3> lastPositions=new Dictionary<string,Vector3>();
        readonly Dictionary<string,string> animationStates=new Dictionary<string,string>();
        readonly Dictionary<string,GameObject> carriedBags=new Dictionary<string,GameObject>();
        readonly Dictionary<string,GameObject> equippedModels=new Dictionary<string,GameObject>();
        readonly Dictionary<string,string> equippedIds=new Dictionary<string,string>();
        Button toggleButton;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Install()
        {
            SceneManager.sceneLoaded-=OnScene;SceneManager.sceneLoaded+=OnScene;OnScene(default,LoadSceneMode.Single);
        }
        static void OnScene(Scene scene,LoadSceneMode mode)
        {
            var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();
            if(view!=null&&view.GetComponent<NativeVillageUi>()==null)view.gameObject.AddComponent<NativeVillageUi>();
        }
        void Start()
        {
            view=GetComponent<NativeCampView>();font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular")??Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            root=Rect("新玩法",null);var canvas=root.gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=50;
            root.gameObject.AddComponent<GraphicRaycaster>();var scale=root.gameObject.AddComponent<CanvasScaler>();NativeUiScale.Configure(scale);canvas.pixelPerfect=true;
            root.anchorMin=Vector2.zero;root.anchorMax=Vector2.one;root.offsetMin=root.offsetMax=Vector2.zero;
            var open=Button(root,"营地管理",()=>{panelOpen=true;if(!VillageActive)SetActive(true);});toggleButton=open;var rect=(RectTransform)open.transform;rect.anchorMin=rect.anchorMax=Vector2.zero;rect.pivot=Vector2.zero;rect.anchoredPosition=new Vector2(18,18);rect.sizeDelta=new Vector2(125,38);
            gameObject.AddComponent<NativeWildlifeAlert>();
            gameObject.AddComponent<NativeCombatFeedback>();
            if(Environment.GetEnvironmentVariable("CAMP_WILDLIFE_TIDE_PROBE")=="1")gameObject.AddComponent<NativeWildlifeTideProbe>();
            BuildManagement();
            BuildFormalHud();
            var defaultMode=Environment.GetEnvironmentVariable("CAMP_VILLAGE_DEFAULT");
            if(defaultMode=="1"||(Application.isEditor&&defaultMode!="0"&&Array.IndexOf(Environment.GetCommandLineArgs(),"-campmind-editor-world-smoke")<0))StartCoroutine(OpenDefaultVillage());
        }
        IEnumerator OpenDefaultVillage()
        {
            while(view.Authority==null||!view.Authority.Connected)yield return null;
            while(NativeStartup.Active)yield return null;
            SetActive(true);
        }
        public void SetActive(bool active)
        {
            VillageActive=active;panel.gameObject.SetActive(active&&panelOpen);legacyUi=view.GetComponent<NativeGameUi>();legacyUi?.SetVillageHud(active);
            if(toggleButton!=null)toggleButton.gameObject.SetActive(!active);
            view.ExternalInputDriver=active;
            if(active){view.Authority?.ReleaseMotion();}
            // Camera controls stay in NativeCampView. Its outgoing movement is disabled while the pointer is over this panel.
            foreach(var label in actorLabels.Values)label.gameObject.SetActive(active);
            if(!active){queued=null;foreach(var item in nodes.Values)item.SetActive(false);foreach(var item in enemies.Values)item.SetActive(false);foreach(var item in carriedBags.Values)item.SetActive(false);foreach(var item in equippedModels.Values)item.SetActive(false);foreach(var actor in actors.Values)if(!view.characters.Contains(actor))actor.gameObject.SetActive(false);foreach(var actor in view.characters)actor.gameObject.SetActive(true);return;}
            Refresh();Poll();
        }
        void Update()
        {
            if(!VillageActive)return;
            if(legacyUi==null){legacyUi=view.GetComponent<NativeGameUi>();legacyUi?.SetVillageHud(true);}
            panel.gameObject.SetActive(panelOpen&&!view.InputBlocked);
            toggleButton.gameObject.SetActive(false);RefreshFormalHud();
            if(Time.realtimeSinceStartup>=pollAt&&!pending&&!resetting){pollAt=Time.realtimeSinceStartup+.15f;Poll();}
            foreach(var binding in bindings)if(binding.text!=null)binding.text.text=binding.value();
            UpdateLoopPresentation();
            if(view.ExternalMapMode&&Keyboard.current?.escapeKey.wasPressedThisFrame==true&&panelOpen)CloseManagement();
            if(!view.InputBlocked&&!view.ExternalMapMode)InputControls();
        }
        void InputControls()
        {
            if((!view.HasInputFocus&&InputSystem.settings.backgroundBehavior!=InputSettings.BackgroundBehavior.IgnoreFocus)||NativeStartup.Active)return;
            var k=Keyboard.current;var mouse=Mouse.current;
            if(k?.escapeKey.wasPressedThisFrame==true&&panelOpen){CloseManagement();return;}
            if(k?.tabKey.wasPressedThisFrame==true)view.lordView=!view.lordView;
            if(k?.homeKey.wasPressedThisFrame==true&&Actor("player")?["position"] is JObject home)view.focus=view.Space.ToUnity(new Vector2((float)home["x"],(float)home["y"]),1.5f);
            if(mouse!=null&&!view.PointerBlocked){view.ApplyPointerInput(mouse.delta.ReadValue(),0,mouse.rightButton.isPressed);view.ApplyWheelInput(mouse.scroll.ReadValue().y,InputSystem.settings.scrollDeltaBehavior==InputSettings.ScrollDeltaBehavior.UniformAcrossAllPlatforms);if(mouse.middleButton.isPressed)view.ApplyPanInput(mouse.delta.ReadValue(),Screen.height);}
            if(k==null)return;var move=new Vector2((k.dKey.isPressed?1:0)-(k.aKey.isPressed?1:0),(k.wKey.isPressed?1:0)-(k.sKey.isPressed?1:0));
            if(!view.lordView){view.focus+=view.Space.Direction(NativeCameraProfile.LogicalMove(move,view.yaw))*Time.unscaledDeltaTime*16;return;}
            ApplyPlayerMovement(move);
        }
        public void ApplyPlayerMovement(Vector2 move)
        {
            if(!view.lordView||view.InputBlocked||move.sqrMagnitude==0||Snapshot==null||mutationPending||queued!=null||Time.realtimeSinceStartup<inputAt)return;
            if((bool?)Snapshot["paused"]==true){Error="游戏已暂停，请先继续时间。";errorExpires=Time.realtimeSinceStartup+2;return;}
            if((long?)Snapshot["catchupTicks"]>0){Error="世界正在补算，剩余 "+Snapshot["catchupTicks"]+" 步，完成后可移动。";errorExpires=Time.realtimeSinceStartup+2;return;}
            if((long?)Snapshot["revision"]<=keyboardRevision)return;
            var direction=NativeCameraProfile.LogicalMove(move.normalized,view.lordYaw);
            var task=(Snapshot["executions"] as JObject)?.Properties().FirstOrDefault(p=>(string)p.Value["command"]?["actorId"]=="player"&&new[]{"accepted","running"}.Contains((string)p.Value["status"]));
            inputAt=Time.realtimeSinceStartup+.15f;
            if(Snapshot["ecology"]?["hunt"] is JObject){Mutate("animal-hunt-cancel");return;}
            if(task!=null)
            {
                if((string)task.Value["command"]?["operationId"]==keyboardOperation&&Vector2.Dot(direction,keyboardDirection)>.75f)return;
                if(task.Name==keyboardCancellingTask&&Time.realtimeSinceStartup-keyboardCancellationAt<1)return;
                if(task.Name!=keyboardCancellingTask){keyboardCancellingTask=task.Name;keyboardCancellationId="keyboard-cancel-"+Guid.NewGuid().ToString("N");}
                keyboardCancellationAt=Time.realtimeSinceStartup;
                Mutate("cancel",new JObject{["operationId"]=keyboardCancellationId,["executionId"]=task.Name});return;
            }
            keyboardCancellingTask=null;keyboardCancellationId=null;
            var current=Actor("player")?["position"];if(current==null)return;
            keyboardOperation="keyboard-"+Guid.NewGuid().ToString("N");keyboardDirection=direction;keyboardRevision=(long)Snapshot["revision"];
            Command("REPOSITION",null,new JObject{["x"]=(float)current["x"]+direction.x*1.2f,["y"]=(float)current["y"]+direction.y*1.2f},keyboardOperation);
        }
        void LateUpdate()
        {
            if(!VillageActive||Snapshot==null||view.ExternalMapMode)return;
            PresentAnimals();
            var identities=((JObject)Snapshot["actors"]).Properties().OrderBy(p=>p.Name=="player"?0:1).ThenBy(p=>p.Name,StringComparer.Ordinal).ToArray();
            var pool=view.characters.Where(a=>a!=view.lord).ToArray();var used=new HashSet<Transform>();
            for(var index=0;index<identities.Length;index++){
                var entry=identities[index];var id=entry.Name;var actor=(JObject)entry.Value;
                if(!actors.TryGetValue(id,out var model)){
                    model=id=="player"?view.lord:pool.FirstOrDefault(p=>!actors.Values.Contains(p))??Instantiate(pool[0],pool[0].parent);
                    actors[id]=model;
                    model.name=id;
                }
                used.Add(model);model.gameObject.SetActive(true);
                var point=actor["position"];var next=view.Space.ToUnity(new Vector2((float)point["x"],(float)point["y"]),0);
                if(Physics.Raycast(next+Vector3.up*500,Vector3.down,out var ground,1000,1<<9))next.y=ground.point.y;
                var before=lastPositions.TryGetValue(id,out var previous)?previous:next;next=Vector3.Lerp(before,next,1-Mathf.Exp(-Time.unscaledDeltaTime*18));var moving=(before-next).sqrMagnitude>.00001f;
                model.position=next;lastPositions[id]=next;
                if(!actorLabels.TryGetValue(id,out var label)){label=Label(root,"",14);((RectTransform)label.transform).sizeDelta=new Vector2(180,50);label.alignment=TextAnchor.MiddleCenter;actorLabels[id]=label;}
                var activity=actor["activity"] as JObject;var screen=view.viewCamera.WorldToScreenPoint(next+Vector3.up*2.5f);RectTransformUtility.ScreenPointToLocalPointInRectangle(root,screen,null,out var labelPoint);((RectTransform)label.transform).anchoredPosition=labelPoint;label.text=actor["name"]+"\n"+ActivityLabel((string)activity?["action"]);label.gameObject.SetActive(!view.InputBlocked&&!panelOpen&&screen.z>0&&(bool?)actor["body"]?["incapacitated"]!=true&&id==(view.lordView?"player":view.SelectedNpc));
                var downed=(bool?)actor["body"]?["downed"]==true;model.localRotation=downed?Quaternion.Euler(0,model.localEulerAngles.y,90):Quaternion.Euler(0,model.localEulerAngles.y,0);
                if(moving&&!downed)model.rotation=Quaternion.LookRotation(next-before);
                var animator=model.GetComponentInChildren<Animator>();if(animator!=null){animator.speed=(bool?)Snapshot["paused"]==true?0:1;var action=(string)activity?["action"];var clip=downed?"Rest":moving?"Walk":action=="CRAFT"||action=="BUILD_WORKSHOP"||action=="ATTACK"||action?.StartsWith("GATHER_")==true?"Work":action=="REST"?"Rest":"Idle";if((!animationStates.TryGetValue(id,out var current)||current!=clip)&&animator.HasState(0,Animator.StringToHash(clip))){animator.CrossFade(clip,.1f);animationStates[id]=clip;}}
                if(!carriedBags.TryGetValue(id,out var bag)){bag=GameObject.CreatePrimitive(PrimitiveType.Cube);bag.name="携带物资 "+id;Destroy(bag.GetComponent<Collider>());bag.transform.localScale=new Vector3(.35f,.35f,.45f);bag.GetComponent<Renderer>().material.color=new Color(.39f,.25f,.12f);carriedBags[id]=bag;}
                bag.SetActive((actor["carried"] as JObject)?.Properties().Sum(p=>(double)p.Value)>0);bag.transform.position=model.position+Vector3.up*.85f+model.forward*.3f;
                var itemId=(string)actor["equipment"];if(equippedIds.TryGetValue(id,out var beforeItem)&&beforeItem!=itemId){if(equippedModels.TryGetValue(id,out var oldWeapon))Destroy(oldWeapon);equippedModels.Remove(id);equippedIds.Remove(id);}
                if(itemId!=null&&Snapshot["economy"]?["items"]?[itemId] is JObject item){if(!equippedModels.TryGetValue(id,out var weapon)){weapon=VillageWorldProps.Weapon((string)item["recipeId"]);equippedModels[id]=weapon;equippedIds[id]=itemId;}weapon.SetActive(true);var hand=animator!=null&&animator.isHuman?animator.GetBoneTransform(HumanBodyBones.RightHand):null;weapon.transform.position=hand!=null?hand.position:model.position+Vector3.up*.9f+model.right*.35f;weapon.transform.rotation=hand!=null?hand.rotation:model.rotation;}
            }
            foreach(var original in view.characters)if(!used.Contains(original))original.gameObject.SetActive(false);
            foreach(var entry in (Snapshot["combat"]?["carriedBy"] as JObject)?.Properties()??Enumerable.Empty<JProperty>())if(actors.TryGetValue(entry.Name,out var patient)&&actors.TryGetValue((string)entry.Value,out var carrier))patient.position=carrier.position+Vector3.up*1.05f+carrier.right*.3f;
            // Additional world objects are presentation-only and never regenerate depleted nodes.
            foreach(var entry in (Snapshot["economy"]?["nodes"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){
                if(!nodes.TryGetValue(entry.Name,out var model)){model=ForestHarvestVisual.Find(entry.Name);if(!model)model=VillageWorldProps.Resource(entry.Name,(string)entry.Value["resource"]);nodes[entry.Name]=model;}
                Position(model,entry.Value["position"],0);model.SetActive((double)entry.Value["remainingHp"]>0);
            }
            foreach(var entry in (Snapshot["combat"]?["enemies"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){
                if(!enemies.TryGetValue(entry.Name,out var model)){model=VillageWorldProps.Wolf(entry.Name,(string)entry.Value["archetypeId"]);enemies[entry.Name]=model;}
                var point=entry.Value["position"];var target=view.Space.ToUnity(new Vector2((float)point["x"],(float)point["y"]),0);if(Physics.Raycast(target+Vector3.up*500,Vector3.down,out var wolfGround,1000,1<<9))target.y=wolfGround.point.y;var previous=model.transform.position;model.transform.position=Vector3.Lerp(previous,target,1-Mathf.Exp(-Time.unscaledDeltaTime*18));var travel=model.transform.position-previous;travel.y=0;if(travel.sqrMagnitude>.00001f)model.transform.rotation=Quaternion.LookRotation(travel);model.SetActive((double)entry.Value["hp"]>0);
            }
            foreach(var entry in (Snapshot["economy"]?["foodSources"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var key="food-"+entry.Name;if(!nodes.TryGetValue(key,out var model)){model=ForestHarvestVisual.Find(entry.Name);if(!model)model=VillageWorldProps.Resource(key,"food");nodes[key]=model;}Position(model,entry.Value["position"],0);model.SetActive((int?)entry.Value["remaining"]>0);}
            foreach(var entry in (Snapshot["economy"]?["containers"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var key="drop-"+entry.Name;if(!nodes.TryGetValue(key,out var model)){model=VillageWorldProps.Resource(key,"container");nodes[key]=model;}Position(model,entry.Value["position"],0);model.SetActive((entry.Value["resources"] as JObject)?.Properties().Sum(p=>(double)p.Value)>0);}
            NativeSolarView.Apply((double)Snapshot["elapsed"],(float?)Snapshot["atmosphere"]?["cloudCover"]??0,view.sun,view.fill,view.viewCamera,view.Space);
        }
        void Position(GameObject model,JToken point,float height){var p=view.Space.ToUnity(new Vector2((float)point["x"],(float)point["y"]),height);if(Physics.Raycast(p+Vector3.up*500,Vector3.down,out var ground,1000,1<<9))p.y=ground.point.y+height;model.transform.position=p;}
        void Poll(){if(view.Authority==null||!view.Authority.Connected)return;Send(Snapshot==null?new JObject{["type"]="ensure-upgraded"}:null);}
        string presentedWorldId;
        void AdoptSnapshot(JObject next)
        {
            var id=(string)next?["worldId"];
            if(presentedWorldId!=null&&id!=presentedWorldId){
                queued=null;selected="player";signature="";panelOpen=false;Error="";keyboardOperation=null;keyboardRevision=-1;keyboardDirection=Vector2.zero;keyboardCancellingTask=null;keyboardCancellationId=null;
                foreach(var actor in actors.Values)if(actor!=null&&actor!=view.lord&&!view.characters.Contains(actor))Destroy(actor.gameObject);
                actors.Clear();lastPositions.Clear();animationStates.Clear();equippedIds.Clear();
                foreach(var d in new[]{enemies,nodes,carriedBags,equippedModels,animalModels}){foreach(var g in d.Values)if(g!=null&&g.GetComponent<ForestHarvestVisual>()==null)Destroy(g);d.Clear();}
                foreach(var label in actorLabels.Values)if(label!=null)Destroy(label.gameObject);actorLabels.Clear();
                foreach(var label in animalMarkers.Values)if(label!=null)Destroy(label.gameObject);animalMarkers.Clear();animalAnimation.Clear();
                if(view.GetComponent<NewWorldGameProfile>() is NewWorldGameProfile profile){view.focus=profile.referenceFocus;view.yaw=profile.referenceYaw;view.pitch=profile.referencePitch;view.zoom=profile.referenceZoom;view.lordView=false;}
            }
            presentedWorldId=id;Snapshot=next;
            if(next?["atmosphere"] is JObject){
                var crew=new JArray(((JObject)next["actors"]).Properties().Where(p=>p.Name!="player").Select(p=>new JObject{["id"]=p.Name,["name"]=p.Value["name"]?.DeepClone(),["position"]=p.Value["position"]?.DeepClone(),["wetness"]=p.Value["body"]?["wetness"]?.DeepClone(),["alive"]=(bool?)p.Value["body"]?["incapacitated"]!=true}));
                view.PresentVillageEnvironment(new JObject{["seed"]=next["seed"]?.DeepClone(),["elapsed"]=next["elapsed"]?.DeepClone(),["status"]=(bool?)next["paused"]==true?"paused":"playing",["weather"]=next["weather"]?.DeepClone(),["weatherUntil"]=next["weatherUntil"]?.DeepClone(),["atmosphere"]=next["atmosphere"]?.DeepClone(),["shelterIntegrity"]=100,["npcs"]=crew,["events"]=new JArray()},next["presentation"] as JObject);
            }
        }
        void Send(JObject input,int retry=0)
        {
            if(view.Authority==null)return;if(pending){if(input!=null){if(queued==null)queued=(JObject)input.DeepClone();else Error="上一条操作正在提交，请稍后。";}return;}pending=true;mutationPending=input!=null;
            view.Authority.Api("/game-api/village",input,(result,error)=>{
                var keyboardMove=(string)input?["command"]?["action"]=="REPOSITION"&&((string)input?["command"]?["operationId"])?.StartsWith("keyboard-")==true;
                if((error=="Village revision conflict"||keyboardMove&&error=="Village entities changed")&&input?["revision"]!=null&&retry<(keyboardMove?2:1)){view.Authority.Api("/game-api/village",null,(fresh,refreshError)=>{pending=false;mutationPending=false;if(refreshError==null&&fresh?["revision"]!=null){AdoptSnapshot(fresh);input["revision"]=fresh["revision"];if(keyboardMove)input["command"]["readSet"]["actor:player"]=fresh["versions"]["actor:player"];Send(input,retry+1);}else{Error=refreshError??error;Refresh();}});return;}
                pending=false;mutationPending=false;if(error!=null||(bool?)result?["accepted"]==false){Error=error??("操作未执行："+((string)result?["reason"]??"请检查物资、距离和当前任务"));errorExpires=Time.realtimeSinceStartup+5;}else if(input!=null||Time.realtimeSinceStartup>errorExpires)Error="";if(error==null&&result?["worldMode"]!=null)AdoptSnapshot(result);else if(error==null&&input==null)Snapshot=null;Refresh();if(queued!=null){var next=queued;queued=null;if(next["revision"]!=null&&Snapshot!=null)next["revision"]=Snapshot["revision"];Send(next);}});
        }
        void Mutate(string type,JObject values=null)
        {
            if(Snapshot==null)return;var input=values??new JObject();input["type"]=type;input["worldId"]=Snapshot["worldId"];input["revision"]=Snapshot["revision"];Send(input);
        }
        public void Command(string action,string target=null,JObject parameters=null,string operationId=null)
        {
            if((long?)Snapshot?["catchupTicks"]>0){Error="世界正在补算，完成后可操作。";return;}
            var readSet=new JObject{["actor:player"]=Snapshot?["versions"]?["actor:player"]};
            if(new[]{"CRAFT","BUILD_WORKSHOP","UPGRADE_FENCE","REPAIR_FENCE","EAT","HEAL"}.Contains(action))readSet["inventory:public"]=Snapshot?["versions"]?["inventory:public"];
            var command=new JObject{["operationId"]=operationId??"unity-"+Guid.NewGuid().ToString("N"),["actorId"]="player",["issuedAtTick"]=Snapshot?["tick"],["action"]=action,["parameters"]=parameters??new JObject(),["readSet"]=readSet,["source"]="player_input"};
            if(target!=null)command["targetId"]=target;Mutate("command",new JObject{["command"]=command});
        }
        JObject Actor(string id)=>Snapshot?["actors"]?[id] as JObject;
        void Refresh()
        {
            if(heading==null)return;
            RefreshManagementHeader();
            var next=tab+"|"+(Snapshot?["worldId"]?.ToString()??"none")+"|"+String.Join(",",(Snapshot?["actors"] as JObject)?.Properties().Select(p=>p.Name)??Array.Empty<string>())+"|"+Snapshot?["economy"]?["items"]+"|"+Snapshot?["economy"]?["offers"]+"|"+Snapshot?["social"]+"|"+Snapshot?["combat"]?["waves"];
            next+="|"+String.Join(",",(Snapshot?["executions"]as JObject)?.Properties().Select(p=>p.Name+":"+p.Value["status"])??Array.Empty<string>());
            next+="|"+String.Join(",",(Snapshot?["combat"]?["enemies"]as JObject)?.Properties().Select(p=>p.Name+":"+((double?)p.Value["hp"]>0))??Array.Empty<string>());
            next+="|"+Snapshot?["economy"]?["fence"]?["level"]+"|"+Snapshot?["combat"]?["unlockedRecipes"];
            next+="|"+Snapshot?["uiCatalog"]?["workshop"]?["state"]+"|"+Snapshot?["uiCatalog"]?["journey"]?["progress"];
            if(tab=="狩猎")next+="|"+HuntingSignature();
            if(signature==next)return;signature=next;bindings.Clear();ClearManagementContent();
            if(Snapshot==null){Text("正在兼容升级存档并加载营地，原有存档会自动备份。");Button(content,"重试加载",()=>Poll());return;}
            if(Actor(selected)==null)selected="player";
            PrepareManagementPage();
            if(tab=="营地")Camp();else if(tab=="人物")People();else if(tab=="制作")Orders();else if(tab=="狩猎")Hunting();else Society();
        }
        void Camp()
        {
            BuildCampOverview();
            BuildWorkshopControls();
            Text("采集目标");foreach(var property in (Snapshot["economy"]?["nodes"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){
                var id=property.Name;var node=property.Value;Button(content,$"{ResourceName((string)node["resource"])} · {node["level"]}级 · 采集",()=>Command("GATHER_"+((string)node["resource"]).ToUpperInvariant(),id));}
            foreach(var property in (Snapshot["economy"]?["foodSources"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var id=property.Name;Button(content,"采集粮食 · "+id,()=>Command("GATHER_FOOD",id));}
            foreach(var property in (Snapshot["economy"]?["containers"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var id=property.Name;Button(content,"拾取落物 · "+id,()=>Command("PICK_UP",id));}
            foreach(var property in (Snapshot["economy"]?["offers"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){if(property.Value["acceptedBy"]?.Type!=JTokenType.Null)continue;var id=property.Name;Button(content,"招募 "+property.Value["archetypeId"],()=>Mutate("recruit",new JObject{["offerId"]=id}));}
        }
        void People(){BuildPeoplePage();}
        void Orders()
        {
            BuildCraftPage();
        }
        void Society()
        {
            Text("协作需要各方分别同意。这里可以查看提议、回应条款与跟进执行。");
            Button(content,hideChat?"显示聊天":"隐藏聊天（社会决策继续）",()=>{hideChat=!hideChat;signature="";Refresh();});
            foreach(var property in (Snapshot["social"]?["proposals"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var proposal=(JObject)property.Value;if(!hideChat)Text((string)proposal["speech"]);Text("条款：\n"+ReadableTerms(proposal["terms"]));Text("请分别回应，提议本身不会替你同意。");if((bool?)proposal["responded"]!=true)foreach(var response in new[]{"accept","decline"}){var answer=response;Button(content,answer=="accept"?"同意此版本条款":"拒绝此版本条款",()=>Mutate("consent",new JObject{["consent"]=new JObject{["operationId"]="consent-"+Guid.NewGuid().ToString("N"),["proposalId"]=proposal["id"],["proposalVersion"]=proposal["version"],["termsHash"]=proposal["termsHash"],["response"]=answer}}));}}
            foreach(var property in (Snapshot["social"]?["agreements"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var id=property.Name;Text("参与者："+String.Join("、",(property.Value["parties"] as JArray??new JArray()).Select(p=>PersonName((string)p)))+" · "+AgreementStatus((string)property.Value["status"]));if((string)property.Value["status"]=="active_plan")Button(content,"申请修订此约定",()=>Command("REQUEST_CHANGE",null,new JObject{["agreementId"]=id}));}
            Text("最近进展");var updates=(Snapshot["events"] as JArray??new JArray()).Select(SocialEventLabel).Where(v=>v!=null).TakeLast(10).ToArray();if(updates.Length==0)Text("暂无协作进展。伙伴提出提议后，可以在此查看条款并决定是否同意。");else foreach(var update in updates)Text(update);
        }
        int Stock(string resource)=>(int?)Snapshot?["inventory"]?[resource]??0;
        string ModelLabel(string head){var hash=(string)Snapshot["models"]?[head]?["modelHash"];return hash==null?"规则兜底":hash.Substring(0,Math.Min(12,hash.Length));}
        static string ResourceName(string value)=>value=="wood"?"木材":value=="stone"?"石头":value=="rope"?"麻绳":value;
        static string RecipeName(string id)=>id=="WPN001"?"木棍":id=="WPN002"?"木剑":id=="WPN003"?"简易弓":id=="WPN004"?"石刃短剑":id=="WPN005"?"强化长弓":id=="WPN006"?"狼牙战斧":id;
        void Text(string value){var label=Label(content,value??"",16);AutoTextHeight(label.gameObject);}
        void Bind(Func<string> value){var label=Label(content,value(),16);Height(label.gameObject,64);bindings.Add((label,value));}
        Text Label(Transform parent,string value,int size){var t=Rect(value,parent).gameObject.AddComponent<Text>();t.font=font;t.fontSize=Mathf.Max(14,size);t.color=new Color(.92f,.94f,.86f);t.text=value;t.supportRichText=false;t.raycastTarget=false;t.horizontalOverflow=HorizontalWrapMode.Wrap;return t;}
        Button Button(Transform parent,string value,Action action)
        {
            var rect=Rect(value,parent);var image=rect.gameObject.AddComponent<Image>();
            var skin=NativeUiSurface.Apply(image,4);skin.Shadow=false;skin.Set(Ink,Ink,Line,4);
            var button=rect.gameObject.AddComponent<Button>();button.targetGraphic=image;rect.gameObject.AddComponent<NativeUiHover>();
            var colors=button.colors;colors.normalColor=new Color(1,1,1,0);colors.highlightedColor=new Color(.8f,.7f,.4f,.16f);colors.pressedColor=new Color(.8f,.7f,.4f,.3f);colors.selectedColor=colors.highlightedColor;colors.disabledColor=new Color(0,0,0,.22f);button.colors=colors;
            Height(rect.gameObject,34);var width=rect.GetComponent<LayoutElement>();width.preferredWidth=320;width.flexibleWidth=0;var label=Label(rect,value,16);label.alignment=TextAnchor.MiddleLeft;
            var r=(RectTransform)label.transform;r.anchorMin=Vector2.zero;r.anchorMax=Vector2.one;r.offsetMin=new Vector2(12,4);r.offsetMax=new Vector2(-12,-4);
            button.onClick.AddListener(()=>{GetComponent<NativeGameAudio>()?.Click();action();});return button;
        }
        static RectTransform Rect(string name,Transform parent){var rect=new GameObject(name,typeof(RectTransform)).GetComponent<RectTransform>();rect.SetParent(parent,false);return rect;}
        static void Height(GameObject obj,float height){var layout=obj.AddComponent<LayoutElement>();layout.minHeight=height;layout.preferredHeight=height;layout.flexibleHeight=0;layout.flexibleWidth=1;}
        static void AutoTextHeight(GameObject obj,float minimum=32){var layout=obj.AddComponent<LayoutElement>();layout.minHeight=minimum;layout.preferredHeight=-1;layout.flexibleHeight=0;layout.flexibleWidth=1;}
        void OnDestroy(){if(root!=null)Destroy(root.gameObject);if(workshopModel!=null)Destroy(workshopModel);if(workshopMaterial!=null)Destroy(workshopMaterial);foreach(var item in enemies.Values)Destroy(item);foreach(var item in nodes.Values)Destroy(item);foreach(var item in carriedBags.Values)Destroy(item);foreach(var item in equippedModels.Values)Destroy(item);}
    }
}
