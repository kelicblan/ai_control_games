using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class NativeActorLifecycleTests
    {
        [Test] public void FreshLivingWorldClearsPreviousCorpsePoseWithoutChangingHeading()
        {
            var actor=new GameObject("reused actor");try{
                actor.transform.localRotation=Quaternion.Euler(0,47,90);
                NativeCampView.NormalizeAliveRoot(actor.transform);
                Assert.That(Mathf.Abs(Mathf.DeltaAngle(actor.transform.localEulerAngles.z,0)),Is.LessThan(.001f));
                Assert.That(Mathf.Abs(Mathf.DeltaAngle(actor.transform.localEulerAngles.y,47)),Is.LessThan(.001f));
            }finally{Object.DestroyImmediate(actor);}
        }
    }
}
