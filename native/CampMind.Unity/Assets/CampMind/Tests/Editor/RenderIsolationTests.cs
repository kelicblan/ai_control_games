using System;
using System.Reflection;
using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
namespace CampMind.Tests
{
    public class RenderIsolationTests
    {
        [Test]
        public void DiagnosticExcludesOnlyNamedCostAndRejectsUnknownModes()
        {
            var type=Type.GetType("CampMind.Presentation.NativeRenderIsolation, CampMind.Presentation");
            Assert.That(type,Is.Not.Null);
            var root=new GameObject("render diagnostic");
            try{
                var view=root.AddComponent<NativeCampView>();view.sun=root.AddComponent<Light>();view.sun.shadows=LightShadows.Soft;
                var forest=new GameObject("Forest");forest.transform.SetParent(root.transform);var renderer=forest.AddComponent<MeshRenderer>();renderer.shadowCastingMode=ShadowCastingMode.On;
                var method=type.GetMethod("Apply");
                Assert.That((bool)method.Invoke(null,new object[]{view,"none"}),Is.False);
                Assert.That(renderer.enabled,Is.True);Assert.That(view.sun.shadows,Is.EqualTo(LightShadows.Soft));
                Assert.That((bool)method.Invoke(null,new object[]{view,"shadows"}),Is.True);
                Assert.That(view.sun.shadows,Is.EqualTo(LightShadows.None));Assert.That(renderer.enabled,Is.True);
                var error=Assert.Throws<TargetInvocationException>(()=>method.Invoke(null,new object[]{view,"unknown"}));
                Assert.That(error.InnerException,Is.TypeOf<ArgumentException>());
                Assert.That((bool)method.Invoke(null,new object[]{view,"forest"}),Is.True);Assert.That(renderer.enabled,Is.False);
            }finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
}
