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
        public IReadOnlyList<Message> Items=>items;
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
