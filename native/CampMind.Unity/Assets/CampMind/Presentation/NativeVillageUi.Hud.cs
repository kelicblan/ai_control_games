using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        public bool ManagementPanelOpen=>panelOpen;
        public bool FormalHudVisible=>legacyUi!=null&&legacyUi.VillageHudVisible;
        void BuildFormalHud(){toggleButton.gameObject.SetActive(false);}
        void RefreshFormalHud(){if(legacyUi!=null)legacyUi.SetVillageHud(VillageActive);}
        public void ShowManagement(string page){tab=page;panelOpen=true;signature="";Refresh();panel.gameObject.SetActive(!view.InputBlocked);panel.SetAsLastSibling();}
        bool resetting;
        public void ResetExternalWorld(Action<string> complete){if(Snapshot==null||resetting||mutationPending){complete("上一条操作尚未完成，请稍后重试");return;}resetting=true;StartCoroutine(ResetExternalRequest(complete));}
        System.Collections.IEnumerator ResetExternalRequest(Action<string> complete){
            while(pending)yield return null;
            if((bool?)Snapshot["paused"]!=true){SetPaused(true);while(pending)yield return null;if((bool?)Snapshot["paused"]!=true){resetting=false;complete(string.IsNullOrEmpty(Error)?"请先暂停世界后再重置":Error);yield break;}}
            pending=true;mutationPending=true;
            view.Authority.Api("/game-api/pixel/reset",new JObject{["worldId"]=Snapshot["worldId"],["revision"]=Snapshot["revision"],["operationId"]="reset-"+Guid.NewGuid().ToString("N")},(result,error)=>{pending=false;mutationPending=false;resetting=false;if(error==null&&result!=null)AdoptSnapshot(result);complete(error);});
        }
        public void TogglePause(){if(Snapshot!=null)Mutate("pause",new JObject{["paused"]=!((bool?)Snapshot["paused"]??true)});}
        public void SetPaused(bool paused){if(Snapshot!=null)Mutate("pause",new JObject{["paused"]=paused});}
        public void ChangeSpeed(int speed){Mutate("speed",new JObject{["speed"]=speed});}
        public bool HandleOriginalCommand(string type,JObject values)
        {
            if(!VillageActive||Snapshot==null)return false;
            if(type=="weather"){Mutate("weather",new JObject{["weather"]=values?["weather"]});return true;}
            if(type=="select"){var id=(string)values?["npcId"];if(Actor(id)!=null)selected=id;return true;}
            if(type=="move"){Command("REPOSITION",null,values?["target"] as JObject);return true;}
            if(type=="gate-toggle"){Command("BUILD_FENCE",null,new JObject{["gateOpen"]=(bool?)Snapshot["combat"]?["gateOpen"]!=true});return true;}
            if(type=="assign"){
                var action=(string)values?["action"];
                if(action=="rest"){Command("REST",null,new JObject{["seconds"]=5});return true;}
                if(action=="wood"||action=="food"){
                    var player=Actor("player")["position"];var px=(double)player["x"];var py=(double)player["y"];
                    var source=action=="food"?Snapshot["economy"]?["foodSources"] as JObject:Snapshot["economy"]?["nodes"] as JObject;
                    var target=source?.Properties().Where(p=>action=="food"?(int?)p.Value["remaining"]>0:(string)p.Value["resource"]=="wood"&&(double?)p.Value["remainingHp"]>0).OrderBy(p=>Math.Pow((double)p.Value["position"]["x"]-px,2)+Math.Pow((double)p.Value["position"]["y"]-py,2)).FirstOrDefault();
                    if(target!=null)Command(action=="food"?"GATHER_FOOD":"GATHER_WOOD",target.Name);else{Error="附近暂无可采集目标，可在营地中查看资源。";errorExpires=Time.realtimeSinceStartup+5;}return true;
                }
                if(action=="help"){var id=view.SelectedNpc;var a=Actor(id);if(a!=null&&(bool?)a["body"]?["incapacitated"]!=true)Command((bool?)a["body"]?["downed"]==true?"RESCUE":"HEAL",id);else ShowManagement("人物");return true;}
            }
            if(type=="hunt"){ShowHunting();return true;}
            return false;
        }
        public static string ActivityLabel(string action)
        {
            if(action=="BUILD_WORKSHOP")return "建设工坊";
            if(action=="DELIVER_ITEM")return "交付装备";
            if(action=="EQUIP")return "装备武器";
            if(action=="UNEQUIP")return "卸下武器";
            if(action=="UPGRADE_FENCE")return "升级围栏";
            if(action=="EXPLORE")return "探索";
            if(action=="wildlife.hunt_completed"||action=="wildlife.harvested")return "狩猎收获";
            switch(action){case "GATHER_WOOD":return "采集木材";case "GATHER_STONE":return "采集石料";case "GATHER_ROPE":return "采集麻料";case "GATHER_FOOD":return "采集野果";case "DEPOSIT":return "搬运入库";case "CRAFT":return "制作装备";case "ATTACK":return "战斗";case "REST":return "休息";case "EAT":return "进食";case "RESCUE":return "救援";case "HEAL":return "治疗";case "GUARD":return "值守";case "REPAIR_FENCE":return "修复围栏";case "REPOSITION":return "移动";case "SOCIAL_VISIT":return "与伙伴相处";default:return "";}
        }
    }
}
