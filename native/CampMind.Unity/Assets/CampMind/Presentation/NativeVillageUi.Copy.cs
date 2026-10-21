using System;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        string PersonName(string id)=>String.IsNullOrEmpty(id)?"伙伴":id=="player"?"领主":(string)Actor(id)?["name"]??"伙伴";
        static string AgreementStatus(string status)
        {
            switch(status){case "proposed":return "等待回应";case "accepted":return "已同意";case "waiting_conditions":return "等待条件满足";case "active_plan":case "executing":return "正在执行";case "verifying":return "核对完成情况";case "fulfilled":return "已履行";case "cancelled":return "已取消";case "partial":return "部分完成";case "breached":return "未履约";default:return "等待进展";}
        }
        string ReadableTerms(JToken terms)
        {
            var steps=(terms?["steps"] as JArray??new JArray()).Select((step,index)=>{
                var action=(string)step["capability"];var name=ActivityLabel(action);if(String.IsNullOrEmpty(name))name=action=="TRANSFER"?"交接装备":action=="FOLLOW"?"跟随":action=="ESCORT"?"护送":action=="GOTO_RENDEZVOUS"?"前往会合点":action=="ACCEPT_REQUEST"?"接受约定安排":action;
                var text=$"{index+1}. {PersonName((string)step["actorId"])} · {name}";
                if(step["targetId"]!=null)text+=" → "+PersonName((string)step["targetId"]);
                var p=step["parameters"] as JObject;if(p!=null)foreach(var field in p.Properties()){
                    if(field.Name=="seconds")text+=" · "+field.Value+" 秒";
                    else if(field.Name=="recipeId")text+=" · "+RecipeName((string)field.Value);
                    else if(field.Name=="itemId"){var recipe=(string)Snapshot?["economy"]?["items"]?[(string)field.Value]?["recipeId"];text+=" · "+(recipe!=null?RecipeName(recipe):"指定装备（"+field.Value+"）");}
                    else if(field.Name=="rights")text+=(string)field.Value=="use"?" · 仅转交使用权":" · 归还装备";
                    else if(field.Name=="x"||field.Name=="y")text+=" · "+field.Name.ToUpperInvariant()+" "+field.Value;
                    else text+=" · "+TermValue(field.Value);
                }
                return text;
            });
            var result=String.Join("\n",steps);if(terms?["deadline"]?.Type!=JTokenType.Null&&terms?["deadline"]!=null)result+="\n完成期限：营地时间 "+terms["deadline"]+" 秒";return result;
        }
        string TermValue(JToken value)
        {
            if(value is JArray list)return String.Join("、",list.Select(TermValue));
            if(value is JObject obj)return String.Join("；",obj.Properties().Select(p=>TermKey(p.Name)+"："+TermValue(p.Value)));
            var text=value?.ToString()??"无";if(Actor(text)!=null)return PersonName(text);
            switch(text){case "loan":return "装备借用";case "duty":return "轮值";case "guard":return "值守";case "return":return "归还";case "use":return "使用权";default:return text;}
        }
        static string TermKey(string key)
        {
            switch(key){case "kind":return "类型";case "id":return "编号";case "actorId":return "执行人";case "recipientId":return "接收人";case "ownerId":return "所有人";case "parties":return "参与者";case "itemId":return "装备";case "seconds":return "持续秒数";case "deadline":case "dueAt":return "期限";case "startsAt":return "开始时间";case "endsAt":return "结束时间";case "obligations":return "责任";case "rights":return "权利";case "action":return "行动";case "position":return "地点";default:return key;}
        }
        string SocialEventLabel(JToken e)
        {
            var kind=(string)e["kind"];switch(kind){case "agreement.fulfilled":return "伙伴已履行约定。";case "agreement.cancelled":return "一项协作约定已取消。";case "agreement.breached":return "一项约定未能履行，请检查条件。";case "item.transferred":return "装备交接已完成。";case "rest.completed":return PersonName((string)e["participants"]?[0])+"已完成休整。";case "item.crafted":case "craft.completed":return "新的装备已经制作完成。";default:return null;}
        }
    }
}
