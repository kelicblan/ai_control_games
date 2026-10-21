using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        bool villageHud;
        readonly System.Collections.Generic.List<UnityEngine.UI.Button> villageActionButtons=new System.Collections.Generic.List<UnityEngine.UI.Button>();
        string villageManagementTab;
        UnityEngine.RectTransform villageActions;
        UnityEngine.UI.Text villageResources;
        readonly string[] villagePortraitKeys=new string[10];
        JObject villageProjectionSource,villageProjectionCache;
        JObject VillageProjection()
        {
            var village=GetComponent<NativeVillageUi>()?.Snapshot;if(!villageHud||village==null)return view.World;
            if(ReferenceEquals(villageProjectionSource,village))return villageProjectionCache;
            var people=new JArray();var old=view.World?["npcs"] as JArray??new JArray();
            foreach(var p in (JObject)village["actors"]){if(p.Key=="player")continue;var a=p.Value;var body=a["body"];var original=old.FirstOrDefault(n=>(string)n["id"]==p.Key);var task=(village["executions"] as JObject)?.Properties().Select(e=>e.Value).FirstOrDefault(e=>(string)e["command"]?["actorId"]==p.Key&&new[]{"accepted","running"}.Contains((string)e["status"]));
                people.Add(new JObject{["id"]=p.Key,["name"]=a["name"]?.DeepClone(),["color"]=original?["color"]?.DeepClone()??"#8bbcaf",["alive"]=(bool?)body?["incapacitated"]!=true,["health"]=(double?)body?["maxHp"]>0?(double)body["hp"]/(double)body["maxHp"]*100:0,["energy"]=body?["energy"]?.DeepClone(),["hunger"]=body?["hunger"]?.DeepClone(),["action"]=(a["activity"] as JObject)?["action"]?.DeepClone(),["progress"]=(double?)task?["duration"]>0?Mathf.Clamp01(1-(float)task["remaining"]/(float)task["duration"]):0});
            }
            for(var i=0;i<portraits.Count;i++){var npc=people.ElementAtOrDefault(i);portraits[i].gameObject.SetActive(npc!=null);var id=(string)npc?["id"];if(id==null||villagePortraitKeys[i]==id)continue;villagePortraitKeys[i]=id;var button=portraits[i].GetComponent<UnityEngine.UI.Button>();button.onClick.RemoveAllListeners();button.onClick.AddListener(()=>{controlledNpc=controlledNpc==id?null:id;view.SelectNpc(id);dispatch=false;});}
            if(people.Count>0&&!people.Any(n=>(string)n["id"]==view.SelectedNpc))view.SelectNpc((string)people[0]["id"]);
            villageProjectionSource=village;
            return villageProjectionCache=new JObject{["wood"]=village["inventory"]?["wood"]?.DeepClone(),["food"]=village["inventory"]?["food"]?.DeepClone(),["fire"]=view.World?["fire"]?.DeepClone()??0,["elapsed"]=village["elapsed"]?.DeepClone(),["status"]=(bool?)village["paused"]==true?"paused":"playing",["npcs"]=people,["agency"]=new JObject{["modelId"]=view.World?["agency"]?["modelId"]?.DeepClone(),["enabled"]=view.World?["agency"]?["enabled"]?.DeepClone(),["cognition"]=view.World?["agency"]?["cognition"]?.DeepClone()}};
        }
        public bool VillageHudVisible=>villageHud&&hud!=null&&hud.gameObject.activeInHierarchy;
        public void SetVillageHud(bool village)
        {
            villageHud=village;
            if(village&&page=="开始旅程"&&!waitingForStart&&!settingsDirty&&modal!=null&&modal.gameObject.activeSelf)Close();
            if(hud!=null)hud.gameObject.SetActive(true);
            if(actorOverlay!=null)actorOverlay.gameObject.SetActive(!village);
            if(village&&villageActions==null&&hud!=null){
                villageActions=Panel("新增玩法入口",hud,new UnityEngine.Vector2(.5f,0),new UnityEngine.Vector2(.5f,0),new UnityEngine.Vector2(-329,18),new UnityEngine.Vector2(339,78));
                var labels=new[]{"制作装备","营地升级","协作约定","人物装备"};var tabs=new[]{"制作","营地","协作","人物"};
                var icons=new[]{"Axe","House","HeartHandshake","Users"};
                for(var i=0;i<labels.Length;i++){var entry=tabs[i];var text=Button(villageActions,labels[i],6+i*164,5,160,50,()=>GetComponent<NativeVillageUi>()?.ShowManagement(entry));text.fontSize=16;text.alignment=UnityEngine.TextAnchor.MiddleRight;Place((UnityEngine.RectTransform)text.transform,50,2,98,46);var b=text.GetComponentInParent<UnityEngine.UI.Button>();ReferenceUiArt.Atlas(At("入口图标",b.transform,12,10,32,32),"ReferenceSymbols",new[]{1,0,3,2}[i]);villageActionButtons.Add(b);}
                SetVillageManagementSelection(villageManagementTab);

            }
            if(villageActions!=null)villageActions.gameObject.SetActive(village);
            if(villageResources!=null)villageResources.transform.parent.gameObject.SetActive(village);
        }
        public void SetVillageManagementSelection(string selected)
        {
            villageManagementTab=selected;var tabs=new[]{"制作","营地","协作","人物"};
            for(var i=0;i<villageActionButtons.Count;i++){var button=villageActionButtons[i];var active=tabs[i]==selected;var skin=ReferenceUiArt.Surface(button.GetComponent<UnityEngine.UI.Image>(),false,5);if(active){skin.Border=ReferenceUiArt.Gold;skin.BorderWidth=2;skin.SetVerticesDirty();}button.GetComponentInChildren<UnityEngine.UI.Text>().color=active?new UnityEngine.Color32(240,208,133,255):new UnityEngine.Color32(211,220,198,255);}
        }
        public void ShowVillageSettings(){settingsCategory=1;Open("游戏设置");}
        public void ShowVillageMap(){Open("世界地图");}
    }
}
