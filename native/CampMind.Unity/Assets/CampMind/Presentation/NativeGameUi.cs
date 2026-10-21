using System;
using System.Linq;
using System.Collections.Generic;
using System.Collections;
using System.Threading.Tasks;
using System.IO;
using System.Globalization;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace CampMind.Presentation
{
    [DefaultExecutionOrder(50)]
    public sealed partial class NativeGameUi:MonoBehaviour
    {
        NativeCampView view;
        JObject villageCognition;
        JToken CognitionSettings=>villageHud?villageCognition:view.World?["agency"];
        RectTransform root,modal,modalBlocker,discardPrompt,body,channelBody;
        Text header,status,selection,channelText,audioState,modelStatus,clockText,dayText,periodText,channelCount;
        readonly List<NativeCrewPortrait> portraits=new List<NativeCrewPortrait>();
        readonly List<GameObject> speedMarks=new List<GameObject>();
        readonly List<Text> speedLabels=new List<Text>();
        readonly Text[] resourceValues=new Text[3];
        RectTransform commandDock,hud;
        string controlledNpc;
        bool memoryExpanded,recordsExpanded,campLoading;string memoryNpc,memoryCursor,memoryGeneration,memoryBranch,campMemoryError;
        readonly List<JToken> campMemories=new List<JToken>();
        bool journeyAdvanced;string journeyDifficulty="cozy",journeyMode="model",journeyScenario="standard",journeySeed="64138";
        readonly List<Text> crew=new List<Text>();
        readonly List<Text> channelTabs=new List<Text>();
        readonly List<Image[]> crewMeters=new List<Image[]>();
        readonly NativeWorldChannel channel=new NativeWorldChannel();
        Font font,serif;Sprite rounded;
        void Round(Image image){if(rounded==null){var texture=Resources.Load<Texture2D>("Hud/rounded");if(texture!=null)rounded=Sprite.Create(texture,new Rect(0,0,64,64),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(16,16,16,16));}image.sprite=rounded;image.type=Image.Type.Sliced;}
        NativeActorOverlay actorOverlay;
        float nextRefresh,nextModelPoll;
        string modelStage="等待加载";
        string tab="全部",page="",channelSignature="\0";
        string socialSignature="";
        string lastError="";float errorUntil;
        bool dispatch;
        string dispatchScope,dispatchNpc;
        bool dispatchLordView;
        Vector2 pointerStart;
        bool scenePointer,sceneMoved;
        static readonly Key[] NumberKeys={Key.Digit1,Key.Digit2,Key.Digit3,Key.Digit4,Key.Digit5,Key.Digit6,Key.Digit7,Key.Digit8,Key.Digit9};
        public bool DispatchArmed=>dispatch;
        bool settingsDirty,resumeOnClose,previousBlocked,backdropPending,backdropReady;
        Texture2D backdropTexture;Material backdropMaterial;RawImage backdropCapture;
        int panelVersion;
        bool waitingForStart;
        string startScope;
        float startDeadline;
        public bool HasControl(string name)=>root!=null&&root.GetComponentsInChildren<Transform>(true).Any(t=>t.name==name);
        public Canvas Canvas=>root==null?null:root.GetComponent<Canvas>();
        public void Initialize(NativeCampView target)
        {
            if(root!=null)return;view=target;
            font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular");
            serif=Resources.Load<Font>("Fonts/NotoSerifCJKsc-Regular");
            if(font==null)throw new InvalidOperationException("缺少随游戏发布的中文字体");
            root=Rect("营地游戏界面",null,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            root.localScale=Vector3.one;root.localRotation=Quaternion.identity;
            var canvas=root.gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.pixelPerfect=true;
            var scaler=root.gameObject.AddComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1920,1080);scaler.matchWidthOrHeight=0;
            root.gameObject.AddComponent<GraphicRaycaster>();
            var actors=Rect("角色头顶反馈",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);actors.gameObject.AddComponent<Canvas>();actorOverlay=actors.gameObject.AddComponent<NativeActorOverlay>();
            actorOverlay.Initialize(view,font,id=>channel.Items.LastOrDefault(m=>m.NpcId==id&&m.Conversation));
            if(Application.isPlaying&&EventSystem.current==null){var es=new GameObject("营地输入",typeof(EventSystem),typeof(InputSystemUIInputModule));es.transform.SetParent(root,false);}
            hud=Rect("原版边缘HUD",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            BuildReferenceTopHud();
            var left=Rect("伙伴列表",hud,new Vector2(0,1),new Vector2(0,1),new Vector2(16,-478),new Vector2(138,-78));
            var ids=new[]{"azhuang","xiaomi","laozhou","linlan","aye","tiesheng","aling","xiaoman","shenyan"};
            for(var i=0;i<ids.Length;i++){var id=ids[i];var x=i%2*64;var y=3+i/2*78;var t=Button(left,id,x,y,56,76,()=>{controlledNpc=controlledNpc==id?null:id;view.SelectNpc(id);dispatch=false;});NativeUiSurface.Plain((Image)t.GetComponentInParent<Button>().targetGraphic);crew.Add(t);var portrait=t.transform.parent.gameObject.AddComponent<NativeCrewPortrait>();portrait.Build(id,i,font,t);portraits.Add(portrait);}
            BuildReferenceChannel();
            BuildReferenceAtlas();
            commandDock=Panel("任务与交互",hud,new Vector2(.5f,0),new Vector2(.5f,0),new Vector2(-240,12),new Vector2(240,64));
            selection=Button(commandDock,"伙伴互动",3,3,76,46,()=>Open("伙伴互动"));selection.fontSize=14;NativeUiSurface.Plain((Image)selection.GetComponentInParent<Button>().targetGraphic);
            var labels=new[]{"派遣到地图","伐木","采食","休息","互助","狩猎"};var actions=new[]{"move","wood","food","rest","help","hunt"};var icons=new[]{"MapPin","Axe","Apple","BedDouble","HeartHandshake","Compass"};
            for(var i=0;i<labels.Length;i++){var action=actions[i];var t=Button(commandDock,labels[i],83+i*65,3,63,46,()=>{if(action=="move"){if(view.lordView)return;dispatch=!dispatch;dispatchScope=view.Authority?.gate.Scope;dispatchNpc=view.SelectedNpc;dispatchLordView=view.lordView;}else if(action=="hunt")Command("hunt");else Command("assign",new JObject{["action"]=action});});NativeUiSurface.Plain((Image)t.GetComponentInParent<Button>().targetGraphic);t.text=i==0?"派遣":labels[i];t.fontSize=14;t.alignment=TextAnchor.MiddleRight;Icon(t.transform.parent,icons[i],4,14,18);}
            var utility=Rect("营地快捷入口",hud,new Vector2(1,0),new Vector2(1,0),new Vector2(-56,12),new Vector2(-12,104));
            IconButton(utility,"林间手记","BookOpen",0,0,()=>Open("营地日志"));IconButton(utility,"营地选项","House",0,46,()=>Open("营地管理"));utility.gameObject.SetActive(false);
            status=Label(hud,"",580,62,660,25,12);
            modalBlocker=Panel("菜单遮罩",root,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);modalBlocker.GetComponent<Image>().color=new Color(0,0,0,.35f);modalBlocker.gameObject.SetActive(false);
            modal=Panel("功能窗口",root,new Vector2(.5f,.5f),new Vector2(.5f,.5f),new Vector2(-500,-370),new Vector2(500,370));modal.gameObject.SetActive(false);
            Refresh();
        }
        void Update()
        {
            if(view==null)return;
            if(dispatch&&(dispatchScope!=view.Authority?.gate.Scope||dispatchNpc!=view.SelectedNpc||dispatchLordView!=view.lordView))dispatch=false;
            var selectedObject=EventSystem.current?.currentSelectedGameObject;
            view.InputBlocked=BlocksWorldInput(modal.gameObject.activeSelf,selectedObject);
            view.PointerBlocked=EventSystem.current?.IsPointerOverGameObject()==true;
            if(view.InputBlocked&&!previousBlocked)view.Authority?.ReleaseMotion();previousBlocked=view.InputBlocked;
            if(Keyboard.current?.escapeKey.wasPressedThisFrame==true){if(dispatch)dispatch=false;else if(modal.gameObject.activeSelf)Close();else controlledNpc=null;}
            SceneMouse();Shortcuts(selectedObject);
            if(Time.unscaledTime>=nextRefresh){nextRefresh=Time.unscaledTime+.2f;Refresh();}
        }
        void OnApplicationFocus(bool value){if(!value)scenePointer=false;}
        public static bool BlocksWorldInput(bool modalOpen,GameObject selected)=>modalOpen||(selected!=null&&selected.activeInHierarchy&&selected.GetComponent<InputField>()?.isFocused==true);
        void OnDestroy(){if(backdropTexture!=null)Destroy(backdropTexture);if(backdropMaterial!=null)Destroy(backdropMaterial);if(root!=null){if(Application.isPlaying)Destroy(root.gameObject);else DestroyImmediate(root.gameObject);}}
        void SceneMouse()
        {
            var mouse=Mouse.current;if(mouse==null||view.InputBlocked){scenePointer=false;return;}
            if(mouse.leftButton.wasPressedThisFrame&&!view.PointerBlocked){scenePointer=true;sceneMoved=false;pointerStart=mouse.position.ReadValue();}
            if(!scenePointer)return;
            if(Vector2.Distance(mouse.position.ReadValue(),pointerStart)>6)sceneMoved=true;
            if(mouse.leftButton.isPressed&&sceneMoved&&!view.PointerBlocked){if(view.lordView)view.ApplyPointerInput(mouse.delta.ReadValue(),0,true);else view.ApplyPanInput(mouse.delta.ReadValue(),Screen.height);}
            if(!mouse.leftButton.wasReleasedThisFrame)return;scenePointer=false;
            if(sceneMoved||view.PointerBlocked||view.lordView)return;
            var ray=view.viewCamera.ScreenPointToRay(mouse.position.ReadValue());
            if(dispatch){if(Physics.Raycast(ray,out var hit,4000,1<<9)){var logical=view.Space.ToLogical(hit.point);Command("move",new JObject{["target"]=new JObject{["x"]=logical.x,["y"]=logical.y}});dispatch=false;}}
            else{var id=view.PickNpc(ray);if(id!=null){controlledNpc=null;view.SelectNpc(id);}}
        }
        void Shortcuts(GameObject selectedObject)
        {
            var key=Keyboard.current;if(key==null||view.InputBlocked||key.ctrlKey.isPressed||key.altKey.isPressed||key.leftMetaKey.isPressed||key.rightMetaKey.isPressed)return;
            var people=VillageProjection()?["npcs"] as JArray;
            for(var i=0;i<NumberKeys.Length;i++)if(key[NumberKeys[i]].wasPressedThisFrame&&people?.ElementAtOrDefault(i)!=null){controlledNpc=null;view.SelectNpc((string)people[i]["id"]);dispatch=false;}
            if(key.spaceKey.wasPressedThisFrame&&(selectedObject==null||selectedObject.GetComponent<Button>()==null))Action(new JObject{["type"]="pause",["paused"]=(string)view.World?["status"]=="playing"});
            var action=key.qKey.wasPressedThisFrame?"wood":key.wKey.wasPressedThisFrame&&!view.lordView?"food":key.rKey.wasPressedThisFrame?"rest":key.tKey.wasPressedThisFrame?"help":null;
            if(action!=null&&controlledNpc==view.SelectedNpc)Command("assign",new JObject{["action"]=action});
        }
        void Action(JObject action){if(villageHud){var type=(string)action["type"];if(type=="agency-model"||type=="agency-settings"){
            var settings=type=="agency-model"?new JObject{["modelId"]=action["modelId"]?.DeepClone(),["enabled"]=(bool?)CognitionSettings?["enabled"]??true,["cognition"]=true}:new JObject{["modelId"]=action["modelId"]?.DeepClone(),["enabled"]=action["enabled"]?.DeepClone(),["cognition"]=action["cognition"]?.DeepClone()};
            view.Authority?.Api("/game-api/cognition-settings",settings,(result,error)=>{if(error!=null){lastError=error;errorUntil=Time.unscaledTime+5;return;}villageCognition=result;if(page=="游戏设置")Open("游戏设置");});return;
        }var v=GetComponent<NativeVillageUi>();if(type=="pause"){if(action["paused"]!=null)v?.SetPaused((bool)action["paused"]);else v?.TogglePause();return;}if(type=="speed"){v?.ChangeSpeed((int)action["speed"]);return;}}view.Authority?.Enqueue(action);}
        void Command(string type,JObject extra=null){extra=extra??new JObject();extra["npcId"]=view.SelectedNpc;view.SendCommand(type,extra);}
        void Refresh()
        {
            var state=VillageProjection();var bridge=view.Authority;
            if(waitingForStart)
            {
                if(state!=null&&bridge?.gate.Scope!=startScope){waitingForStart=false;resumeOnClose=false;Close();}
                else if(Time.unscaledTime>startDeadline||!string.IsNullOrEmpty(bridge?.Error)){waitingForStart=false;status.text=bridge?.Error??"开始旅程超时，请重试";}
            }
            if(!string.IsNullOrEmpty(bridge?.Error)&&lastError!=bridge.Error){lastError=bridge.Error;errorUntil=Time.unscaledTime+5;}
            if(page=="游戏设置"&&modelStatus!=null)
            {
                modelStatus.text=$"当前认知绑定：{CognitionModelName()} · 自主行为 {((bool?)CognitionSettings?["enabled"]==false?"关闭":"开启")} · 大模型认知 {((bool?)CognitionSettings?["cognition"]==false?"关闭":"开启")}\n本地模型：{modelStage}";
                if(Time.unscaledTime>=nextModelPoll){nextModelPoll=Time.unscaledTime+2;var version=panelVersion;bridge?.Api("/game-api/native-models",null,(result,error)=>{if(version!=panelVersion)return;var stage=(string)result?["status"]?["stage"];modelStage=error??(stage=="ready"?"已就绪":stage=="error"?"加载失败":stage=="idle"?"等待加载":"加载中");});}
            }
            header.text=state==null?"木材 0    食物 0    篝火 熄灭":$"木材 {Math.Floor((double)state["wood"])}    食物 {Math.Floor((double)state["food"])}    篝火 {((double)state["fire"]>0?"燃烧":"熄灭")}";
            header.text="";
            var clockValue=NativeCampClock.Read((double?)state?["elapsed"]??0);dayText.text=$"第 {clockValue.Day} 天";clockText.text=$"{clockValue.Minutes/60:00}:{clockValue.Minutes%60:00}";periodText.text=clockValue.Period;
            if(villageHud&&state!=null){var elapsed=(double)state["elapsed"];var phase=elapsed%720;dayText.text=$"第 {(int)(elapsed/720)+1} 天";var minutes=(int)(phase<480?360+phase/480*720:1080+(phase-480)/240*720)%1440;clockText.text=$"{minutes/60:00}:{minutes%60:00}";periodText.text=phase>=480?"晚上":phase>=320?"下午":phase>=160?"中午":"早上";}
            var periodIcon=clockValue.Period=="晚上"?"Moon":clockValue.Period=="下午"?"Sunset":clockValue.Period=="中午"?"Sun":"Sunrise";SetIcon(periodText.transform.parent,periodIcon);
            SetIcon(audioState.transform.parent,GetComponent<NativeGameAudio>()?.SoundEnabled==false?"VolumeX":"Volume2");
            var pauseButton=root.GetComponentsInChildren<Button>(true).FirstOrDefault(button=>button.name=="暂停 / 继续");if(pauseButton!=null)SetIcon(pauseButton.transform,(string)state?["status"]=="playing"?"PauseFill":"PlayFill");
            var gateButton=root.GetComponentsInChildren<Button>(true).FirstOrDefault(button=>button.name=="寨门开关");if(gateButton!=null)gateButton.GetComponentInChildren<Text>().text=view.GateOpen?"关闭寨门":"打开寨门";
            var speedValue=villageHud?(int?)GetComponent<NativeVillageUi>()?.Snapshot?["speed"]??1:(int?)bridge?.gate.Snapshot?["speed"]??1;for(var i=0;i<speedMarks.Count;i++){var active=speedValue==new[]{1,2,4}[i];speedMarks[i].SetActive(active);speedLabels[i].color=active?new Color32(243,199,106,255):new Color32(190,203,178,255);}
            status.text=bridge==null?"正在启动本地世界…":!bridge.Connected?"连接中："+bridge.Error:!bridge.ReadyForActions?"正在恢复离线世界…":dispatch?"点击地图指定目的地 · Esc 取消":"";
            if(Time.unscaledTime<errorUntil)status.text=lastError;
            if(villageHud){status.text="";var village=GetComponent<NativeVillageUi>();if(!string.IsNullOrEmpty(village?.Error))status.text=village.Error;else if((int?)village?.Snapshot?["inventory"]?["food"]==0)status.text="粮食不足，请采集食物并存入营地。";}
            commandDock.gameObject.SetActive(!villageHud&&state!=null&&controlledNpc==view.SelectedNpc&&!modal.gameObject.activeSelf);
            var npcs=state?["npcs"] as JArray;
            for(var i=0;i<portraits.Count;i++){var n=npcs?.ElementAtOrDefault(i);portraits[i].Present(n,(string)n?["id"]==view.SelectedNpc);}
            var npc=npcs?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);selection.text=npc==null?"":$"{npc["name"]}⌃\n{Task((string)npc["action"])}";
            if(villageHud)selection.text="领主行动⌃\n伙伴互动";
            if(bridge?.gate.Snapshot!=null)channel.Capture(bridge.gate.Snapshot);
            if(villageHud&&GetComponent<NativeVillageUi>()?.Snapshot is JObject villageSnapshot)channel.CaptureVillage(villageSnapshot);
            if(!villageHud)actorOverlay.Present(state);
            var text=string.Join("\n\n",channel.Items.Where(m=>tab=="全部"||(tab=="频道")==m.Conversation).Select(m=>$"{m.Speaker}{(string.IsNullOrEmpty(m.Recipients)?"":" → "+m.Recipients)}{(string.IsNullOrEmpty(m.Source)?"":" ["+m.Source+"]")}\n{m.Text}"));
            foreach(var entry in channelTabs){var active=(entry.text=="世界频道"?"全部":entry.text=="队伍"?"频道":entry.text)==tab;entry.color=active?new Color32(243,209,144,255):new Color32(170,191,155,255);var skin=entry.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>();skin.Shadow=false;skin.Set(active?new Color32(63,77,45,255):Color.clear,active?new Color32(63,77,45,255):Color.clear,active?new Color32(208,192,126,90):Color.clear,7);}
            foreach(var mode in new[]{"领主视角","上帝视角"}){var button=root.GetComponentsInChildren<Button>(true).FirstOrDefault(b=>b.name==mode);if(button!=null){var active=(mode=="领主视角")==view.lordView;button.GetComponentInChildren<NativeUiSurface>().Set(active?new Color32(72,75,43,180):Color.clear,active?new Color32(72,75,43,180):Color.clear,active?new Color32(221,190,113,90):Color.clear);button.GetComponentInChildren<Text>().color=active?new Color32(238,211,148,255):new Color32(184,200,169,255);}}
            var visibleMessages=channel.Items.Where(m=>tab=="全部"||(tab=="频道")==m.Conversation).ToArray();channelCount.text=$"最新 {visibleMessages.Length}/{(tab=="全部"?150:tab=="系统"?50:100)} 条";
            if(channelSignature!=text)
            {
                channelSignature=text;channelText.text="";channelText.GetComponent<ContentSizeFitter>().verticalFit=ContentSizeFitter.FitMode.Unconstrained;
                foreach(Transform child in channelBody)Destroy(child.gameObject);
                var y=0f;
                foreach(var message in channel.Items.Where(m=>tab=="全部"||(tab=="频道")==m.Conversation))
                {
                    var value=$"[{(!message.Conversation?"系统":message.Source=="player"?"指令":"对话")}] {message.Speaker}：{(string.IsNullOrEmpty(message.Recipients)?"":"@"+message.Recipients+" ")}{message.Text}";
                    var replyId=!string.IsNullOrEmpty(message.NpcId)&&message.Recipients.Contains("领主")?message.NpcId:null;
                    y+=ChannelMessage(value,replyId,y,message.Source=="player"?new Color32(142,210,255,255):message.Conversation?new Color32(230,226,204,255):new Color32(181,198,174,255));
                }

                channelBody.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Mathf.Max(y,50));Canvas.ForceUpdateCanvases();channelBody.GetComponentInParent<ScrollRect>().verticalNormalizedPosition=0;
            }
            RefreshReferenceHud(state);
            if(state==null&&!waitingForStart&&bridge?.ReadyForActions==true&&!modal.gameObject.activeSelf)Open("开始旅程");
            if(page=="营地对话"&&SocialSignature()!=socialSignature)Open("营地对话");
        }
        string SocialSignature()=>view.SelectedNpc+":"+view.World?["social"]?["revision"]+":"+view.World?["socialLife"]?["sequence"]+":"+view.World?["socialLife"]?["choices"]?.ToString(Newtonsoft.Json.Formatting.None)+":"+view.Authority?.gate.Snapshot?["moderationVersion"];
        static string Number(JToken token)=>((double?)token??0).ToString("0");
        static string Weather(string value)=>value=="storm"?"雷暴":value=="rain"?"降雨":value=="wind"?"大风":"晴朗";
        static string Task(string value){var ids=new[]{"wood","food","fire","eat","rest","help","camp","explore"};var names=new[]{"伐木","采食","添柴","进食","休息","互助","返回营地","探索"};var index=Array.IndexOf(ids,value??"");return index<0?"自主行动":names[index];}
        void Close()
        {
            if(waitingForStart)return;
            if(discardPrompt!=null){Destroy(discardPrompt.gameObject);discardPrompt=null;return;}
            if(settingsDirty){ConfirmDiscard(Close);return;}
            backdropReady=false;if(backdropCapture!=null)backdropCapture.gameObject.SetActive(false);
            modal.gameObject.SetActive(false);modalBlocker.gameObject.SetActive(false);EventSystem.current?.SetSelectedGameObject(null);commandDock.gameObject.SetActive(!villageHud&&view.World!=null&&controlledNpc==view.SelectedNpc);modalBlocker.GetComponent<Image>().color=new Color(0,0,0,.35f);page="";panelVersion++;
            if(resumeOnClose){resumeOnClose=false;Action(new JObject{["type"]="pause",["paused"]=false,["temporary"]=true});}
        }
        void ConfirmDiscard(Action next)
        {
            if(discardPrompt!=null)return;
            discardPrompt=Panel("未保存修改",modal,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);
            Label(discardPrompt,"有未保存的角色修改，是否放弃？",70,180,850,70,25);
            Button(discardPrompt,"保留修改，返回",70,300,350,60,()=>{Destroy(discardPrompt.gameObject);discardPrompt=null;});
            Button(discardPrompt,"放弃未保存修改",470,300,350,60,()=>{settingsDirty=false;Destroy(discardPrompt.gameObject);discardPrompt=null;next();});
        }
        IEnumerator CaptureModalBackdrop(string name)
        {
            backdropPending=true;yield return new WaitForEndOfFrame();
            if(villageHud&&name=="开始旅程"){backdropPending=false;yield break;}
            if(backdropTexture!=null)Destroy(backdropTexture);backdropTexture=ScreenCapture.CaptureScreenshotAsTexture();
            if(backdropCapture==null){var capture=Rect("原版六像素模糊遮罩",modalBlocker,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero);backdropCapture=capture.gameObject.AddComponent<RawImage>();backdropMaterial=new Material(Resources.Load<Shader>("Hud/ModalBlur"));backdropCapture.material=backdropMaterial;backdropCapture.raycastTarget=false;}
            backdropCapture.texture=backdropTexture;backdropCapture.gameObject.SetActive(true);backdropReady=true;backdropPending=false;Open(name);
        }
        void Open(string name)
        {
            if(villageHud&&(name=="营地管理"||name=="伙伴互动"||name=="营地对话")){GetComponent<NativeVillageUi>()?.ShowManagement(name=="营地管理"?"营地":name=="营地对话"?"协作":"人物");return;}
            if(villageHud&&name=="开始旅程")return;
            if(backdropPending)return;
            if(Application.isPlaying&&SystemInfo.graphicsDeviceType!=UnityEngine.Rendering.GraphicsDeviceType.Null&&!modal.gameObject.activeSelf&&!backdropReady){StartCoroutine(CaptureModalBackdrop(name));return;}

            if(settingsDirty&&page!=name){ConfirmDiscard(()=>Open(name));return;}
            if(!modal.gameObject.activeSelf&&(string)view.World?["status"]=="playing"){resumeOnClose=true;Action(new JObject{["type"]="pause",["paused"]=true,["temporary"]=true});}
            dispatch=false;page=name;panelVersion++;commandDock.gameObject.SetActive(false);
            foreach(Transform child in modal)if(child.GetComponent<NativeUiSurface>()==null)Destroy(child.gameObject);
            modal.gameObject.SetActive(true);
            modalBlocker.gameObject.SetActive(true);if(backdropReady)modalBlocker.GetComponent<Image>().color=Color.clear;
            modal.offsetMin=new Vector2(-500,-370);modal.offsetMax=new Vector2(500,370);
            modal.anchorMin=modal.anchorMax=new Vector2(.5f,.5f);modal.pivot=new Vector2(.5f,.5f);
            if(name=="开始旅程"){Journey();return;}
            if(new[]{"伙伴互动","状态与记忆","性格与关系","营地管理"}.Contains(name)){CampPanel(name);return;}
            if(name=="操作帮助"){HelpPanel();return;}
            if(name=="营地日志"){JournalPanel();return;}
            if(name=="决策记录"){DecisionPanel();return;}
            if(name=="天气"){WeatherPanel();return;}
            if(name=="确认退出"){QuitConfirmation();return;}
            var heading=Label(modal,name,24,15,800,48,24);heading.font=serif??font;heading.fontStyle=FontStyle.Bold;Button(modal,"关闭",870,20,100,40,Close);
            body=Rect("窗口内容",modal,new Vector2(0,0),new Vector2(1,1),new Vector2(24,24),new Vector2(-24,-82));
            var campTabs=new[]{"伙伴互动","状态与记忆","性格与关系","营地管理"};
            if(campTabs.Contains(name))
            {
                for(var i=0;i<campTabs.Length;i++){var entry=campTabs[i];Button(body,entry,i*235,0,224,42,()=>Open(entry));}
                body=Rect("营地页签内容",body,Vector2.zero,Vector2.one,Vector2.zero,new Vector2(0,-62));
            }
            if(name=="菜单")
            {
                var pages=new[]{"继续游戏","开始旅程","伙伴互动","状态与记忆","性格与关系","营地管理","决策记录","营地日志","天气","对话历史","游戏设置","远程模型","角色初始设置","世界地图","保存进度副本","操作帮助","退出游戏"};
                for(var i=0;i<pages.Length;i++){var entry=pages[i];Button(body,entry,(i%3)*310,(i/3)*85,290,64,()=>{if(entry=="继续游戏")Close();else if(entry=="退出游戏")Quit();else Open(entry);});}return;
            }
            if(name=="天气") {var kinds=new[]{"clear","wind","rain","storm"};for(var i=0;i<4;i++){var kind=kinds[i];Button(body,Weather(kind),i*210,20,190,55,()=>view.SendCommand("weather",new JObject{["weather"]=kind}));}return;}
            if(name=="营地对话"){SocialPanel();return;}
            if(name=="营地管理") {var values=new[]{"balanced","wood","food"};var labels=new[]{"均衡发展","优先木材","优先食物"};for(var i=0;i<3;i++){var priority=values[i];Button(body,labels[i],i*260,20,240,50,()=>view.SendCommand("priority",new JObject{["priority"]=priority}));}Button(body,"召回全部伙伴",0,110,240,50,()=>view.SendCommand("recall"));Button(body,"寨门开关",260,110,240,50,()=>view.SendCommand("gate-toggle"));return;}
            if(name=="游戏设置"){GameSettings();return;}
            if(name=="确认重置") {var error=Label(body,"确认清除当前世界与历史？模型配置与角色初始设置保留。",0,0,900,60,23);Button(body,"确认重置世界",0,100,300,52,()=>{try{Action(new JObject{["type"]="reset",["npcSettings"]=new NativeNpcSettings().Load()});Close();}catch(Exception e){error.text=e.Message;}});return;}
            if(name=="对话历史"){History();return;}
            if(name=="远程模型"){RemoteModels();return;}
            if(name=="角色初始设置"){NpcSettings();return;}
            if(name=="世界地图")
            {
                var map=At("鹰眼地图",body,0,0,560,560);map.gameObject.AddComponent<RawImage>();var atlas=map.gameObject.AddComponent<NativeWorldAtlas>();atlas.Initialize(view,true);
                Label(body,"N ↑\n点击地图定位镜头\n拖动浏览 · 滚轮缩放\n黑色为尚未探索区域\n移动镜头不会探索",590,0,300,220,21);
                Button(body,"镜头返回营地",590,250,290,48,atlas.Home);Button(body,"跟随选中伙伴",590,320,290,48,atlas.Follow);
                Button(body,"扩大地图范围",590,390,290,48,()=>atlas.Zoom(1.5f));Button(body,"缩小地图范围",590,460,290,48,()=>atlas.Zoom(1/1.5f));return;
            }
            if(name=="保存进度副本")
            {
                var feedback=Label(body,"世界会自动保存。此处导出可携带的进度 JSON 副本。",0,0,900,70,21);
                Button(body,"导出进度 JSON",0,100,300,52,()=>PickFile(true,"导出营地进度","campmind-save.json",feedback,destination=>{if(view.World==null)throw new InvalidOperationException("当前没有世界进度");File.WriteAllText(destination,view.World.ToString());feedback.text="进度副本已保存";}));return;
            }
            string content;
            if(name=="操作帮助")content="领主视角：WASD 移动，左键或右键拖动旋转\n上帝视角：左键拖动平移，右键拖动旋转\n滚轮：缩放镜头\n1–9：选择伙伴\nQ / W / R / T：伐木 / 采食 / 休息 / 互助（领主视角 W 用于移动）\n空格：暂停 / 继续\nTab：切换领主 / 上帝视角\nHome：恢复镜头\nEsc：取消派遣 / 关闭菜单\n\n派遣必须先切换上帝视角，点击‘派遣到地图’，再点击地图。\n\n世界自动保存。暂停时不会继续消耗资源。篝火随木材库存亮灭，无需添柴。";
            else if(name=="营地日志")content=string.Join("\n\n",(view.World?["events"] as JArray??new JArray()).Reverse().Select(e=>(string)e["text"]));
            else if(name=="决策记录")content=string.Join("\n\n",(view.World?["decisions"] as JArray??new JArray()).Reverse().Take(100).Select(d=>$"{d["npcId"]} · {Task((string)d["action"])} · {d["source"]} · {d["latencyMs"]}ms\n允许行动：{d["allowed"]}\n评分：{d["scores"]}\n特征：{d["features"]}"));
            else if(name=="对话历史")content=string.Join("\n\n",channel.Items.Where(m=>m.Conversation).Select(m=>$"{m.Speaker} → {m.Recipients}\n{m.Text}"));
            else content=PartnerDescription(name);
            if(name=="状态与记忆")
            {
                Scroll(body,name+"内容",new Vector2(0,70),Vector2.zero,out var memoryText);memoryText.text=content;
                string cursor=null,generation=null,branch=null;var version=panelVersion;var npcId=view.SelectedNpc;var records=new List<string>();
                Button(body,"加载更早经历",0,0,240,48,()=>{
                    var query="/game-api/memories?npc="+Uri.EscapeDataString(npcId)+(cursor==null?"":"&before="+cursor)+(generation==null?"":"&generation="+Uri.EscapeDataString(generation)+"&branch="+Uri.EscapeDataString(branch));
                    view.Authority?.Api(query,null,(result,error)=>{if(version!=panelVersion)return;if(error!=null){memoryText.text=error;return;}
                        generation=(string)result["generation"];branch=(string)result["branch"];cursor=(string)result["cursor"];
                        records.AddRange((result["items"] as JArray??new JArray()).Select(e=>$"{e["fact"]}\n{e["interpretation"]}"));memoryText.text=string.Join("\n\n",records);});
                },true);return;
            }
            Scroll(body,name+"内容",Vector2.zero,Vector2.zero,out var text);text.text=string.IsNullOrEmpty(content)?"暂无记录":content;
        }
        void History()
        {
            Scroll(body,"全部历史记录",new Vector2(0,70),new Vector2(0,-45),out var text);
            var info=Label(body,"读取中…",0,0,900,40,20);var version=panelVersion;var current=1;var pages=1;string through=null,scope=null;
            void Load(int next,bool refresh=false)
            {
                if(refresh){through=null;scope=null;}text.text="正在读取…";
                view.Authority?.Api("/game-api/conversations?page="+next+(through==null?"":"&through="+through+"&scope="+Uri.EscapeDataString(scope)),null,(result,error)=>{
                    if(version!=panelVersion)return;if(error!=null){text.text=error;return;}
                    current=(int)result["page"];pages=(int)result["pages"];through=(string)result["through"];scope=(string)result["scope"];
                    info.text=$"共 {result["total"]} 条 · 第 {current} / {pages} 页";
                    text.text=string.Join("\n\n",(result["items"] as JArray??new JArray()).Select(m=>$"{m["speaker"]} → {string.Join("、",(m["recipients"] as JArray??new JArray()).Select(x=>(string)x))}\n{m["text"]}"));
                });
            }
            Button(body,"上一页",0,0,160,44,()=>{if(current>1)Load(current-1);},true);
            Button(body,"下一页",180,0,160,44,()=>{if(current<pages)Load(current+1);},true);
            Button(body,"刷新历史",360,0,180,44,()=>Load(1,true),true);Load(1);
        }
        void CampPanel(string selectedTab)
        {
            modal.offsetMin=new Vector2(-380,-370);modal.offsetMax=new Vector2(380,370);
            modal.GetComponentInChildren<NativeUiSurface>().Set(new Color32(34,57,44,255),new Color32(23,42,34,255),new Color32(146,163,114,110),20);
            var heading=Label(modal,"营地与伙伴",24,18,650,44,24);heading.font=serif??font;heading.fontStyle=FontStyle.Bold;
            var close=IconButton(modal,"关闭","X",692,18,Close);
            var person=(view.World?["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);
            var header=At("伙伴概况",modal,24,99,712,65);Icon(header,view.SelectedNpc,0,0,48);
            Label(header,(string)person?["role"]??"",60,0,420,16,9).color=new Color32(155,180,138,255);
            var name=Label(header,(string)person?["name"]??"",60,20,160,27,18);name.font=serif??font;
            var emotion=(string)person?["emotion"];var mood=emotion=="happy"?"愉快":emotion=="worried"?"担忧":emotion=="annoyed"?"不满":emotion=="caring"?"关切":"平静";
            Label(header,mood,120,25,150,20,10);Label(header,$"信任 {Number(person?["trust"])}  ·  健康 {Number(person?["health"])}",60,48,410,18,11).color=new Color32(174,193,149,255);
            for(var i=0;i<2;i++){var label=i==0?"精力":"饥饿";var value=(float?)person?[i==0?"energy":"hunger"]??0;Label(header,label,570,12+i*23,28,18,9);var bar=At(label+"状态",header,600,17+i*23,44,5).gameObject.AddComponent<Image>();bar.color=new Color(1,1,1,.12f);bar.raycastTarget=false;var fill=At(label+"数值",bar.transform,0,0,44*Mathf.Clamp01(value/100),5).gameObject.AddComponent<Image>();fill.color=i==0?new Color32(170,201,134,255):new Color32(223,151,120,255);fill.raycastTarget=false;Label(header,value.ToString("0")+"%",653,11+i*23,50,18,9);}
            var people=view.World?["npcs"] as JArray??new JArray();for(var i=0;i<people.Count;i++){var id=(string)people[i]["id"];var t=Button(modal,(string)people[i]["name"],24+i*79.2f,179,73.2f,44,()=>{view.SelectNpc(id);Open(selectedTab);});t.fontSize=14;if(id==view.SelectedNpc)t.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>().Set(new Color32(62,73,43,255),new Color32(62,73,43,255),new Color32(216,191,120,100));}
            var tabs=Panel("营地分类",modal,Vector2.zero,Vector2.zero,Vector2.zero,Vector2.zero);Place(tabs,24,244,712,51);
            var names=new[]{"伙伴互动","状态与记忆","性格与关系","营地管理"};for(var i=0;i<names.Length;i++){var tabName=names[i];var t=Button(tabs,tabName,4+i*176,4,172,43,()=>Open(tabName));t.fontSize=14;var skin=t.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>();if(tabName==selectedTab)skin.Set(new Color32(52,64,35,255),new Color32(52,64,35,255),new Color32(216,191,120,96));else NativeUiSurface.Plain((Image)t.GetComponentInParent<Button>().targetGraphic);}
            var viewport=At("营地独立滚动区",modal,24,311,712,405);viewport.gameObject.AddComponent<RectMask2D>();var hit=viewport.gameObject.AddComponent<Image>();hit.color=Color.clear;var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            body=Rect("营地分类内容",viewport,new Vector2(0,1),new Vector2(1,1),new Vector2(2,-800),new Vector2(-24,-2));body.pivot=new Vector2(.5f,1);scroll.content=body;
            var alive=(bool?)person?["alive"]!=false;
            if(selectedTab=="伙伴互动")
            {
                var talk=Card(body,"主动聊聊","听近况、商量分工和承诺","MessageCircle",0,0,684,58,()=>{Command("social-open");Open("营地对话");});talk.interactable=alive;
                var verbs=new[]{"praise","urge","feed","autonomy"};var labels=new[]{"鼓励","催促","分配食物","自主安排"};var notes=new[]{"给伙伴一点信心","提醒当前安排","消耗 1 份食物","让伙伴自己决定"};var icons=new[]{"Sparkles","Megaphone","Utensils","Leaf"};
                for(var i=0;i<4;i++){var verb=verbs[i];var button=Card(body,labels[i],notes[i],icons[i],i%2*346,69+i/2*84,338,76,()=>{if(verb=="autonomy")Command("assign",new JObject{["action"]=null});else Command(verb);});button.interactable=alive&&(verb!="feed"||(double?)view.World?["food"]>=1);}
                var y=245f;if(alive&&(double?)person?["health"]<=25){Card(body,"救治伙伴","消耗 2 份食物 · 恢复至 40 健康","HeartHandshake",0,y,338,76,()=>Command("rescue")).interactable=(double?)view.World?["food"]>=2;y+=84;}
                Label(body,"安排是建议，伙伴也会照顾自己的需要。",0,y,684,26,11).color=new Color32(151,176,135,255);body.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y+40);return;
            }
            if(selectedTab=="营地管理")
            {
                Label(body,"物资优先级",0,0,684,28,14);var priorities=new[]{"balanced","wood","food"};var labels=new[]{"均衡","多存木材","多备食物"};for(var i=0;i<3;i++){var priority=priorities[i];Button(body,labels[i],i*228,40,220,44,()=>view.SendCommand("priority",new JObject{["priority"]=priority}));}
                Card(body,"全员回寨","到村寨广场集合，携物先入仓","House",0,100,684,58,()=>{view.SendCommand("recall");Close();});
                Card(body,"决策观察","查看伙伴实际决策与记录","BarChart3",0,174,338,58,()=>Open("决策记录"));Card(body,"新旅程","开启新的村寨生活","RotateCcw",346,174,338,58,()=>Open("开始旅程"));
                Button(body,"角色初始设置 · 下局生效",0,250,250,44,()=>Open("角色初始设置"));Button(body,"游戏设置 · 对话模型",0,300,220,44,()=>Open("游戏设置"));
                Label(body,"伙伴台词",0,370,684,28,14);Label(body,"当前模型："+(string)view.World?["agency"]?["modelId"],0,407,684,26,12);
                Label(body,"世界自动保存 · 配置独立保留",0,451,684,24,11).color=new Color32(151,176,135,255);body.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,490);return;
            }
            if(selectedTab=="状态与记忆"){CampMemoryPanel(person);return;}CampProfilePanel(person);
        }
        void CampMemoryPanel(JToken npc)
        {
            if(memoryNpc!=view.SelectedNpc){memoryNpc=view.SelectedNpc;memoryExpanded=false;campMemories.Clear();memoryCursor=memoryGeneration=memoryBranch=campMemoryError=null;campLoading=false;}
            Label(body,$"饥饿 {Number(npc?["hunger"])}      精力 {Number(npc?["energy"])}      健康 {Number(npc?["health"])}",16,16,652,28,13);
            var person=view.World?["agency"]?["people"]?[view.SelectedNpc];var status=(string)person?["appraisalStatus"];
            Label(body,status=="pending"?"正在结合经历理解处境…":status=="ready"?"大模型认知已接纳":"当前由心智策略理解状态",16,58,652,26,12).color=new Color32(170,187,155,255);var y=102f;
            if(person?["appraisal"] is JObject appraisal){Label(body,((double?)view.World?["elapsed"]-(double?)person["appraisalAt"]>45)?"此前的状态理解":"当前状态理解",28,y,628,24,13).fontStyle=FontStyle.Bold;var summary=Label(body,(string)appraisal["summary"],28,y+31,628,120,13);var height=Mathf.Max(40,summary.preferredHeight);Label(body,"目标："+(string)appraisal["goal"]+" · 基于 "+(appraisal["evidenceIds"] as JArray)?.Count+" 条经历",28,y+height+38,628,38,11);y+=height+100;}
            var recent=(person?["memory"]?["recent"] as JArray??new JArray()).TakeLast(8).Reverse().ToArray();
            var toggle=Button(body,(memoryExpanded?"▾ ":"▸ ")+"持续记忆与个人看法",16,y,652,38,()=>{memoryExpanded=!memoryExpanded;Open("状态与记忆");});NativeUiSurface.Plain((Image)toggle.GetComponentInParent<Button>().targetGraphic);toggle.alignment=TextAnchor.MiddleLeft;toggle.fontSize=14;y+=48;
            if(memoryExpanded)
            {
                Label(body,"发言与个人看法有独立标记；听到一句话不代表所述事情已经发生。",16,y,652,45,12).color=new Color32(156,177,142,255);y+=56;
                var memories=campMemories.Count>0?campMemories.ToArray():recent;
                foreach(var item in memories){var label=(string)item["category"]=="self"?"自言自语":(string)item["category"]=="intent"?"个人理解与打算":(string)item["source"]=="heard"?"听到的发言":"亲历记录";var time=NativeCampClock.Read((double?)item["at"]??0);Label(body,$"{label}    {time.Minutes/60:00}:{time.Minutes%60:00}",16,y,652,24,11).color=new Color32(163,184,146,255);var fact=Label(body,(string)item["fact"],16,y+29,652,100,13);var height=Mathf.Max(26,fact.preferredHeight);y+=height+37;var opinion=(string)item["interpretation"];if(!string.IsNullOrEmpty(opinion)){var note=Label(body,opinion,16,y,652,80,11);note.color=new Color32(154,174,139,255);y+=Mathf.Max(24,note.preferredHeight)+12;}y+=12;}
                if(memories.Length==0){Label(body,"还没有记录新的经历。",16,y,652,28,12);y+=38;}
                var more=Button(body,campLoading?"读取中…":campMemories.Count>0?"加载更早经历":"加载历史经历",16,y,200,40,LoadCampMemories);more.GetComponentInParent<Button>().interactable=!campLoading&&(campMemories.Count==0||memoryCursor!=null);y+=50;if(!string.IsNullOrEmpty(campMemoryError)){Label(body,campMemoryError,16,y,652,44,12);y+=54;}
            }
            body.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Mathf.Max(405,y+20));
        }
        void LoadCampMemories()
        {
            if(campLoading)return;campLoading=true;campMemoryError=null;var version=panelVersion;var query="/game-api/memories?npc="+Uri.EscapeDataString(view.SelectedNpc)+(memoryCursor==null?"":"&before="+memoryCursor+"&generation="+Uri.EscapeDataString(memoryGeneration??"")+"&branch="+Uri.EscapeDataString(memoryBranch??""));
            view.Authority?.Api(query,null,(result,error)=>{if(version!=panelVersion)return;campLoading=false;if(error!=null){campMemoryError=error;campMemories.Clear();memoryCursor=memoryGeneration=memoryBranch=null;}else{memoryCursor=(string)result["cursor"];memoryGeneration=(string)result["generation"];memoryBranch=(string)result["branch"];foreach(var item in result["items"] as JArray??new JArray())if(!campMemories.Any(old=>(string)old["eventId"]==(string)item["eventId"]))campMemories.Add(item.DeepClone());}Open("状态与记忆");});
        }
        void CampProfilePanel(JToken npc)
        {
            var source=JObject.Parse(Resources.Load<TextAsset>("Personas").text);var persona=source["personas"]?[view.SelectedNpc];var traits=source["profiles"]?[view.SelectedNpc]?["traits"] as JObject;
            var values=npc?["initialSettings"]?["values"] as JObject;var custom=values!=null&&traits!=null&&traits.Properties().Any(t=>(double?)values["trait."+t.Name]!=(double?)t.Value);
            var headline=custom?"自定义性格 · 本局快照":(string)persona?["headline"];
            var description=custom?CustomPersona(values,traits):(string)persona?["description"];
            Label(body,headline??"",0,0,684,26,14).fontStyle=FontStyle.Bold;var text=Label(body,description??"",0,35,684,110,13);text.lineSpacing=1.2f;var y=Mathf.Max(80,text.preferredHeight+52);
            Icon(body,"Leaf",0,y,12);var advice=Label(body,custom?"行为依据本局人格、身体和经历；修改初始模板只影响新开局。":(string)persona?["advice"],20,y-4,664,50,11);advice.color=new Color32(158,181,141,255);y+=Mathf.Max(34,advice.preferredHeight)+20;
            var mind=npc?["mind"];var intent=(string)mind?["intent"]?["kind"];var stances=new Dictionary<string,string>{{"cooperate","愿意合作"},{"endure","勉强继续"},{"bargain","想谈条件"},{"evade","行动拖延"},{"rest","自行休息"},{"refuse","拒绝安排"},{"recruit","召集伙伴表达不满"},{"strike","停工中"}};
            if((bool?)npc?["alive"]==true&&mind!=null){var anger=(double?)mind["emotions"]?["anger"]??0;Label(body,stances.TryGetValue(intent??"",out var stance)?stance:"愿意合作",0,y,330,28,13).fontStyle=FontStyle.Bold;Label(body,anger>.7?"火气很大":anger>.35?"明显烦躁":(double?)mind["emotions"]?["resentment"]>.4?"仍有芥蒂":"情绪尚稳",350,y,334,28,12);y+=40;}
            var social=view.World?["social"]?["people"]?[view.SelectedNpc];Label(body,$"信任 {Number(npc?["trust"])}       不满 {Number(social?["resentment"])}       劳作负担 {Number(social?["workload"])}",0,y,684,32,13);y+=50;
            var records=Button(body,(recordsExpanded?"▾ ":"▸ ")+"共同经历、承诺与伙伴关系",0,y,684,42,()=>{recordsExpanded=!recordsExpanded;Open("性格与关系");});NativeUiSurface.Plain((Image)records.GetComponentInParent<Button>().targetGraphic);records.alignment=TextAnchor.MiddleLeft;y+=54;
            if(recordsExpanded){var details=PartnerDescription("性格与关系");var history=Label(body,details,0,y,684,1500,12);history.lineSpacing=1.25f;y+=history.preferredHeight+30;}
            body.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Mathf.Max(405,y+20));
        }
        static string CustomPersona(JObject values,JObject defaults)
        {
            double T(string name)=>(double?)values["trait."+name]??(double?)defaults[name]??0;
            return string.Join("，",new[]{T("diligence")>=.65?"愿意劳动":T("diligence")<.35?"不爱劳动":"劳动意愿适中",T("honesty")>=.65?"重视诚实":T("honesty")<.35?"会掩饰私心":"诚实倾向适中",T("selfInterest")>=.65?"重视自己利益":"兼顾同伴利益",T("impulsivity")>=.65?"容易冲动":"比较克制",T("autonomy")>=.65?"很重视自主":"能接受协调",T("patience")<.35?"耐心不足":"愿意等待",T("empathy")>=.65?"关心同伴":"共情较弱",T("fairness")>=.65?"在意分工与守约":"不太计较分工",T("courage")<.35?"谨慎避险":"敢于行动"});
        }
        Button Card(Transform parent,string title,string note,string icon,float x,float y,float width,float height,UnityEngine.Events.UnityAction action)
        {
            var text=Button(parent,title,x,y,width,height,action);text.text="";var owner=text.transform.parent;var surface=owner.GetComponentInChildren<NativeUiSurface>();surface.Set(new Color32(26,52,37,255),new Color32(26,52,37,255),new Color32(94,120,77,110),10);
            Icon(owner,icon,14,(height-20)/2,20);Label(owner,title,44,14,width-60,24,13).fontStyle=FontStyle.Bold;Label(owner,note,44,39,width-60,23,10).color=new Color32(157,182,142,255);return text.GetComponentInParent<Button>();
        }
        void SocialPanel()
        {
            // Source SocialDialog is a narrow bottom drawer, not a full-screen command dashboard.
            foreach(Transform child in modal)if(child.GetComponent<NativeUiSurface>()==null)Destroy(child.gameObject);
            SourceDialog("营地对话",500,727,true);var content=SourceScroll(body,"交谈与安排");
            socialSignature=SocialSignature();var person=(view.World?["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);var alive=(bool?)person?["alive"]!=false;
            Icon(content,view.SelectedNpc,0,0,48);Label(content,(string)person?["role"]??"",60,0,340,18,9);var speaker=Label(content,(string)person?["name"]??"",60,20,340,30,20);speaker.font=serif??font;speaker.color=new Color32(240,214,161,255);
            Label(content,"听听伙伴的想法",60,53,340,22,11);Icon(content,"MessageCircle",420,22,24);
            var topics=new[]{"checkin","work","food","weather","conflict","promise"};var topicNames=new[]{"近况","分工","分食","安全","分歧","承诺"};
            for(var i=0;i<topics.Length;i++){var topic=topics[i];var text=Button(content,topicNames[i],i*75.5f,90,70.5f,32,()=>Command("social-open",new JObject{["topic"]=topic}));text.fontSize=14;text.GetComponentInParent<Button>().interactable=alive;}
            var y=138f;var npcs=view.World?["npcs"] as JArray??new JArray();
            foreach(var message in (view.World?["socialLife"]?["messages"] as JArray??new JArray()).Where(m=>(string)m["from"]==view.SelectedNpc||(m["to"] as JArray)?.Any(t=>(string)t==view.SelectedNpc)==true).TakeLast(12))
            {
                var player=(string)message["from"]=="player";var left=player?28:0;var width=448-left;var text=(string)message["text"]??"";
                var bubble=At("交谈记录",content,left,y,width,100);var image=bubble.gameObject.AddComponent<Image>();NativeUiSurface.Apply(image,10).Set(player?new Color32(54,62,37,255):new Color32(40,61,46,255),player?new Color32(54,62,37,255):new Color32(40,61,46,255),new Color32(151,170,121,38),10);
                Label(bubble,player?"你":(string)npcs.FirstOrDefault(n=>(string)n["id"]==(string)message["from"])?["name"]??"伙伴",12,10,width-110,18,10);
                var source=(string)message["source"];var sourceName=source=="player"?"你的回应":source=="safety"?"安全兜底":source=="template"?"即时回应":source=="minimind3"?"MiniMind3":source=="cache"?"模型缓存":source??"";
                Label(bubble,sourceName,width-100,10,88,18,8).alignment=TextAnchor.MiddleRight;var height=Paragraph(bubble,text,12,33,width-24,12,1.85f)+45;Place(bubble,left,y,width,height);y+=height+7;
            }
            foreach(var set in (view.World?["socialLife"]?["choices"] as JArray??new JArray()).Where(s=>(string)s["npcId"]==view.SelectedNpc&&(double?)s["expiresAt"]>=(double?)view.World?["elapsed"]))
            {
                Label(content,"选择你的回应",0,y,448,24,10);y+=30;var setId=(string)set["id"];var scope=view.Authority?.gate.Scope;
                foreach(var choice in set["options"] as JArray??new JArray()){var choiceId=(string)choice["id"];var label=Button(content,(string)choice["text"],0,y,448,61,()=>Action(new JObject{["type"]="social-choice",["setId"]=setId,["choiceId"]=choiceId,["scope"]=scope}));label.alignment=TextAnchor.MiddleLeft;label.GetComponentInParent<Button>().interactable=alive&&(string)choice["text"]!="内容审核中。";y+=68;}
                Button(content,"更换一批回复",0,y,448,32,()=>Action(new JObject{["type"]="social-refresh",["setId"]=setId,["scope"]=scope}));y+=45;
            }
            foreach(var set in view.Authority?.gate.Snapshot?["presentation"]?["socialChoices"] as JArray??new JArray())if((string)set["npcId"]==view.SelectedNpc)
            {
                Label(content,"一起商量一个安排",0,y,448,22,10);y+=30;
                foreach(var choice in set["options"] as JArray??new JArray())
                {var thread=set["threadId"].DeepClone();var choiceId=(string)choice["id"];var label=Button(content,(string)choice["label"],0,y,448,76,()=>Command("social-reply",new JObject{["threadId"]=thread,["choiceId"]=choiceId}));label.text="";var owner=label.transform.parent;Label(owner,(string)choice["label"],12,10,424,23,12);Label(owner,(string)choice["description"]??(string)choice["disabledReason"]??"",12,37,424,32,10).color=new Color32(173,194,154,255);label.GetComponentInParent<Button>().interactable=alive&&choice["disabledReason"]==null;y+=83;}
            }
            foreach(var group in view.World?["agency"]?["groups"] as JArray??new JArray())if((string)group["stage"]!="ended")
            {
                y+=Paragraph(content,"共同诉求："+group["concern"],0,y,448,12)+12;var options=new[]{"listen","rest","food","fairness","refuse"};var labels=new[]{"听取诉求","安排休息","安排进食","减少这轮劳动","拒绝调整"};
                for(var i=0;i<options.Length;i++){var option=options[i];var id=group["id"].DeepClone();Button(content,labels[i],i%2*228,y+i/2*40,220,34,()=>Command("collective-reply",new JObject{["groupId"]=id,["choiceId"]=option}));}y+=130;
            }
            if(alive){Button(content,"继续聊聊",0,y,448,36,()=>Command("social-open",new JObject{["topic"]="checkin"}));y+=52;}
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Math.Max(180,y));
        }
        void Quit()
        {
            #if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying=false;
            #else
            Application.Quit();
            #endif
        }
        string CognitionModelId()
        {
            var id=(string)CognitionSettings?["modelId"];
            return string.IsNullOrWhiteSpace(id)?"minimind3":id;
        }
        string CognitionModelName()=>CognitionModelId()=="minimind3"?"MiniMind3（内置默认）":"Qwen3.5 · 2B（优先）";
        void ModelSettings()
        {
            foreach(Transform child in modal)if(child.GetComponent<NativeUiSurface>()==null)Destroy(child.gameObject);
            SourceDialog("游戏设置",560,970);SettingsNavigation();var content=SourceScroll(body,"NPC 对话模型");var version=panelVersion;
            if(villageHud)view.Authority?.Api("/game-api/cognition-settings",null,(result,error)=>{if(version!=panelVersion||error!=null)return;if(!JToken.DeepEquals(villageCognition,result)){villageCognition=result;Open("游戏设置");}});
            Icon(content,"Cpu",0,0,24);Label(content,"NPC 对话模型",36,0,470,28,18).fontStyle=FontStyle.Bold;
            Label(content,"内置模型与可选优先模型",36,33,470,24,11).color=new Color32(169,191,151,255);
            var state=At("模型加载状态",content,0,80,508,84);var stateImage=state.gameObject.AddComponent<Image>();NativeUiSurface.Apply(stateImage,12).Set(new Color32(233,239,223,255),new Color32(233,239,223,255),new Color32(203,213,189,255),12);
            modelStatus=Label(state,"正在读取本地模型状态…",16,14,476,60,12);modelStatus.color=new Color32(38,62,48,255);
            var list=At("可用模型",content,0,180,508,100);var y=0f;
            void Tail()
            {
                foreach(Transform child in content)if(child.name=="设置选项")Destroy(child.gameObject);
                var footer=At("设置选项",content,0,190+y,508,520);
                Label(footer,"伙伴的自主行为与认知",0,65,508,28,15).fontStyle=FontStyle.Bold;
                void Agency(bool? enabled,bool? cognition){var agency=CognitionSettings;Action(new JObject{["type"]="agency-settings",["enabled"]=enabled??(bool?)agency?["enabled"]??true,["cognition"]=cognition??(bool?)agency?["cognition"]??true,["modelId"]=CognitionModelId()});Open("游戏设置");}
                Button(footer,"自主行为："+(((bool?)CognitionSettings?["enabled"]??true)?"开启":"关闭"),0,105,246,44,()=>Agency(!((bool?)CognitionSettings?["enabled"]??true),null));
                Button(footer,"大模型认知："+(((bool?)CognitionSettings?["cognition"]??true)?"开启":"关闭"),262,105,246,44,()=>Agency(null,!((bool?)CognitionSettings?["cognition"]??true)));
                Button(footer,"刷新本地模型列表",0,170,508,38,()=>Open("游戏设置"));
                Paragraph(footer,"这里配置伙伴的话语生成。行动、物资与承诺仍由游戏模拟决定。",0,228,508,11);
                Icon(footer,"RotateCcw",0,300,20);Label(footer,"重置游戏",30,296,478,32,18).fontStyle=FontStyle.Bold;
                Paragraph(footer,"清除当前世界运行记录并恢复初始营地。保留远程模型配置、API Key 与角色初始配置。",0,344,508,12);
                Button(footer,"重置游戏",0,420,508,44,()=>Open("确认重置"));
                content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,190+y+490);
            }
            void Model(string id,string label,string note,bool available)
            {
                var selected=CognitionModelId()==id;var text=Button(list,label,0,y,508,66,()=>{Action(new JObject{["type"]="agency-model",["modelId"]=id});Open("游戏设置");});text.text="";
                var owner=text.transform.parent;owner.GetComponentInChildren<NativeUiSurface>().Set(selected?new Color32(232,238,220,255):new Color32(246,247,239,255),selected?new Color32(232,238,220,255):new Color32(246,247,239,255),selected?new Color32(73,107,66,255):new Color32(203,213,189,255),12);
                var title=Label(owner,label,16,11,438,25,13);title.color=new Color32(38,62,48,255);title.fontStyle=FontStyle.Bold;Label(owner,note,16,38,470,23,10).color=new Color32(89,110,77,255);if(selected)Icon(owner,"Check",470,23,20);
                text.GetComponentInParent<Button>().interactable=available;y+=76;Place(list,0,180,508,y);Tail();
            }
            Model("minimind3","MiniMind3 · 默认认知模型","内置模型 · 优先模型不可用时自动兜底",true);
            view.Authority?.Api("/game-api/native-models",null,(result,error)=>{
                if(version!=panelVersion)return;if(error!=null){modelStatus.text=error;return;}
                modelStatus.text="当前认知绑定："+CognitionModelName()+"\n本地模型状态："+result["status"]?["stage"];
                foreach(var model in result["models"] as JArray??new JArray())if((string)model["id"]=="native:qwen3.5-2b")Model((string)model["id"],(string)model["name"],"原生 llama.cpp · "+((bool?)model["available"]==true?"已安装":"文件未安装"),(bool?)model["available"]==true);
            });
        }
        string PartnerDescription(string category)
        {
            var npc=(view.World?["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==view.SelectedNpc);if(npc==null)return "暂无伙伴状态";
            var lines=new List<string>{$"{npc["name"]} · {npc["role"]}",$"健康 {Number(npc["health"])} · 精力 {Number(npc["energy"])} · 饥饿 {Number(npc["hunger"])} · 信任 {Number(npc["trust"])}"};
            var mind=npc["mind"];var stance=(string)mind?["intent"]?["kind"];
            var stances=new Dictionary<string,string>{{"cooperate","愿意合作"},{"endure","勉强继续"},{"bargain","想谈条件"},{"evade","行动拖延"},{"rest","自行休息"},{"refuse","拒绝安排"},{"recruit","召集伙伴表达不满"},{"strike","停工中"}};
            if(stance!=null&&stances.TryGetValue(stance,out var description))lines.Add("当前可观察立场："+description);
            var social=view.World["social"];
            if(category=="性格与关系")
            {
                var config=new NativeNpcSettings();var values=npc["initialSettings"]?["values"];
                if(values!=null)foreach(var field in config.Fields.Where(f=>((string)f["id"]).StartsWith("trait.")))lines.Add(field["label"]+" "+((double?)values[(string)field["id"]]*((double?)field["displayScale"]??1)??0).ToString("0"));
                lines.Add("\n与其他伙伴的关系");
                foreach(var relation in social?["relationships"] as JArray??new JArray())if((string)relation["from"]==view.SelectedNpc)
                {var other=(view.World["npcs"] as JArray).FirstOrDefault(n=>(string)n["id"]==(string)relation["to"]);lines.Add($"{other?["name"]}：{Number(relation["affinity"])}");}
                lines.Add("\n承诺与兑现");
                foreach(var promise in social?["promises"] as JArray??new JArray())if((string)promise["npcId"]==view.SelectedNpc)
                {var labels=new Dictionary<string,string>{{"pending","待兑现"},{"kept","已兑现"},{"broken","已失约"},{"cancelled","已取消"}};var status=(string)promise["status"];lines.Add($"{((string)promise["kind"]=="meal"?"口粮":"休息")} · {(labels.TryGetValue(status,out var label)?label:status)}");}
            }
            else
            {
                lines.Add("\n亲历的事件与个人看法");
                var person=view.World["agency"]?["people"]?[view.SelectedNpc];
                if(person?["appraisal"] is JObject appraisal){lines.Add((string)appraisal["summary"]);lines.Add("当前目标："+appraisal["goal"]);}
                foreach(var memory in person?["memory"]?["recent"] as JArray??new JArray())lines.Add($"{memory["fact"]}\n{memory["interpretation"]}");
                foreach(var memory in social?["memories"] as JArray??new JArray())if((string)memory["npcId"]==view.SelectedNpc)lines.Add((string)memory["text"]);
            }
            return string.Join("\n\n",lines.Where(t=>!string.IsNullOrEmpty(t)));
        }
        void RemoteModels()
        {
            var version=panelVersion;var feedback=Label(body,"远程配置单独保存，重置世界后保留。",0,0,900,40,18);
            var id=Input(body,"配置 ID，例如 remote-my-model",0,55,430,"remote-my-model");var name=Input(body,"显示名称",460,55,430,"");
            var endpoint=Input(body,"OpenAI 兼容接口地址",0,115,890,"");var model=Input(body,"模型 ID",0,175,430,"");
            var key=Input(body,"API Key（留空保留已存密钥）",460,175,430,"");key.contentType=InputField.ContentType.Password;
            var config=new Func<JObject>(()=>new JObject{["id"]=id.text.Trim(),["name"]=name.text.Trim(),["baseUrl"]=endpoint.text.Trim(),["model"]=model.text.Trim(),["requiresKey"]=!string.IsNullOrEmpty(key.text)});
            var list=Scroll(body,"已保存远程模型",Vector2.zero,new Vector2(0,-360),out var listing);listing.GetComponent<ContentSizeFitter>().verticalFit=ContentSizeFitter.FitMode.Unconstrained;
            void Response(JObject result,string error){if(version!=panelVersion)return;feedback.text=error??"操作成功";if(result?["models"] is JArray models){foreach(Transform child in list)Destroy(child.gameObject);var row=0;foreach(var entry in models){var saved=entry;Button(list,$"{entry["name"]} · {entry["model"]}",0,row++*56,890,48,()=>{id.text=(string)saved["id"];name.text=(string)saved["name"];endpoint.text=(string)saved["baseUrl"];model.text=(string)saved["model"];key.text="";feedback.text=(bool?)saved["hasKey"]==true?"已存有密钥；留空保留原密钥":"尚未存储密钥";});}list.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,Math.Max(50,row*56));}}
            JObject Draft(string action){var data=new JObject{["action"]=action,["config"]=config()};if(!string.IsNullOrEmpty(key.text))data["apiKey"]=key.text;return data;}
            Button(body,"保存配置",0,245,170,48,()=>view.Authority?.Api("/game-api/remote-models",Draft("save"),(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null)key.text="";}));
            Button(body,"测试连接",190,245,170,48,()=>{feedback.text="测试中…";view.Authority?.Api("/game-api/remote-models/test",Draft("test"),Response);});
            Button(body,"设为优先模型",380,245,200,48,()=>Action(new JObject{["type"]="agency-model",["modelId"]=id.text.Trim()}));
            Button(body,"删除配置",600,245,170,48,()=>{var removed=id.text.Trim();view.Authority?.Api("/game-api/remote-models",new JObject{["action"]="delete",["id"]=removed},(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null){key.text="";if((string)view.World?["agency"]?["modelId"]==removed)Action(new JObject{["type"]="agency-model",["modelId"]="minimind3"});}});});
            Button(body,"清除已存密钥",0,305,240,44,()=>{var data=Draft("save");data["apiKey"]="";view.Authority?.Api("/game-api/remote-models",data,(result,error)=>{if(version!=panelVersion)return;Response(result,error);if(error==null)key.text="";});});
            view.Authority?.Api("/game-api/remote-models",null,Response);
        }
        void NpcSettings()
        {
            foreach(Transform child in modal)if(child.GetComponent<NativeUiSurface>()==null)Destroy(child.gameObject);
            SourceDialog("角色初始设置",860,900);settingsDirty=false;var config=new NativeNpcSettings();JObject draft;
            try{draft=config.Load();}catch(Exception e){Label(body,"配置读取失败："+e.Message,0,0,808,120,13);return;}
            var feedback=Label(body,"这里编辑角色初始化模板，保存不修改正在进行的游戏。",0,0,808,42,13);
            var fieldsHost=Rect("角色字段",body,Vector2.zero,Vector2.one,new Vector2(150,130),new Vector2(0,-60));
            var content=SourceScroll(fieldsHost,"角色字段滚动区");var selected=view.SelectedNpc;
            var inputs=new Dictionary<string,InputField>();var changed=new HashSet<string>();
            bool Read()
            {
                foreach(var field in config.Fields.Where(f=>(bool?)f["hidden"]!=true&&changed.Contains((string)f["id"])))
                {
                    var key=(string)field["id"];var scale=(double?)field["displayScale"]??1;
                    if(!double.TryParse(inputs[key].text,NumberStyles.Float,CultureInfo.InvariantCulture,out var value)){feedback.text="请输入有效数值："+field["label"];return false;}
                    draft["characters"][selected][key]=value/scale;
                }
                try{config.Validate(draft);changed.Clear();return true;}catch(Exception e){feedback.text=e.Message;return false;}
            }
            void Render()
            {
                foreach(Transform child in content)Destroy(child.gameObject);inputs.Clear();changed.Clear();
                var character=config.Characters.First(c=>(string)c["id"]==selected);var name=Label(content,(string)character["label"],0,0,658,30,22);name.font=serif??font;
                var y=Paragraph(content,(string)character["description"],0,40,658,13)+68;
                foreach(var group in config.Fields.Where(f=>(bool?)f["hidden"]!=true).GroupBy(f=>(string)f["group"]))
                {
                    var top=y;var box=At(group.Key,content,0,top,658,100);NativeUiSurface.Apply(box.gameObject.AddComponent<Image>(),10).Set(new Color32(22,45,31,180),new Color32(22,45,31,180),new Color32(101,128,90,140),10);
                    Label(box,group.Key,12,8,634,26,15).fontStyle=FontStyle.Bold;var row=48f;
                    foreach(var field in group)
                    {
                        var scale=(double?)field["displayScale"]??1;var key=(string)field["id"];var value=(double)draft["characters"][selected][key]*scale;
                        Label(box,(string)field["label"],12,row,400,25,14).fontStyle=FontStyle.Bold;
                        var def=(double)config.Defaults["characters"][selected][key]*scale;Label(box,"默认 "+def.ToString("0.##",CultureInfo.InvariantCulture),480,row,166,23,11).alignment=TextAnchor.MiddleRight;
                        var sliderRect=At((string)field["label"]+"滑块",box,12,row+39,530,28);var slider=sliderRect.gameObject.AddComponent<Slider>();slider.minValue=(float)((double)field["min"]*scale);slider.maxValue=(float)((double)field["max"]*scale);slider.wholeNumbers=Math.Abs(((double?)field["step"]??1)*scale-1)<.0001;
                        var track=At("轨道",sliderRect,0,12,530,4).gameObject.AddComponent<Image>();track.color=new Color32(103,128,88,255);
                        var handle=At("滑块",sliderRect,0,5,14,18).gameObject.AddComponent<Image>();handle.color=new Color32(231,206,145,255);slider.handleRect=(RectTransform)handle.transform;slider.targetGraphic=handle;slider.SetValueWithoutNotify((float)value);
                        var input=Input(box,(string)field["label"],556,row+30,90,value.ToString("0.##",CultureInfo.InvariantCulture));inputs[key]=input;input.textComponent.fontSize=14;((RectTransform)input.transform).SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,38);
                        input.onValueChanged.AddListener(raw=>{changed.Add(key);settingsDirty=true;if(float.TryParse(raw,NumberStyles.Float,CultureInfo.InvariantCulture,out var parsed))slider.SetValueWithoutNotify(parsed);});
                        slider.onValueChanged.AddListener(v=>{var step=(double?)field["step"]*scale??1;input.text=(Math.Round(v/step)*step).ToString("G17",CultureInfo.InvariantCulture);});
                        row+=Paragraph(box,(string)field["description"],12,row+77,634,12,1.55f)+96;
                    }
                    Place(box,0,top,658,row+10);y+=row+28;
                }
                content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,y);
            }
            for(var i=0;i<config.Characters.Count;i++){var character=config.Characters[i];var id=(string)character["id"];var text=Button(body,(string)character["label"],0,60+i*59,130,51,()=>{if(!Read())return;selected=id;Render();});text.fontSize=14;}
            var tools=At("配置工具",body,0,body.rect.height-120,808,50);
            Button(tools,"恢复当前角色默认",0,0,192,40,()=>{draft["characters"][selected]=config.Defaults["characters"][selected].DeepClone();Render();settingsDirty=true;});
            Button(tools,"恢复全部默认",202,0,192,40,()=>{draft=config.Defaults;Render();settingsDirty=true;});
            Button(tools,"导入 JSON",404,0,192,40,()=>PickFile(false,"导入角色初始配置","",feedback,file=>{var value=JObject.Parse(File.ReadAllText(file));config.Validate(value);draft=value;Render();settingsDirty=true;feedback.text="已载入配置，点击保存后生效";}));
            Button(tools,"导出当前草稿",606,0,202,40,()=>{if(Read())PickFile(true,"导出角色初始配置","campmind-npc-settings.json",feedback,file=>File.WriteAllText(file,draft.ToString()));});
            Button(body,"返回",478,0,120,44,Close,true);
            Button(body,"保存初始模板",608,0,200,44,()=>{if(!Read())return;try{config.Save(draft);settingsDirty=false;feedback.text="已保存，下次新旅程生效";}catch(Exception e){feedback.text=e.Message;}},true);Render();
        }
        void PickFile(bool save,string title,string name,Text feedback,Action<string> apply){StartCoroutine(PickFileRoutine(save,title,name,feedback,apply,panelVersion));}
        IEnumerator PickFileRoutine(bool save,string title,string name,Text feedback,Action<string> apply,int version)
        {
            Task<string> job;
            try{job=NativeFileDialog.Begin(()=>NativeFileDialog.Choose(save,title,name));}catch(Exception e){feedback.text=e.Message;yield break;}
            while(!job.IsCompleted)yield return null;
            if(version!=panelVersion||feedback==null)yield break;
            if(job.IsFaulted){feedback.text=job.Exception.GetBaseException().Message;yield break;}
            if(job.Result==null)yield break;
            try{apply(job.Result);}catch(Exception e){feedback.text=e.Message;}
        }
        static void Place(RectTransform rect,float x,float y,float width,float height){rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.offsetMin=new Vector2(x,-y-height);rect.offsetMax=new Vector2(x+width,-y);}
        void Icon(Transform owner,string asset,float x,float y,float size){var rect=At(asset,owner,x,y,size,size);var image=rect.gameObject.AddComponent<RawImage>();image.texture=Resources.Load<Texture2D>("Hud/"+asset);image.color=asset.StartsWith("Flame")?new Color32(243,199,106,255):asset=="Axe"?new Color32(205,163,115,255):asset=="Apple"?new Color32(224,155,135,255):new Color32(239,229,199,255);image.raycastTarget=false;}
        static void SetIcon(Transform parent,string asset){var image=parent.GetComponentsInChildren<RawImage>(true).FirstOrDefault();if(image!=null)image.texture=Resources.Load<Texture2D>("Hud/"+asset);}
        Text IconButton(Transform owner,string name,string asset,float x,float y,UnityEngine.Events.UnityAction action)
        {
            var text=Button(owner,name,x,y,44,44,action);NativeUiSurface.Plain((Image)text.GetComponentInParent<Button>().targetGraphic);text.text="";
            var face=At("圆形工具底板",text.transform.parent,6,6,32,32).gameObject.AddComponent<Image>();NativeUiSurface.Apply(face,16);face.raycastTarget=false;Icon(text.transform.parent,asset,14,14,16);return text;
        }
        void Journey()
        {
            modal.offsetMin=new Vector2(-310,-440.38f);modal.offsetMax=new Vector2(310,440.38f);
            modalBlocker.GetComponent<Image>().color=backdropReady?Color.clear:new Color(6/255f,21/255f,14/255f,.78f);
            var title=Label(modal,view.World==null?"今晚，我们一起留下来。":"开启新的旅程",30.57f,27.57f,558.86f,40.5f,27);title.font=serif??font;title.fontStyle=FontStyle.Bold;
            body=At("旅程内容",modal,30.57f,83.07f,558.86f,750);
            var art=At("原版旅程插画",body,0,0,558.86f,93);var artMask=art.gameObject.AddComponent<Image>();Round(artMask);artMask.pixelsPerUnitMultiplier=1.78f;art.gameObject.AddComponent<Mask>().showMaskGraphic=false;var artImage=At("插画",art,0,0,558.86f,93);var artwork=artImage.gameObject.AddComponent<RawImage>();var texture=Resources.Load<Texture2D>("Hud/journey");artwork.texture=texture;var crop=(texture.width/(float)texture.height)/(558.86f/93);artwork.uvRect=new Rect(0,(1-crop)*.51f,1,crop);artwork.raycastTarget=false;
            var artShade=At("插画底部渐变",art,0,0,558.86f,93).gameObject.AddComponent<NativeUiSurface>();artShade.Set(new Color(19/255f,39/255f,26/255f,.08f),new Color(23/255f,39/255f,25/255f,.86f),Color.clear,9);artShade.Shadow=false;artShade.raycastTarget=false;Icon(art,"FlameFill",24,40,38);Label(art,"松风营地 · 持续生存的荒野故事",78,60,450,24,11);
            var lead=Label(body,"九个伙伴，九种脾气，一座共同的村寨。\n分配工作，照顾彼此，在昼夜交替中建设营地。",0,111,558.86f,60,14);lead.lineSpacing=1.3f;
            var stepNames=new[]{"认识伙伴","一起劳作","建设营地"};var notes=new[]{"每个人都有自己的性格","采集、休息，也要互相照顾","储备物资，在昼夜中持续生存"};var stepIcons=new[]{"Users","Footprints","Flame"};
            for(var i=0;i<3;i++){Icon(body,stepIcons[i],i*190,195,20);Label(body,stepNames[i],i*190,224,180,22,12).fontStyle=FontStyle.Bold;var note=Label(body,notes[i],i*190,251,180,24,9);note.color=new Color32(137,164,123,255);}
            var divider=At("引导分隔线",body,0,281,558.86f,1).gameObject.AddComponent<Image>();divider.color=new Color32(80,100,67,102);divider.raycastTarget=false;
            Label(body,"选择村寨生活节奏",0,302.2f,550,22,11).color=new Color32(189,202,166,255);
            var titles=new[]{"悠然村居","村寨求生","严酷生存"};var details=new[]{"更充足的物资，适合熟悉村寨","先保口粮，再安排日常分工","更大的消耗，考验补给与换班"};var ids=new[]{"cozy","normal","hard"};var difficultyIcons=new[]{"Leaf","Flame","Sparkles"};
            for(var i=0;i<3;i++){var id=ids[i];var t=Button(body,titles[i],0,328.2f+i*66.57f,558.86f,58.57f,()=>{journeyDifficulty=id;Open("开始旅程");});t.text="";Icon(t.transform.parent,difficultyIcons[i],13,19,18);var heading=Label(t.transform.parent,titles[i],43,10,440,20,12);heading.fontStyle=FontStyle.Bold;var detail=Label(t.transform.parent,details[i],43,33,440,18,10);detail.color=new Color32(130,157,117,255);var skin=t.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>();if(journeyDifficulty==id){skin.Set(new Color32(60,62,34,255),new Color32(38,59,36,255),new Color32(203,174,101,153),7);heading.color=new Color32(240,211,145,255);detail.color=new Color32(184,188,144,255);Icon(t.transform.parent,"Check",525,20,16);}}
            var advanced=Button(body,journeyAdvanced?"收起模型与场景设置":"模型与场景设置",0,529.9f,558.86f,44,()=>{journeyAdvanced=!journeyAdvanced;Open("开始旅程");});NativeUiSurface.Plain((Image)advanced.GetComponentInParent<Button>().targetGraphic);advanced.text="";Icon(advanced.transform.parent,"BrainCircuit",0,14,15);Label(advanced.transform.parent,journeyAdvanced?"收起模型与场景设置":"模型与场景设置",23,14,470,20,10);Label(advanced.transform.parent,journeyAdvanced?"−":"+",540,14,18,20,12);
            var y=580.9f;
            if(journeyAdvanced){modal.offsetMin=new Vector2(-310,-510);modal.offsetMax=new Vector2(310,510);var seed=Input(body,"世界种子",0,y,160,journeySeed);seed.onValueChanged.AddListener(v=>journeySeed=v);SourceSelect(body,"决策方式",180,y,160,new[]{"模型决策","规则决策"},journeyMode=="model"?0:1,i=>journeyMode=i==0?"model":"rules");SourceSelect(body,"场景",360,y,198,new[]{"标准营地","风暴来袭","伙伴冲突"},Array.IndexOf(new[]{"standard","storm","conflict"},journeyScenario),i=>journeyScenario=new[]{"standard","storm","conflict"}[i]);y+=100;}
            Button(body,"角色初始设置 · 性格 / 体能 / 技能",0,y,215,44,()=>Open("角色初始设置")).fontSize=14;
            Button(body,"游戏设置 · 对话模型",0,y+44,147,44,()=>Open("游戏设置")).fontSize=14;
            var error=Label(body,"",0,y+89,558.86f,20,11);
            var start=Button(body,"确认开始新旅程",0,y+98,558.86f,44,()=>{if(waitingForStart)return;if(!uint.TryParse(journeySeed,out var seed)||seed<1){error.text="请输入 1–4294967295 的世界种子";return;}try{startScope=view.Authority?.gate.Scope;waitingForStart=true;startDeadline=Time.unscaledTime+15;error.text="正在准备并保存村寨…";Action(new JObject{["type"]="start",["options"]=new JObject{["seed"]=seed,["mode"]=journeyMode,["difficulty"]=journeyDifficulty,["scenario"]=journeyScenario,["npcSettings"]=new NativeNpcSettings().Load()}});}catch(Exception e){waitingForStart=false;error.text=e.Message;}});start.text="进入村寨     →";start.fontSize=14;start.fontStyle=FontStyle.Bold;start.color=new Color32(36,51,30,255);start.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>().Set(new Color32(236,195,108,255),new Color32(221,170,82,255),new Color32(240,208,141,255),7);
            var foot=Label(body,"自动保存进度 · 支持鼠标与键盘\n本地任务策略网络，无需 API 密钥",0,y+155,558.86f,34,10);foot.alignment=TextAnchor.MiddleCenter;foot.color=new Color32(129,151,111,255);
        }
        RectTransform Rect(string name,Transform parent,Vector2 min,Vector2 max,Vector2 offsetMin,Vector2 offsetMax)
        {var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var rect=(RectTransform)go.transform;rect.anchorMin=min;rect.anchorMax=max;rect.offsetMin=offsetMin;rect.offsetMax=offsetMax;return rect;}
        RectTransform Panel(string name,Transform parent,Vector2 min,Vector2 max,Vector2 offsetMin,Vector2 offsetMax)
        {var rect=Rect(name,parent,min,max,offsetMin,offsetMax);var image=rect.gameObject.AddComponent<Image>();image.color=ReferenceUiArt.Ink;if(name!="菜单遮罩")ReferenceUiArt.Surface(image,false,name=="功能窗口"?12:7);return rect;}

        RectTransform At(string name,Transform parent,float x,float y,float width,float height,bool bottom=false)
        {return Rect(name,parent,new Vector2(0,bottom?0:1),new Vector2(0,bottom?0:1),new Vector2(x,bottom?y:-y-height),new Vector2(x+width,bottom?y+height:-y));}
        Text Label(Transform parent,string value,float x,float y,float width,float height,int size)
        {var rect=At(value,parent,x,y,width,height);var text=rect.gameObject.AddComponent<Text>();text.font=font;text.fontSize=Mathf.Clamp(size,14,26);text.color=new Color(.92f,.92f,.83f);text.text=value;text.supportRichText=false;text.raycastTarget=false;text.verticalOverflow=VerticalWrapMode.Overflow;return text;}
        Text Button(Transform parent,string name,float x,float y,float width,float height,UnityEngine.Events.UnityAction action,bool bottom=false)
        {var rect=At(name,parent,x,y,width,height,bottom);var image=rect.gameObject.AddComponent<Image>();image.color=Color.clear;var skin=ReferenceUiArt.Surface(image,false,5);var button=rect.gameObject.AddComponent<Button>();button.targetGraphic=image;button.transition=Selectable.Transition.None;rect.gameObject.AddComponent<NativeUiHover>();image.color=Color.clear;button.onClick.AddListener(()=>GetComponent<NativeGameAudio>()?.Click());button.onClick.AddListener(action);var text=Label(rect,name,4,2,width-8,height-4,16);text.alignment=TextAnchor.MiddleCenter;return text;}
        InputField Input(Transform parent,string name,float x,float y,float width,string initial)
        {var rect=At(name,parent,x,y,width,48);var image=rect.gameObject.AddComponent<Image>();image.color=new Color(.13f,.17f,.15f);var field=rect.gameObject.AddComponent<InputField>();field.targetGraphic=image;field.textComponent=Label(rect,"",10,6,width-20,36,14);field.text=initial;field.characterLimit=300;var placeholder=Label(rect,name,10,6,width-20,36,14);placeholder.color=new Color(.6f,.65f,.6f);field.placeholder=placeholder;return field;}
        RectTransform Scroll(Transform parent,string name,Vector2 min,Vector2 max,out Text text)
        {
            var viewport=Rect(name,parent,Vector2.zero,Vector2.one,min,max);viewport.gameObject.AddComponent<RectMask2D>();var hitArea=viewport.gameObject.AddComponent<Image>();hitArea.color=Color.clear;
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.horizontal=false;scroll.viewport=viewport;
            var content=Rect("滚动内容",viewport,new Vector2(0,1),new Vector2(1,1),Vector2.zero,Vector2.zero);content.pivot=new Vector2(.5f,1);
            text=content.gameObject.AddComponent<Text>();text.font=font;text.fontSize=14;text.color=new Color(.9f,.91f,.84f);text.supportRichText=false;text.raycastTarget=true;text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Overflow;
            var fit=content.gameObject.AddComponent<ContentSizeFitter>();fit.verticalFit=ContentSizeFitter.FitMode.PreferredSize;scroll.content=content;return content;
        }
    }
}
