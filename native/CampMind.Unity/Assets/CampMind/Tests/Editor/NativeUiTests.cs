using NUnit.Framework;
using System.Linq;
using UnityEngine;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeUiTests
    {
        [Test] public void SourceHudUsesPortraitsAndSeparateClockTypography()
        {
            var go=new GameObject("Source HUD regression");NativeGameUi ui=null;
            try{
                ui=go.AddComponent<NativeGameUi>();ui.Initialize(go.AddComponent<NativeCampView>());
                var portraits=ui.Canvas.GetComponentsInChildren<NativeCrewPortrait>(true);
                Assert.That(portraits.Length,Is.EqualTo(9));
                foreach(var portrait in portraits){var rect=(RectTransform)portrait.transform;Assert.That(rect.rect.size,Is.EqualTo(new Vector2(52,64)));}
                var text=ui.Canvas.GetComponentsInChildren<UnityEngine.UI.Text>(true);
                Assert.That(text.Any(t=>t.fontSize==9&&t.name.Contains("第")),Is.True,"Day must have its own small label");
                Assert.That(Resources.Load<TextAsset>("HelpContent"),Is.Not.Null);
                Assert.That(Resources.Load<TextAsset>("DecisionSchema"),Is.Not.Null);
                Assert.That(Resources.Load<Shader>("Hud/ModalBlur"),Is.Not.Null);
            }finally{if(ui?.Canvas!=null)Object.DestroyImmediate(ui.Canvas.gameObject);Object.DestroyImmediate(go);}
        }
        [Test] public void OverlayCanvasIsIndependentOfTheMirroredThreeDimensionalWorld()
        {
            var go=new GameObject("Mirrored world");go.transform.localScale=new Vector3(-1,1,1);NativeGameUi ui=null;
            try{
                var view=go.AddComponent<NativeCampView>();ui=go.AddComponent<NativeGameUi>();ui.Initialize(view);
                var canvas=ui.Canvas;
                Assert.That(canvas.transform.parent,Is.Null,"Overlay UI must not inherit reflected world transforms");
                Assert.That(canvas.transform.lossyScale,Is.EqualTo(Vector3.one));
            }finally{if(ui?.Canvas!=null)Object.DestroyImmediate(ui.Canvas.gameObject);Object.DestroyImmediate(go);}
        }
        [Test] public void UiPointerAndTextFocusNeverMoveTheWorldCamera()
        {
            var go=new GameObject("Input gate test");try{
                var view=go.AddComponent<NativeCampView>();view.zoom=.5f;var yaw=view.yaw;
                view.PointerBlocked=true;view.ApplyPointerInput(new Vector2(30,20),120,true);
                Assert.That(view.zoom,Is.EqualTo(.5f));Assert.That(view.yaw,Is.EqualTo(yaw));
                view.PointerBlocked=false;view.InputBlocked=true;view.ApplyPointerInput(new Vector2(30,20),120,true);
                Assert.That(view.zoom,Is.EqualTo(.5f));Assert.That(view.yaw,Is.EqualTo(yaw));
                view.InputBlocked=false;view.ApplyPointerInput(new Vector2(30,20),120,true);
                Assert.That(view.zoom,Is.Not.EqualTo(.5f));Assert.That(view.yaw,Is.Not.EqualTo(yaw));
            }finally{Object.DestroyImmediate(go);}
        }
        [Test] public void BuildsChineseGameControlsAndChannelWithoutStartingWorld()
        {
            var go=new GameObject("UI test");NativeGameUi ui=null;
            try {
                var view=go.AddComponent<NativeCampView>();
                ui=go.AddComponent<NativeGameUi>();ui.Initialize(view);
                Assert.That(ui.Canvas,Is.Not.Null);
                var font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular");
                Assert.That(font,Is.Not.Null);
                Assert.That(font.HasCharacter('营')&&font.HasCharacter('粮'),Is.True);
                Assert.That(ui.Canvas.GetComponentsInChildren<UnityEngine.UI.Text>().All(t=>t.font==font||t.font==Resources.Load<Font>("Fonts/NotoSerifCJKsc-Regular")),Is.True,"Chinese UI must ship its own licensed font");
                foreach(var name in new[]{"菜单","世界频道","伙伴列表","派遣到地图","伐木","采食","暂停 / 继续"})
                    Assert.That(ui.HasControl(name),Is.True,name);
                Assert.That(view.Authority,Is.Null,"Building UI must not create or mutate a world");
                Assert.DoesNotThrow(()=>view.SelectNpc("xiaomi"));
                Assert.That(view.SelectedNpc,Is.EqualTo("xiaomi"));
            } finally { if(ui?.Canvas!=null)Object.DestroyImmediate(ui.Canvas.gameObject);Object.DestroyImmediate(go); }
        }
    }
}
