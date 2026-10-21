using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        static readonly Color Ink=new Color32(10,30,24,252),Line=new Color32(170,148,88,145),Gold=new Color32(232,199,126,255),Muted=new Color32(170,184,159,255);
        readonly Dictionary<string,Button> navigation=new Dictionary<string,Button>();
        RectTransform pageArea,details,queueArea,craftFooter,craftDivider;Text pageTitle,managementState;
        string recipeSelection="WPN002";
        string craftRecipient="player";
        Button craftButton;Text craftAvailability;

        RectTransform Box(string name,Transform parent,Vector2 min,Vector2 max,Vector2 insetMin,Vector2 insetMax,bool surface=false)
        {
            var r=Rect(name,parent);r.anchorMin=min;r.anchorMax=max;r.offsetMin=insetMin;r.offsetMax=insetMax;
            if(surface){var skin=NativeUiSurface.Apply(r.gameObject.AddComponent<Image>(),6);skin.Set(Ink,Ink,Line,6);}
            return r;
        }
        Text FixedLabel(Transform parent,string value,float x,float y,float width,float height,int size=14)
        {
            var t=Label(parent,value,size);var r=(RectTransform)t.transform;r.anchorMin=r.anchorMax=new Vector2(0,1);r.pivot=new Vector2(0,1);r.anchoredPosition=new Vector2(x,-y);r.sizeDelta=new Vector2(width,height);t.verticalOverflow=size>=20?VerticalWrapMode.Overflow:VerticalWrapMode.Truncate;return t;
        }
        void PlaceButton(Button b,float x,float y,float width,float height)
        {
            var r=(RectTransform)b.transform;r.anchorMin=r.anchorMax=new Vector2(0,1);r.pivot=new Vector2(0,1);r.anchoredPosition=new Vector2(x,-y);r.sizeDelta=new Vector2(width,height);
        }
        void Column(RectTransform owner,float gap=8)
        {
            var layout=owner.gameObject.AddComponent<VerticalLayoutGroup>();layout.spacing=gap;layout.childControlHeight=true;layout.childForceExpandHeight=false;layout.childControlWidth=true;layout.childForceExpandWidth=false;
            owner.gameObject.AddComponent<ContentSizeFitter>().verticalFit=ContentSizeFitter.FitMode.PreferredSize;
        }
        RectTransform Scrolling(string name,Transform parent,Vector2 min,Vector2 max,Vector2 padMin,Vector2 padMax,out ScrollRect scroller)
        {
            var viewport=Box(name,parent,min,max,padMin,padMax);viewport.gameObject.AddComponent<Image>().color=Color.clear;viewport.gameObject.AddComponent<RectMask2D>();
            scroller=viewport.gameObject.AddComponent<ScrollRect>();scroller.horizontal=false;scroller.movementType=ScrollRect.MovementType.Clamped;scroller.scrollSensitivity=24;scroller.viewport=viewport;
            var inner=Box(name+"内容",viewport,new Vector2(0,1),Vector2.one,Vector2.zero,Vector2.zero);inner.pivot=new Vector2(.5f,1);Column(inner);scroller.content=inner;return inner;
        }
        void ManagementSymbol(Transform parent,int index,float x,float y,float size,Color? color=null)
        {
            var r=Box("参考图标",parent,new Vector2(0,1),new Vector2(0,1),new Vector2(x,-y-size),new Vector2(x+size,-y));var image=ReferenceUiArt.Atlas(r,"ReferenceSymbols",index);if(color.HasValue)image.color=color.Value;
        }
        void BuildManagement()
        {
            panel=Box("营地管理详情",root,new Vector2(.534f,.491f),new Vector2(.534f,.491f),new Vector2(-544,-340),new Vector2(544,340),true);
            var frame=ReferenceUiArt.Surface(panel.GetComponent<Image>(),false,12);frame.BorderWidth=2;frame.Border=Gold;frame.SetVerticesDirty();
            ManagementSymbol(panel,0,26,16,38);var title=FixedLabel(panel,"营地管理",84,15,144,44,26);title.color=Gold;title.fontStyle=FontStyle.Bold;
            Box("标题竖线",panel,new Vector2(0,1),new Vector2(0,1),new Vector2(218,-47),new Vector2(219,-17)).gameObject.AddComponent<Image>().color=Line;
            pageTitle=FixedLabel(panel,"制作与装备",242,23,300,26,18);pageTitle.color=Gold;
            var close=Button(panel,"",CloseManagement);close.name="关闭详情";PlaceButton(close,1038,14,36,36);NativeUiSurface.Plain(close.GetComponent<Image>());
            var closeIcon=Box("关闭图标",close.transform,Vector2.zero,Vector2.one,new Vector2(7,7),new Vector2(-7,-7)).gameObject.AddComponent<RawImage>();closeIcon.texture=Resources.Load<Texture2D>("Hud/X");closeIcon.color=Gold;closeIcon.raycastTarget=false;
            Box("标题分隔",panel,new Vector2(0,1),Vector2.one,new Vector2(0,-64),new Vector2(0,-63)).gameObject.AddComponent<Image>().color=Line;
            var nav=Box("管理导航",panel,Vector2.zero,new Vector2(0,1),new Vector2(8,96),new Vector2(190,-82));
            var keys=new[]{"营地","制作","人物","协作"};var labels=new[]{"营地概况","制作装备","人物装备","协作约定"};
            for(var i=0;i<keys.Length;i++){var key=keys[i];var b=Button(nav,labels[i],()=>ShowManagement(key));b.name=key;PlaceButton(b,0,i*74,180,64);var text=b.GetComponentInChildren<Text>();text.fontSize=18;((RectTransform)text.transform).offsetMin=new Vector2(72,4);ManagementSymbol(b.transform,i,20,17,30);navigation[key]=b;}
            Box("导航分隔",panel,Vector2.zero,new Vector2(0,1),new Vector2(194,96),new Vector2(195,-64)).gameObject.AddComponent<Image>().color=Line;
            pageArea=Box("管理工作区",panel,Vector2.zero,Vector2.one,new Vector2(208,96),new Vector2(-24,-80));
            content=Scrolling("管理列表",pageArea,Vector2.zero,Vector2.one,Vector2.zero,Vector2.zero,out scroll);
            managementState=FixedLabel(panel,"",240,644,810,26,16);managementState.color=Muted;heading=managementState;
            panel.gameObject.SetActive(false);
        }
        void CloseManagement(){panelOpen=false;panel.gameObject.SetActive(false);legacyUi?.SetVillageManagementSelection(null);}
        void RefreshManagementHeader()
        {
            pageTitle.text=tab=="制作"?"制作与装备":tab=="人物"?"人物与装备":tab=="协作"?"提议与约定":tab=="狩猎"?"动物与狩猎":"营地概况";
            heading=managementState;
            var seconds=(double?)Snapshot?["elapsed"]??0;
            managementState.text=!String.IsNullOrEmpty(Error)?Error:Snapshot==null?"正在加载营地…":"";
            managementState.color=String.IsNullOrEmpty(Error)?Muted:new Color32(239,168,133,255);
            if((long?)Snapshot?["catchupTicks"]>0)managementState.text="世界正在补算，剩余 "+Snapshot["catchupTicks"]+" 步";
            foreach(var item in navigation){var active=item.Key==tab;item.Value.GetComponentInChildren<Text>().color=active?Gold:Muted;var skin=ReferenceUiArt.Surface(item.Value.GetComponent<Image>(),active,4);if(!active)skin.Set(Color.clear,Color.clear,Color.clear,4);skin.Shadow=false;}
            legacyUi?.SetVillageManagementSelection(panelOpen?tab:null);
            if(craftButton!=null){var reason=CraftBlockReason();craftButton.interactable=reason==null&&!mutationPending&&queued==null;craftAvailability.text=(mutationPending||queued!=null)?"正在提交…":reason??((bool?)Snapshot?["paused"]==true?"可安排制作 · 继续时间后开工":"条件满足 · 可安排制作");craftAvailability.color=reason==null?Muted:new Color32(224,177,128,255);var ready=reason==null&&!mutationPending&&queued==null;craftButton.GetComponentInChildren<NativeUiSurface>().Set(ready?new Color32(231,190,102,255):new Color32(42,54,41,255),ready?new Color32(210,163,72,255):new Color32(42,54,41,255),ready?Gold:Line,4);craftButton.GetComponentInChildren<Text>().color=ready?Ink:Muted;}
        }
        void ClearManagementContent()
        {
            progressFills.Clear();
            // Deactivate immediately: deferred Destroy must not affect layout or input this frame.
            foreach(Transform child in content){child.gameObject.SetActive(false);Destroy(child.gameObject);}
            if(details!=null){details.parent.gameObject.SetActive(false);Destroy(details.parent.gameObject);details=null;}
            if(queueArea!=null){queueArea.gameObject.SetActive(false);Destroy(queueArea.gameObject);queueArea=null;}
            if(craftFooter!=null){craftFooter.gameObject.SetActive(false);Destroy(craftFooter.gameObject);craftFooter=null;}
            if(craftDivider!=null){craftDivider.gameObject.SetActive(false);Destroy(craftDivider.gameObject);craftDivider=null;}
            craftButton=null;craftAvailability=null;
        }
        void PrepareManagementPage()
        {
            var viewport=(RectTransform)scroll.transform;viewport.anchorMin=Vector2.zero;viewport.anchorMax=Vector2.one;viewport.offsetMin=Vector2.zero;viewport.offsetMax=Vector2.zero;
            scroll.verticalNormalizedPosition=1;
        }
        JObject Recipe(string id)=>(Snapshot?["uiCatalog"]?["weapons"] as JArray)?.OfType<JObject>().FirstOrDefault(r=>(string)r["id"]==id);
        int Available(string resource)=>Math.Max(0,Stock(resource)-((Snapshot?["reservations"] as JObject)?.Properties().Sum(p=>(int?)p.Value[resource]??0)??0));
        string CraftBlockReason()
        {
            var recipe=Recipe(recipeSelection);if(recipe==null)return "配方尚未加载，请等待营地连接";
            if((bool?)Snapshot?["uiCatalog"]?["craftEnabled"]!=true)return "当前营地未开放制作";
            if(Snapshot?["uiCatalog"]?["workshop"] is JObject w&&(string)w["state"]!="ready")return "请先在营地页建成工坊";
            if((long?)Snapshot?["catchupTicks"]>0)return "世界正在补算，请稍候";
            if(recipeSelection=="WPN006"&&!(Snapshot?["combat"]?["unlockedRecipes"] as JArray??new JArray()).Any(r=>(string)r==recipeSelection))return "尚未解锁此配方";
            var a=Actor("player");if((bool?)a?["body"]?["incapacitated"]==true||(bool?)a?["body"]?["downed"]==true)return "领主当前无法行动";
            if((double?)a?["attributes"]?["craft"]<=0)return "领主不具备制作能力";
            if((Snapshot?["executions"] as JObject)?.Properties().Any(p=>(string)p.Value["command"]?["actorId"]=="player"&&new[]{"accepted","running"}.Contains((string)p.Value["status"]))==true)return "领主正在执行任务，请先完成或取消";
            var pos=a?["position"];var store=Snapshot?["economy"]?["storePosition"];if(Snapshot?["uiCatalog"]?["workshop"]==null&&pos!=null&&store!=null&&Math.Pow((double)pos["x"]-(double)store["x"],2)+Math.Pow((double)pos["y"]-(double)store["y"],2)>4)return "请先让领主回到营地工位附近";
            var missing=(recipe["cost"] as JObject)?.Properties().Where(p=>Available(p.Name)<(int)p.Value).Select(p=>ResourceName(p.Name)+"缺 "+((int)p.Value-Available(p.Name)));
            return missing!=null&&missing.Any()?String.Join(" · ",missing):null;
        }
        void DetailText(string value,int size=14,Color? color=null)
        {
            var t=Label(details,value,size);t.color=color??new Color32(229,231,211,255);AutoTextHeight(t.gameObject,Math.Max(32,size+12));
        }
        void DetailBind(Func<string> value){var t=Label(details,value(),14);t.color=Muted;AutoTextHeight(t.gameObject);bindings.Add((t,value));}
        void BuildCraftPage()
        {
            var viewport=(RectTransform)scroll.transform;viewport.anchorMax=new Vector2(0,1);viewport.offsetMax=new Vector2(348,0);content.GetComponent<VerticalLayoutGroup>().spacing=10;
            craftDivider=Box("配方分隔",pageArea,Vector2.zero,Vector2.one,new Vector2(366,0),new Vector2(-493,0));craftDivider.gameObject.AddComponent<Image>().color=Line;
            details=Scrolling("配方详情",pageArea,Vector2.zero,Vector2.one,new Vector2(386,100),Vector2.zero,out _);details.GetComponent<VerticalLayoutGroup>().enabled=false;details.GetComponent<ContentSizeFitter>().enabled=false;details.sizeDelta=new Vector2(0,404);
            var descriptions=new[]{"近身防卫","基础近战","远程狩猎","近身作战","远程作战","重型近战"};
            for(var i=0;i<6;i++){
                var recipe="WPN"+(i+1).ToString("000");var row=Button(content,"",()=>{recipeSelection=recipe;signature="";Refresh();});row.name="制作 "+recipe;row.GetComponent<LayoutElement>().minHeight=row.GetComponent<LayoutElement>().preferredHeight=72;row.GetComponent<LayoutElement>().preferredWidth=348;
                var skin=ReferenceUiArt.Surface(row.GetComponent<Image>(),recipe==recipeSelection,5);skin.Shadow=false;if(recipe!=recipeSelection)skin.BorderWidth=.7f;
                var image=Box("装备插画",row.transform,new Vector2(0,1),new Vector2(0,1),new Vector2(8,-68),new Vector2(124,-4));ReferenceUiArt.Atlas(image,"ReferenceWeapons",i);
                FixedLabel(row.transform,RecipeName(recipe),132,13,192,26,18).color=recipe==recipeSelection?Gold:ReferenceUiArt.Ivory;FixedLabel(row.transform,descriptions[i],132,42,188,24,16).color=Muted;
                if(recipe==recipeSelection){var arrow=Box("选中箭头",row.transform,new Vector2(1,.5f),new Vector2(1,.5f),new Vector2(-28,-10),new Vector2(-8,10)).gameObject.AddComponent<RawImage>();arrow.texture=Resources.Load<Texture2D>("Hud/ChevronRight");arrow.color=Gold;arrow.raycastTarget=false;}
            }
            var recipeData=Recipe(recipeSelection);var weaponTitle=FixedLabel(details,RecipeName(recipeSelection),0,4,200,44,26);weaponTitle.color=ReferenceUiArt.Ivory;weaponTitle.fontStyle=FontStyle.Bold;
            var tag=Box("装备类型",details,new Vector2(0,1),new Vector2(0,1),new Vector2(48,-67),new Vector2(146,-40),true);tag.GetComponentInChildren<NativeUiSurface>().Set(Color.clear,Color.clear,Line,4);var tagText=FixedLabel(tag,descriptions[ReferenceUiArt.WeaponIndex(recipeSelection)],0,2,98,24,14);tagText.color=Gold;tagText.alignment=TextAnchor.MiddleCenter;
            var hero=Box("装备详情插画",details,new Vector2(1,1),new Vector2(1,1),new Vector2(-266,-162),new Vector2(-4,4));ReferenceUiArt.Atlas(hero,"ReferenceWeapons",ReferenceUiArt.WeaponIndex(recipeSelection));
            ManagementSymbol(details,4,0,142,24);FixedLabel(details,"用途",36,143,180,28,18).fontStyle=FontStyle.Bold;
            FixedLabel(details,"攻击 +"+recipeData?["attack"]+" · 射程 "+recipeData?["range"]+"\n"+((string)recipeData?["note"]??"营地装备")+"，可装备或交给伙伴。",38,176,424,48,16).color=ReferenceUiArt.Ivory;
            Box("用途分隔",details,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-226),new Vector2(0,-225)).gameObject.AddComponent<Image>().color=Line;
            ManagementSymbol(details,5,0,240,26);FixedLabel(details,"制作条件",38,240,220,30,18).fontStyle=FontStyle.Bold;
            var rowNames=new[]{"消耗 / 可用","制作地点","完成后"};var rowIcons=new[]{"ShieldCheck","House","ArrowUpRight"};
            for(var i=0;i<3;i++){
                var r=Box("制作条件"+i,details,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-314-i*44),new Vector2(0,-278-i*44),true);var surface=r.GetComponentInChildren<NativeUiSurface>();surface.Shadow=false;surface.Set(new Color32(22,47,38,230),new Color32(16,38,30,230),new Color32(63,89,67,75),5);
                var icon=Box("条件图标",r,new Vector2(0,1),new Vector2(0,1),new Vector2(10,-27),new Vector2(30,-7)).gameObject.AddComponent<RawImage>();icon.texture=Resources.Load<Texture2D>("Hud/"+rowIcons[i]);icon.color=Gold;icon.raycastTarget=false;
                FixedLabel(r,rowNames[i],44,6,112,26,16);var value=FixedLabel(r,"",166,6,302,26,16);value.color=ReferenceUiArt.Ivory;
                if(i==0){Func<string> materials=()=>String.Join(" · ",(Recipe(recipeSelection)?["cost"] as JObject)?.Properties().Where(p=>(int)p.Value>0).Select(p=>ResourceName(p.Name)+" "+p.Value+"/"+Available(p.Name))??Array.Empty<string>());value.text=materials();bindings.Add((value,materials));}
                else value.text=i==1?"营地工坊（自动前往）":"制作者持有，按指定人交接";
            }
            craftFooter=Box("制作操作区",pageArea,Vector2.zero,new Vector2(1,0),new Vector2(386,0),new Vector2(0,92));
            Box("操作分隔",craftFooter,new Vector2(0,1),Vector2.one,new Vector2(0,-1),Vector2.zero).gameObject.AddComponent<Image>().color=Line;
            var person=Box("领主图标",craftFooter,new Vector2(0,1),new Vector2(0,1),new Vector2(0,-76),new Vector2(28,-48));ReferenceUiArt.Atlas(person,"ReferenceResources",5);
            craftAvailability=FixedLabel(craftFooter,"",40,43,254,42,16);
            if(Actor(craftRecipient)==null)craftRecipient="player";
            var recipientButton=Button(craftFooter,"接收人："+PersonName(craftRecipient)+"（切换）",()=>{var ids=((JObject)Snapshot["actors"]).Properties().Where(p=>(bool?)p.Value["body"]?["incapacitated"]!=true&&(bool?)p.Value["body"]?["downed"]!=true).Select(p=>p.Name).ToArray();if(ids.Length>0)craftRecipient=ids[(Array.IndexOf(ids,craftRecipient)+1)%ids.Length];signature="";Refresh();});PlaceButton(recipientButton,0,0,294,36);
            craftButton=Button(craftFooter,"安排制作",()=>{if(CraftBlockReason()!=null||mutationPending||queued!=null)return;Command("CRAFT",null,new JObject{["recipeId"]=recipeSelection,["recipientId"]=craftRecipient,["deliver"]=craftRecipient!="player",["agreementId"]=null});});PlaceButton(craftButton,300,24,168,52);craftButton.GetComponentInChildren<Text>().fontSize=18;((RectTransform)craftButton.GetComponentInChildren<Text>().transform).offsetMin=new Vector2(52,4);ManagementSymbol(craftButton.transform,1,16,14,24,new Color32(56,57,27,255));
            queueArea=Box("制作队列",panel,Vector2.zero,new Vector2(1,0),Vector2.zero,new Vector2(0,96));Box("队列分隔",queueArea,new Vector2(0,1),Vector2.one,new Vector2(0,-1),Vector2.zero).gameObject.AddComponent<Image>().color=Line;
            var clockIcon=ReferenceUiArt.Atlas(Box("工单时钟",queueArea,new Vector2(0,1),new Vector2(0,1),new Vector2(22,-48),new Vector2(60,-10)),"ReferenceUtility",0);clockIcon.color=Gold;clockIcon.raycastTarget=false;
            FixedLabel(queueArea,"制作队列",66,16,148,30,20).color=Gold;
            var stamp=Box("营地印章",queueArea,new Vector2(1,0),Vector2.one,new Vector2(-190,4),new Vector2(-20,-8)).gameObject.AddComponent<RawImage>();stamp.texture=Resources.Load<Texture2D>("Hud/ReferenceCampStamp");stamp.color=new Color(.4f,.5f,.3f,.18f);stamp.raycastTarget=false;
            var queueText=FixedLabel(queueArea,"",250,38,650,32,16);queueText.color=Muted;queueText.alignment=TextAnchor.MiddleCenter;
            Func<string> queueValue=()=>{var active=(Snapshot?["executions"] as JObject)?.Properties().Where(p=>new[]{"accepted","running"}.Contains((string)p.Value["status"])).ToArray();if(active!=null&&active.Length>0)return String.Join(" · ",active.Select(p=>ActivityLabel((string)p.Value["command"]?["action"])+" · 剩余 "+Math.Ceiling((double?)p.Value["remaining"]??0)+" 秒"));var item=(Snapshot?["economy"]?["items"] as JObject)?.Properties().LastOrDefault(p=>(string)Snapshot?["economy"]?["orders"]?[(string)p.Value["orderId"]]?["actorId"]=="player");return item==null?"暂无工单 · 可指定接收人后安排制作":RecipeName((string)item.Value["recipeId"])+" · 持有人："+PersonName((string)item.Value["holderId"])+((string)item.Value["equippedBy"]!=null?" · 已装备":" · 未装备，去人物页查看");};queueText.text=queueValue();bindings.Add((queueText,queueValue));
            var current=(Snapshot?["executions"] as JObject)?.Properties().FirstOrDefault(p=>new[]{"accepted","running"}.Contains((string)p.Value["status"]));if(current!=null){var id=current.Name;var cancel=Button(queueArea,"取消当前任务",()=>Mutate("cancel",new JObject{["operationId"]="cancel-"+Guid.NewGuid().ToString("N"),["executionId"]=id}));PlaceButton(cancel,916,34,154,34);}
            RefreshManagementHeader();
        }
        void BuildFenceUpgrade()
        {
            Text("营地维护 · 升级与修复由领主在营地工位执行。");
            var level=(int?)Snapshot?["economy"]?["fence"]?["level"]??0;
            var next=(Snapshot?["uiCatalog"]?["fences"] as JArray)?.FirstOrDefault(f=>(int?)f["level"]==level+1);
            if(next==null){Text("围栏已达到当前可用的最高等级。");return;}
            Text("升级至 "+(level+1)+" 级 · "+String.Join(" / ",(next["cost"] as JObject)?.Properties().Select(p=>ResourceName(p.Name)+" "+p.Value)??Array.Empty<string>()));
            Button(content,"升级围栏",()=>Command("UPGRADE_FENCE",null,new JObject{["recipeId"]=(level+1).ToString(),["recipientId"]="player",["agreementId"]=null}));
        }
        void BuildEquipment()
        {
            Text("装备去向 · 制作、交接和装备分别记录");var items=(Snapshot?["economy"]?["items"] as JObject)?.Properties().ToArray();
            if(items==null||items.Length==0){Text("暂无装备。前往制作装备页安排制作，完成后可在这里装备或交给伙伴。");return;}
            foreach(var property in items){
                var id=property.Name;var item=property.Value;var recipe=RecipeName((string)item["recipeId"]);var holder=(string)item["holderId"];var wearer=(string)item["equippedBy"];var data=Recipe((string)item["recipeId"]);var order=Snapshot?["economy"]?["orders"]?[(string)item["orderId"]];
                Text(recipe+" · 攻击 +"+data?["attack"]+" / 射程 "+data?["range"]+"\n所有者："+PersonName((string)item["ownerId"])+" · 持有人："+PersonName(holder)+"\n"+(wearer==null?"未装备":"使用者："+PersonName(wearer))+" · 指定接收人："+PersonName((string)order?["recipientId"]));
                var chosen=Actor(selected);var oldItem=Snapshot?["economy"]?["items"]?[(string)chosen?["equipment"]??""];var oldRecipe=Recipe((string)oldItem?["recipeId"]);var attackDelta=((double?)data?["attack"]??0)-((double?)oldRecipe?["attack"]??0);var rangeDelta=((double?)data?["range"]??0)-((double?)chosen?["growth"]?["stats"]?["range"]??1);
                Text("相对"+PersonName(selected)+"当前装备：攻击 "+attackDelta.ToString("+0.#;-0.#;0")+" / 射程 "+rangeDelta.ToString("+0.#;-0.#;0"));
                if(holder=="player"){
                    if(wearer==null){var equip=Button(content,"领主装备 "+recipe,()=>Command("EQUIP",null,new JObject{["itemId"]=id}));equip.name="装备 "+id;if(selected!="player"&&(string)item["ownerId"]=="player")Button(content,"走过去交给 "+PersonName(selected),()=>Command("DELIVER_ITEM",selected,new JObject{["itemId"]=id}));}
                    else Button(content,"领主卸下 "+recipe,()=>Command("UNEQUIP"));
                }else if(wearer==null){var currentItem=Snapshot?["economy"]?["items"]?[(string)Actor(holder)?["equipment"]??""];var currentRecipe=Recipe((string)currentItem?["recipeId"]);Text(currentRecipe!=null&&((double?)currentRecipe["attack"]??0)>=((double?)data?["attack"]??0)?"伙伴当前武器攻击更高或相同，会保留原装备；可与其协商交接，或把新装备分给缺装备的伙伴。":"由持有人自主装备；若正在忙碌或倒地，将暂缓执行。");}
                var delivery=(Snapshot?["uiCatalog"]?["deliveries"] as JArray)?.FirstOrDefault(d=>(string)d["itemId"]==id);if(delivery!=null&&delivery["reason"]?.Type!=JTokenType.Null)Text("交付提醒："+delivery["reason"]);
            }
        }
        void BuildPeoplePage()
        {
            var viewport=(RectTransform)scroll.transform;viewport.anchorMax=new Vector2(0,1);viewport.offsetMax=new Vector2(250,0);
            details=Scrolling("人物详情",pageArea,Vector2.zero,Vector2.one,new Vector2(276,0),Vector2.zero,out _);
            foreach(var property in ((JObject)Snapshot["actors"]).Properties()){
                var id=property.Name;var b=Button(content,(string)property.Value["name"]+(id=="player"?" · 领主":""),()=>{selected=id;if(actors.TryGetValue(id,out var model))view.focus=model.position;signature="";Refresh();});
                b.GetComponent<LayoutElement>().preferredHeight=42;if(id==selected){b.GetComponentInChildren<Text>().color=Gold;b.GetComponentInChildren<NativeUiSurface>().Set(new Color32(46,57,35,255),new Color32(46,57,35,255),Gold,4);}
            }
            DetailText((string)Actor(selected)?["name"]??"人物",20,Gold);
            DetailBind(()=>"等级 "+Actor(selected)?["level"]+"    生命 "+((double?)Actor(selected)?["body"]?["hp"]??0).ToString("0")+" / "+((double?)Actor(selected)?["body"]?["maxHp"]??0).ToString("0")+"    体力 "+((double?)Actor(selected)?["body"]?["energy"]??0).ToString("0"));
            DetailBind(()=>(bool?)Actor(selected)?["body"]?["incapacitated"]==true?"已故":(bool?)Actor(selected)?["body"]?["downed"]==true?"倒地待救援":"可行动");
            BuildGrowth();
            DetailText("领主会实际靠近伙伴完成救援、治疗与装备交接。",14,Muted);
            var list=content;content=details;
            try {
                if(selected!="player"&&(bool?)Actor(selected)?["body"]?["incapacitated"]!=true){Button(content,"领主搬救此人",()=>Command("RESCUE",selected));Button(content,"领主治疗此人",()=>Command("HEAL",selected));Button(content,"跟随五秒",()=>Command("FOLLOW",selected,new JObject{["seconds"]=5}));Button(content,"护送五秒",()=>Command("ESCORT",selected,new JObject{["seconds"]=5}));Button(content,"陪伴五秒",()=>Command("SOCIAL_VISIT",selected,new JObject{["seconds"]=5}));}
                BuildEquipment();
                foreach(var property in (Snapshot["combat"]?["enemies"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){var id=property.Name;if((double?)property.Value["hp"]<=0)continue;Button(content,"攻击 "+property.Value["archetypeId"],()=>Command("ATTACK",id));}
            } finally {content=list;}
        }
        void BuildCampOverview()
        {
            var viewport=(RectTransform)scroll.transform;viewport.anchorMax=new Vector2(0,1);viewport.offsetMax=new Vector2(294,0);
            details=Scrolling("营地概况详情",pageArea,Vector2.zero,Vector2.one,new Vector2(320,0),Vector2.zero,out _);
            DetailText("营地概况",20,Gold);
            BuildJourney();
            DetailBind(()=>"公共物资    木材 "+Stock("wood")+" / 石料 "+Stock("stone")+" / 绳索 "+Stock("rope")+" / 粮食 "+Stock("food"));
            DetailBind(()=>"存活伙伴 "+((JObject)Snapshot["actors"]).Properties().Count(p=>p.Name!="player"&&(bool?)p.Value["body"]?["incapacitated"]!=true)+"    已登记 "+(((JObject)Snapshot["actors"]).Count-1)+" / 10");
            DetailBind(()=>"围栏 "+Snapshot["economy"]?["fence"]?["level"]+" 级    耐久 "+Snapshot["economy"]?["fence"]?["hp"]+"    已来袭 "+((Snapshot["combat"]?["waves"] as JObject)?.Count??0)+" 波");
            var list=content;content=details;
            try {
                BuildFenceUpgrade();
                Text("领主行动");Button(content,"领主休整 · 恢复体力",()=>Command("REST",null,new JObject{["seconds"]=5}));Button(content,"领主修复围栏",()=>Command("REPAIR_FENCE"));Button(content,"领主存入携带物资",()=>Command("DEPOSIT"));Button(content,"领主进食",()=>Command("EAT"));Button(content,"寨外动物与狩猎",()=>ShowManagement("狩猎"));
                if(Snapshot["combat"]?["fenceGeometry"]?["gatePosition"]!=null){Button(content,"打开寨门（领主需在门旁）",()=>Command("BUILD_FENCE",null,new JObject{["gateOpen"]=true}));Button(content,"关闭寨门（领主需在门旁）",()=>Command("BUILD_FENCE",null,new JObject{["gateOpen"]=false}));}
            } finally {content=list;}
        }
    }
}
