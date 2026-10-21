using System.Linq;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
namespace CampMind.Tests
{
    public class PlayableLoopPresentationTests
    {
        [Test] public void GrowthShowsAccumulationExactGainsAndMaximumLevel()
        {
            var g=JObject.Parse("{'level':2,'experience':14,'currentLevelXp':4,'requiredXp':10,'remainingXp':6,'maxLevel':false,'nextGains':{'hp':8,'attack':0,'defense':0.5}}");
            Assert.That(NativeVillageUi.GrowthProgress(g),Does.Contain("4 / 10").And.Contain("还差 6").And.Contain("累计 14"));
            Assert.That(NativeVillageUi.GrowthGains(g["nextGains"]),Does.Contain("生命 +8").And.Contain("攻击 +0").And.Contain("防御 +0.5"));
            g["maxLevel"]=true;Assert.That(NativeVillageUi.GrowthProgress(g),Does.Contain("满级"));
        }
        [Test] public void AuthorityNotificationsNameRecipientAndDoNotRepeatOnReconnect()
        {
            var world=JObject.Parse("{'worldId':'loop','actors':{'hunter':{'name':'小林'}},'events':[{'id':'loop:ev1','at':1,'kind':'actor.levelled_up','participants':['hunter'],'facts':{'fromLevel':1,'toLevel':2,'gains':{'hp':8,'attack':1,'defense':0.5}}},{'id':'loop:ev2','at':2,'kind':'item.handed_over','participants':['player','hunter'],'facts':{'recipeId':'WPN003','recipientId':'hunter'}}]}");
            var channel=new NativeWorldChannel();channel.CaptureVillage(world);channel.CaptureVillage(world);
            Assert.That(channel.Items.Count,Is.EqualTo(2));
            Assert.That(string.Join("|",channel.Items.Select(m=>m.Text)),Does.Contain("小林").And.Contain("2级").And.Contain("生命 +8").And.Contain("交给"));
        }
        [Test] public void LegacyCraftEventsWithoutRecipientsRemainReadable()
        {
            var channel=new NativeWorldChannel();
            Assert.DoesNotThrow(()=>channel.CaptureVillage(JObject.Parse("{'worldId':'old','actors':{},'events':[{'id':'old:ev1','at':1,'kind':'item.crafted','participants':['player'],'facts':{'recipeId':'WPN003'}}]}")));
            Assert.That(channel.Items.Count,Is.EqualTo(1));
        }
    }
}
