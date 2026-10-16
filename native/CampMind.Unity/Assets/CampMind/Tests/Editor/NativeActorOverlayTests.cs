using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeActorOverlayTests
    {
        [Test] public void SelectedActorHasProjectedNameProgressAndPublishedSpeech()
        {
            var world=new GameObject("world");var screen=new GameObject("screen",typeof(RectTransform),typeof(Canvas));
            try{
                var view=world.AddComponent<NativeCampView>();view.viewCamera=world.AddComponent<Camera>();NativeCameraProfile.God(1920,1080,new Vector3(0,1.5f,5),-.18f,.6f,.16f).Apply(view.viewCamera);
                var actor=new GameObject("azhuang");actor.transform.SetParent(world.transform);actor.transform.position=new Vector3(0,0,5);view.characters=new[]{actor.transform};
                screen.GetComponent<Canvas>().renderMode=RenderMode.ScreenSpaceOverlay;
                var overlay=screen.AddComponent<NativeActorOverlay>();overlay.Initialize(view,Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular"),id=>new NativeWorldChannel.Message{NpcId=id,Text="已经确认的对白",Time=0,Source="minimind3"});
                overlay.Present(JObject.Parse("{'elapsed':1,'npcs':[{'id':'azhuang','name':'阿壮','alive':true,'action':'food','progress':0.5}]}"));overlay.Render(null);
                Assert.That(overlay.ActorVisible("azhuang"),Is.True);
                Assert.That(string.Join("|",System.Linq.Enumerable.Select(screen.GetComponentsInChildren<Text>(),t=>t.text)),Does.Contain("阿壮").And.Contain("已经确认的对白"));
            }finally{Object.DestroyImmediate(world);Object.DestroyImmediate(screen);}
        }
    }
}
