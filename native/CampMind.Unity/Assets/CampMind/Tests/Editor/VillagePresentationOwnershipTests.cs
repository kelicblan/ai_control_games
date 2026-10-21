using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using CampMind.Presentation;
namespace CampMind.Tests {
 public class VillagePresentationOwnershipTests {
  [Test] public void CurrentHudInitializesBeforeVillageStartsPolling() {
   var root=new GameObject("startup-hud-test");
   try {var view=root.AddComponent<NativeCampView>();var ui=root.AddComponent<NativeGameUi>();Assert.DoesNotThrow(()=>ui.Initialize(view));Assert.That(ui.Canvas,Is.Not.Null);}
   finally{Object.DestroyImmediate(root);}
  }
  [Test] public void ExternalVillageDriverOwnsActorTransformsAndAnimation() {
   var root=new GameObject("ownership-test");
   try {
    var view=root.AddComponent<NativeCampView>();var actor=new GameObject("azhuang");actor.transform.SetParent(root.transform);actor.AddComponent<Animator>().speed=.75f;view.characters=new[]{actor.transform};
    view.PresentReplayFrame(CampRenderFrame.FromState(new Newtonsoft.Json.Linq.JObject()));
    var targets=(System.Collections.Generic.Dictionary<string,Vector3>)typeof(NativeCampView).GetField("targets",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(view);
    targets["azhuang"]=new Vector3(20,0,20);actor.transform.position=new Vector3(4,0,4);view.ExternalInputDriver=true;
    typeof(NativeCampView).GetMethod("PresentWorld",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(view,null);
    Assert.That(actor.transform.position,Is.EqualTo(new Vector3(4,0,4)));Assert.That(actor.GetComponent<Animator>().speed,Is.EqualTo(.75f));
   } finally {Object.DestroyImmediate(root);}
  }
 }
}
