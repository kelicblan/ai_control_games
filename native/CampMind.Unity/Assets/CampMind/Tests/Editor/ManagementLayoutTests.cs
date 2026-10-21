using System.Linq;
using System.Reflection;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;

namespace CampMind.Tests
{
    public class ManagementLayoutTests
    {
        static readonly BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
        [Test] public void ClosingAMenuRequestsResumeEvenWhenItsPauseAcknowledgementHasNotArrived()
        {
            var go=new GameObject("Explicit menu resume");
            try {var bridge=go.AddComponent<TsWorldBridge>();var view=go.AddComponent<NativeCampView>();typeof(NativeCampView).GetField("bridge",Private).SetValue(view,bridge);var village=go.AddComponent<NativeVillageUi>();typeof(NativeVillageUi).GetField("view",Private).SetValue(village,view);typeof(NativeVillageUi).GetField("<Snapshot>k__BackingField",Private).SetValue(village,JObject.Parse("{worldId:'resume-world',revision:1,paused:false}"));typeof(NativeVillageUi).GetField("pending",Private).SetValue(village,true);var ui=go.AddComponent<NativeGameUi>();typeof(NativeGameUi).GetField("view",Private).SetValue(ui,view);typeof(NativeGameUi).GetField("villageHud",Private).SetValue(ui,true);typeof(NativeGameUi).GetMethod("Action",Private).Invoke(ui,new object[]{JObject.Parse("{type:'pause',paused:false}")});var queued=(JObject)typeof(NativeVillageUi).GetField("queued",Private).GetValue(village);Assert.That((bool)queued["paused"],Is.False,"Resume must be an explicit false, not another toggle against an older snapshot");}
            finally {Object.DestroyImmediate(go);}
        }
        [Test] public void VillageMenusDoNotSendMotionToTheLegacyWorld()
        {
            var go=new GameObject("Village authority boundary");
            try {var bridge=go.AddComponent<TsWorldBridge>();typeof(TsWorldBridge).GetField("<Connected>k__BackingField",Private).SetValue(bridge,true);var motion=typeof(TsWorldBridge).GetField("pendingMotion",Private);bridge.SendMotion(Vector2.up);Assert.That(motion.GetValue(bridge),Is.Not.Null);var village=go.AddComponent<NativeVillageUi>();typeof(NativeVillageUi).GetField("<VillageActive>k__BackingField",Private).SetValue(village,true);bridge.ReleaseMotion();Assert.That(motion.GetValue(bridge),Is.Null,"Opening a Village menu must not enqueue legacy zero-motion");bridge.SendMotion(Vector2.up);Assert.That(motion.GetValue(bridge),Is.Null);}
            finally {Object.DestroyImmediate(go);}
        }
        [Test] public void ReplyIconStaysInsideTheLastMessageLine()
        {
            var go=new GameObject("Inline channel reply");NativeGameUi ui=null;
            try {ui=go.AddComponent<NativeGameUi>();ui.Initialize(go.AddComponent<NativeCampView>());Canvas.ForceUpdateCanvases();var value="[对话]阿壮：@领主 提议一起走到旁边的会合点；我跟随你，双方各自确认。";var height=(float)typeof(NativeGameUi).GetMethod("ChannelMessage",Private).Invoke(ui,new object[]{value,"azhuang",0f,Color.white});var paragraph=ui.Canvas.GetComponentsInChildren<Text>().First(t=>t.text==value);var reply=ui.Canvas.GetComponentsInChildren<Button>().First(b=>b.name=="回复 azhuang");Assert.That(reply.GetComponentInChildren<RawImage>().texture,Is.EqualTo(Resources.Load<Texture2D>("Hud/Reply")));Assert.That(reply.GetComponentInChildren<Text>().text,Is.Empty);Assert.That(((RectTransform)reply.transform).offsetMax.y,Is.GreaterThan(-paragraph.preferredHeight));Assert.That(height,Is.LessThan(paragraph.preferredHeight+28));}
            finally {if(ui?.Canvas!=null)Object.DestroyImmediate(ui.Canvas.gameObject);Object.DestroyImmediate(go);}
        }
        [Test] public void LegacyPollingCannotEraseVillageWeather()
        {
            var go=new GameObject("Village weather ownership");
            try {var view=go.AddComponent<NativeCampView>();view.ExternalInputDriver=true;view.PresentVillageEnvironment(JObject.Parse("{weather:'storm',elapsed:12,status:'paused',atmosphere:{rainIntensity:0.8}}"),new JObject());typeof(NativeCampView).GetMethod("PublishWorld",Private).Invoke(view,new object[]{JObject.Parse("{state:null}")});Assert.That((string)view.World?["weather"],Is.EqualTo("storm"));Assert.That(view.VisualTime,Is.EqualTo(12));}
            finally {Object.DestroyImmediate(go);}
        }
        [Test] public void TransparentSurfaceKeepsTheCenterUnpainted()
        {
            var go=new GameObject("Outline",typeof(RectTransform));var mesh=new Mesh();
            try {
                ((RectTransform)go.transform).sizeDelta=new Vector2(180,48);var surface=go.AddComponent<NativeUiSurface>();surface.Shadow=false;surface.Set(Color.clear,Color.clear,Color.yellow,5);
                using(var vertices=new VertexHelper()){typeof(NativeUiSurface).GetMethod("OnPopulateMesh",Private,null,new[]{typeof(VertexHelper)},null).Invoke(surface,new object[]{vertices});vertices.FillMesh(mesh);}
                var points=mesh.vertices;var indices=mesh.triangles;
                for(var i=0;i<indices.Length;i+=3){var a=(Vector2)points[indices[i]];var b=(Vector2)points[indices[i+1]];var c=(Vector2)points[indices[i+2]];
                    float Cross(Vector2 p,Vector2 q)=>p.x*q.y-p.y*q.x;
                    var x=Cross(b-a,-a);var y=Cross(c-b,-b);var z=Cross(a-c,-c);
                    Assert.That((x>=0&&y>=0&&z>=0)||(x<=0&&y<=0&&z<=0),Is.False,"A border-only surface must not rasterize its center");
                }
            } finally {Object.DestroyImmediate(mesh);Object.DestroyImmediate(go);}
        }
        [Test] public void ClockUsesOneRowAndVillageDockStaysAtTheBottom()
        {
            var go=new GameObject("HUD geometry");NativeGameUi ui=null;
            try {
                ui=go.AddComponent<NativeGameUi>();ui.Initialize(go.AddComponent<NativeCampView>());ui.SetVillageHud(true);Canvas.ForceUpdateCanvases();
                var all=ui.Canvas.GetComponentsInChildren<RectTransform>(true);
                var clock=all.First(r=>r.name=="生存天数与时钟");var labels=clock.GetComponentsInChildren<Text>();
                Assert.That(labels.Length,Is.EqualTo(3));
                Assert.That(labels.Select(t=>((RectTransform)t.transform).anchoredPosition.y).Distinct().Count(),Is.EqualTo(1));
                foreach(var label in labels)Assert.That(label.preferredWidth,Is.LessThanOrEqualTo(((RectTransform)label.transform).rect.width));
                var dock=all.First(r=>r.name=="新增玩法入口");Assert.That(dock.anchorMin.y,Is.Zero);Assert.That(dock.offsetMin.y,Is.EqualTo(18));Assert.That(dock.rect.height,Is.EqualTo(60));
                var resources=all.First(r=>r.name=="物资");Assert.That(resources.rect.size,Is.EqualTo(new Vector2(732,46)));
                Assert.That(resources.GetComponentsInChildren<RawImage>(true).Count(i=>i.texture!=null&&i.texture.name=="ReferenceResources"),Is.EqualTo(6));
                Assert.That(all.Any(r=>r.name=="新增营地指标"),Is.False,"The approved reference has one resource row");
                Assert.That(all.First(r=>r.name=="视角切换").GetComponentsInChildren<Button>(true).Length,Is.EqualTo(1));
                Assert.That(ui.Canvas.GetComponentsInChildren<NativeEagleMap>(true).Length,Is.EqualTo(1));
                var weather=all.First(r=>r.name=="天气状态");Assert.That(weather.GetComponentInChildren<Button>(true),Is.Not.Null);Assert.That(weather.GetComponentInChildren<RawImage>(true).texture.name,Is.EqualTo("Sun"));
                foreach(var asset in new[]{"ReferenceResources","ReferenceWeapons","ReferenceSymbols","ReferenceCampStamp"})Assert.That(Resources.Load<Texture2D>("Hud/"+asset),Is.Not.Null,asset);
                foreach(var label in dock.GetComponentsInChildren<Text>(true))Assert.That(((RectTransform)label.transform).rect.width,Is.GreaterThan(0),"Dock labels must remain visible");
            } finally {if(ui?.Canvas!=null)Object.DestroyImmediate(ui.Canvas.gameObject);Object.DestroyImmediate(go);}
        }
        [Test] public void ManagementHasSeparateRecipeDetailsAndUnavailableMaterialsDisableSubmission()
        {
            var go=new GameObject("Management geometry");var root=new GameObject("Management root",typeof(RectTransform));
            try {
                var ui=go.AddComponent<NativeVillageUi>();var type=typeof(NativeVillageUi);
                type.GetField("root",Private).SetValue(ui,root.GetComponent<RectTransform>());
                type.GetField("font",Private).SetValue(ui,Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular"));
                type.GetMethod("BuildManagement",Private).Invoke(ui,null);
                var snapshot=JObject.Parse(@"{elapsed:0,paused:true,inventory:{wood:1},reservations:{},actors:{player:{attributes:{craft:1},body:{},position:{x:0,y:0}}},economy:{storePosition:{x:0,y:0}},uiCatalog:{craftEnabled:true,weapons:[{id:'WPN002',note:'基础近战',cost:{wood:3},duration:4}]},executions:{}}");
                type.GetField("<Snapshot>k__BackingField",Private).SetValue(ui,snapshot);
                type.GetField("tab",Private).SetValue(ui,"制作");type.GetMethod("BuildCraftPage",Private).Invoke(ui,null);
                Canvas.ForceUpdateCanvases();var panel=(RectTransform)type.GetField("panel",Private).GetValue(ui);
                Assert.That(panel.rect.width,Is.GreaterThan(panel.rect.height));
                Assert.That(panel.GetComponentsInChildren<ScrollRect>(true).Length,Is.EqualTo(2));
                var submit=(Button)type.GetField("craftButton",Private).GetValue(ui);Assert.That(submit.interactable,Is.False);
                Assert.That(((Text)type.GetField("craftAvailability",Private).GetValue(ui)).text,Does.Contain("木材缺 2"));
                snapshot["inventory"]["wood"]=3;type.GetMethod("RefreshManagementHeader",Private).Invoke(ui,null);Assert.That(submit.interactable,Is.True);
                type.GetField("pending",Private).SetValue(ui,true);type.GetMethod("RefreshManagementHeader",Private).Invoke(ui,null);
                Assert.That(submit.interactable,Is.True,"Background polling must not block a valid command");
                Assert.That(submit.GetComponentInParent<ScrollRect>(),Is.Null,"Primary action must remain outside scrolling content");
                Assert.That(((RectTransform)submit.transform).rect.width,Is.EqualTo(168));
                Assert.That(panel.GetComponentsInChildren<RawImage>(true).Any(i=>i.name=="关闭图标"&&i.texture!=null),Is.True);
                Assert.That(panel.GetComponentsInChildren<Text>(true).All(t=>t.fontSize>=14&&t.fontSize<=26),Is.True);
                var terms=JObject.Parse(@"{steps:[{actorId:'player',capability:'REST',parameters:{seconds:5}}],deadline:null}");
                var copy=(string)type.GetMethod("ReadableTerms",Private).Invoke(ui,new object[]{terms});
                Assert.That(copy,Does.Contain("领主").And.Contain("休息").And.Contain("5 秒"));
                Assert.That(copy,Does.Not.Contain("{").And.Not.Contain("actorId"));
                var observation=JObject.Parse(@"{kind:'entity.observed',facts:{entityId:'player'}}");
                Assert.That(type.GetMethod("SocialEventLabel",Private).Invoke(ui,new object[]{observation}),Is.Null,"Observation diagnostics must not become player-facing social progress");
            } finally {Object.DestroyImmediate(go);if(root!=null)Object.DestroyImmediate(root);}
        }
    }
}
