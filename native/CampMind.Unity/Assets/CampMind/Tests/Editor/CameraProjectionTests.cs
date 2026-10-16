using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class CameraProjectionTests
    {
        [Test] public void NormalizedWheelNotchesMatchSourceBrowserPixelsAndAccumulate()
        {
            var root=new GameObject("wheel units");try{
                var view=root.AddComponent<NativeCampView>();view.zoom=.16f;
                view.ApplyWheelInput(1,true);Assert.That(view.zoom,Is.EqualTo(.16f*Mathf.Exp(.13f)).Within(.000001f));
                for(var i=0;i<9;i++)view.ApplyWheelInput(1,true);
                Assert.That(view.zoom,Is.EqualTo(.16f*Mathf.Exp(1.3f)).Within(.00001f));
                view.zoom=.16f;view.ApplyWheelInput(120,false);Assert.That(view.zoom,Is.EqualTo(.16f*Mathf.Exp(.13f)).Within(.000001f));
                view.PointerBlocked=true;var before=view.zoom;view.ApplyWheelInput(20,true);Assert.That(view.zoom,Is.EqualTo(before));
            }finally{Object.DestroyImmediate(root);}
        }
        [Test] public void DragPanUsesTheOriginalOrthographicScreenScaleAndHandedness()
        {
            var root=new GameObject("pan reference");try{
                var view=root.AddComponent<NativeCampView>();view.viewCamera=root.AddComponent<Camera>();view.viewCamera.orthographicSize=190.9722222f;view.focus=Vector3.zero;
                view.ApplyPanInput(new Vector2(30,20),1080);
                Assert.That(view.focus.x,Is.EqualTo(12.680684f).Within(.002));Assert.That(view.focus.z,Is.EqualTo(10.425f).Within(.01));
                var before=view.focus;view.PointerBlocked=true;view.ApplyPanInput(new Vector2(30,20),1080);Assert.That(view.focus,Is.EqualTo(before));
            }finally{Object.DestroyImmediate(root);}
        }
        [Test]
        public void MatchesActualThreeCameraReferenceAfterHandednessConversion()
        {
            var space=new WorldVisualSpace(new Vector2(50,50));var logical=new Vector2(-68,-5);Assert.That(Vector2.Distance(space.ToLogical(space.ToUnity(logical,7)),logical),Is.LessThan(.00001));
            var god=NativeCameraProfile.God(1920,1080,new Vector3(0,1.5f,5),-.18f,.60f,.16f);
            Assert.That(god.Orthographic,Is.True);Assert.That(god.Size,Is.EqualTo(190.9722222f).Within(.002));Assert.That(Vector3.Distance(god.Position,new Vector3(54.5444266f,209.9339991f,304.7448359f)),Is.LessThan(.002));
            var lord=NativeCameraProfile.Lord(space.ToUnity(new Vector2(50,110),0),.46f,.28f,24);
            Assert.That(lord.Orthographic,Is.False);Assert.That(lord.Fov,Is.EqualTo(58));Assert.That(Vector3.Distance(lord.Position,new Vector3(-12.0319148f,11.1325356f,79.7798508f)),Is.LessThan(.002));
            var root=new GameObject("camera projection");try{var camera=root.AddComponent<Camera>();camera.aspect=1920f/1080;god.Apply(camera);
                Assert.That(camera.WorldToViewportPoint(space.ToUnity(new Vector2(70,55),0)).x,Is.GreaterThan(.5),"Logical right must stay on the source screen's right");
            }finally{Object.DestroyImmediate(root);}
        }
    }
}
