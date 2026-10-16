using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeChannelTests
    {
        [Test] public void RepeatedHistoricalSnapshotsCannotEvictRecentChannelMessages()
        {
            var store=new NativeWorldChannel();var messages=new JArray();
            for(var i=0;i<130;i++)messages.Add(new JObject{["id"]="m"+i,["from"]="azhuang",["text"]="最近的消息"+i,["at"]=i+10});
            var snapshot=new JObject{["dialogueScope"]="a",["state"]=new JObject{["socialLife"]=new JObject{["messages"]=messages}},["dialogues"]=new JArray(new JObject{["id"]="old",["npcId"]="azhuang",["text"]="很早的对话",["at"]=1})};
            store.Capture(snapshot);store.Capture(snapshot);
            Assert.That(store.Items.Count,Is.EqualTo(100));Assert.That(store.Items.All(m=>m.Time>=40),Is.True);
        }
        [Test] public void IndependentRetentionAndStableUpdates()
        {
            var store=new NativeWorldChannel();
            for(var i=0;i<170;i++)store.Put("e"+i,false,"系统","事件"+i,i);
            for(var i=0;i<130;i++)store.Put("m"+i,true,"阿壮","对话"+i,200+i);
            Assert.That(store.Items.Count,Is.EqualTo(150));
            Assert.That(store.Items.Count(m=>!m.Conversation),Is.EqualTo(50));
            Assert.That(store.Items.Count(m=>m.Conversation),Is.EqualTo(100));
            store.Put("m129",true,"阿壮","修正后的文本",329);
            Assert.That(store.Items.Count,Is.EqualTo(150));
            Assert.That(store.Items.Last().Text,Is.EqualTo("修正后的文本"));
        }
        [Test] public void SnapshotScopeClearsOldWorldAndOnlyCapturesPublishedLines()
        {
            var store=new NativeWorldChannel();
            var snapshot=JObject.Parse("{ 'dialogueScope':'a', 'state':{'npcs':[{'id':'azhuang','name':'阿壮'}], 'events':[]}, 'dialogues':[{'id':'one','npcId':'azhuang','text':'一起采食','at':2,'source':'minimind3','targetIds':['player']}] }");
            store.Capture(snapshot);store.Capture(snapshot);
            Assert.That(store.Items.Count,Is.EqualTo(1));
            Assert.That(store.Items[0].Speaker,Is.EqualTo("阿壮"));
            Assert.That(store.Items[0].Recipients,Is.EqualTo("领主"));
            Assert.That(store.Items[0].Source,Is.EqualTo("minimind3"));
            snapshot["dialogueScope"]="b";snapshot["dialogues"]=new JArray();store.Capture(snapshot);
            Assert.That(store.Items.Count,Is.Zero);
        }
        [Test] public void IncludesPlayerThreadLinesButNeverUnpublishedNpcTemplates()
        {
            var store=new NativeWorldChannel();
            var value=JObject.Parse("{'dialogueScope':'a','state':{'npcs':[{'id':'azhuang','name':'阿壮'}],'social':{'threads':[{'id':3,'lines':[{'id':5,'speaker':'player','text':'先补足食物','at':1},{'id':6,'speaker':'azhuang','text':'尚未生成的模板','at':2,'source':'template'}]}]}}}");
            store.Capture(value);store.Capture(value);
            Assert.That(store.Items.Count,Is.EqualTo(1));Assert.That(store.Items[0].Text,Is.EqualTo("先补足食物"));
        }
    }
}
