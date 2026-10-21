using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace CampMind.Presentation
{
    public sealed class NativeWorldChannel
    {
        public sealed class Message
        {
            public string Id,Speaker,Text,Source,Recipients,NpcId;
            public bool Conversation;
            public double Time;
            public long Order;
        }
        readonly List<Message> items=new List<Message>();
        readonly HashSet<string> seen=new HashSet<string>();
        long sequence;
        string scope;
        string villageScope;
        public IReadOnlyList<Message> Items=>items;
        public void CaptureVillage(JObject world)
        {
            var next=(string)world["worldId"]??"";
            if(villageScope!=null&&villageScope!=next){var previous=villageScope+":";items.RemoveAll(m=>m.Id.StartsWith(previous,StringComparison.Ordinal));seen.RemoveWhere(id=>id.StartsWith(previous,StringComparison.Ordinal));}
            villageScope=next;
            string Name(string id)=>String.IsNullOrEmpty(id)?"未指定":id=="player"?"领主":(string)world["actors"]?[id]?["name"]??"伙伴";
            foreach(var proposal in (world["social"]?["proposals"] as JObject)?.Properties()??Enumerable.Empty<JProperty>()){
                var p=proposal.Value;var id=(string)p["actorId"];var recipients=p["parties"] is JArray parties?string.Join("、",parties.Select(t=>Name((string)t))):"";
                Put(world["worldId"]+":proposal:"+proposal.Name,true,Name(id),(string)p["speech"],(double?)world["elapsed"]??0,"伙伴提议",recipients,id);
            }
            foreach(var e in world["events"] as JArray??new JArray()){
                var kind=(string)e["kind"];string text=null;
                if(kind=="wildlife.warning")text=(string)e["facts"]?["text"]+" · "+(string)e["facts"]?["direction"];
                else if(kind=="migration.completed")text="原存档已兼容升级，原始记录已保留。";
                else if(kind=="wave.started"||kind=="wave.spawned")text="野狼正在来袭，请做好防御。";
                else if(kind=="actor.levelled_up")text=Name((string)e["participants"]?[0])+"升到"+e["facts"]?["toLevel"]+"级 · "+NativeVillageUi.GrowthGains(e["facts"]?["gains"]);
                else if(kind=="progression.acknowledged"){var speaker=(string)e["facts"]?["speakerId"];Put(world["worldId"]+":event:"+e["id"],true,Name(speaker),(string)e["facts"]?["text"],(double?)e["at"]??0,"成长见证",Name((string)e["facts"]?["recipientId"]),speaker);}
                else if(kind=="workshop.built")text="营地工坊已建成，可以安排制作装备。";
                else if(kind=="milestone.completed")text="阶段目标已达成，打开营地查看积累与下一步。";
                else if(kind=="equipment.equipped")text=Name((string)e["participants"]?[0])+"已装备武器，攻击与射程按当前装备生效。";
                else if(kind=="item.handed_over")text=Name((string)e["participants"]?[0])+"已把装备交给"+Name((string)e["facts"]?["recipientId"])+"，等待持有人装备。";
                else if(kind=="craft.completed"||kind=="item.crafted")text=Name((string)e["participants"]?[0])+"已完成装备制作，物品由制作者持有，指定接收人："+Name((string)e["facts"]?["recipientId"])+"。";
                else if(kind=="actor.died"||kind=="actor.death")text="一名伙伴已经离世。";
                else if(kind=="agreement.fulfilled")text="伙伴已履行约定。";
                else if(kind=="wildlife.hunt_completed")text=Name((string)e["participants"]?[0])+"已取得猎物，携带肉类 "+e["facts"]?["amount"]+"，可搬运入库。";
                else if(kind=="wildlife.human_hit")text=Name((string)e["participants"]?[0])+"遭到野生动物反击。";
                else if(kind=="wildlife.hunt_route_blocked")text="追猎路线受阻，请调整位置后重试。";
                else if(kind=="wildlife.hunt_stopped")text="追猎已结束。";
                if(text!=null)Put(world["worldId"]+":event:"+e["id"],false,"营地",text,(double?)e["at"]??0);
            }
        }
        public void Put(string id,bool conversation,string speaker,string text,double time,string source="",string recipients="",string npcId="")
        {
            if(string.IsNullOrWhiteSpace(text))return;
            var item=items.FirstOrDefault(m=>m.Id==id);
            if(item==null){if(!seen.Add(id))return;item=new Message{Id=id,Order=++sequence};items.Add(item);if(seen.Count>1000)seen.Remove(seen.First());}
            item.Conversation=conversation;item.Speaker=speaker;item.Text=text;item.Time=time;item.Source=source;item.Recipients=recipients;item.NpcId=npcId;
            items.Sort((a,b)=>{var comparison=a.Time.CompareTo(b.Time);return comparison==0?a.Order.CompareTo(b.Order):comparison;});
            var system=0;var channel=0;
            for(var i=items.Count-1;i>=0;i--)
                if(items[i].Conversation?++channel>100:++system>50)items.RemoveAt(i);
        }
        public void Capture(JObject snapshot)
        {
            var next=(string)snapshot["dialogueScope"]??"";
            if(scope!=next){items.Clear();seen.Clear();sequence=0;scope=next;}
            var state=snapshot["state"] as JObject;if(state==null)return;
            var live=new HashSet<string>();
            void Track(string id,bool conversation,string speaker,string text,double time,string source="",string recipients="",string npcId=""){live.Add(id);Put(id,conversation,speaker,text,time,source,recipients,npcId);}
            string Name(string id)=>id=="player"?"领主":(string)(state["npcs"] as JArray)?.FirstOrDefault(n=>(string)n["id"]==id)?["name"]??id;
            string Names(JToken ids)=>ids is JArray list?string.Join("、",list.Select(t=>Name((string)t))):"";
            foreach(var e in state["events"] as JArray??new JArray())
                Track("event:"+e["id"],false,"系统",(string)e["text"],(double?)e["time"]??0);
            foreach(var d in snapshot["dialogues"] as JArray??new JArray())
            {
                var id=(string)d["npcId"];
                Track("dialogue:"+d["id"],true,Name(id),(string)d["text"],(double?)d["at"]??0,(string)d["source"],Names(d["targetIds"]),id);
            }
            foreach(var m in state["socialLife"]?["messages"] as JArray??new JArray())
            {
                var from=(string)m["from"];
                Track("society:"+m["id"],true,Name(from),(string)m["text"],(double?)m["at"]??0,(string)m["source"],Names(m["to"]),from=="player"?"":from);
            }
            foreach(var thread in state["social"]?["threads"] as JArray??new JArray())
                foreach(var line in thread["lines"] as JArray??new JArray())
                    if((string)line["speaker"]=="player")Track("social:"+thread["id"]+":"+line["id"],true,"领主",(string)line["text"],(double?)line["at"]??0,"player",Names(thread["participants"]));
            seen.IntersectWith(live);
        }
    }
}
