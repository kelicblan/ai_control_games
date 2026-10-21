using NUnit.Framework;
using UnityEngine;
using CampMind.Presentation;
using System.IO;
using System.Linq;
using UnityEditor;
using CampMind.Editor;

namespace CampMind.Tests
{
    public class ReferenceSampleTests
    {
        [Test] public void SettlementFootprintsAreDryAndLevel()
        {
            foreach(var p in new[]{new Vector2(0,12),new Vector2(-18,-8),new Vector2(20,-5),new Vector2(12,-40)}) {
                Assert.That(ReferenceSampleGround.IsRiver(p.x,p.y),Is.False);
                Assert.That(ReferenceSampleGround.Height(p.x,p.y),Is.EqualTo(3).Within(.05));
            }
        }
        [Test] public void RiverHasSubmergedBedAndDryWalkableEastBank()
        {
            for(var z=-90;z<=110;z+=5) {
                var x=ReferenceSampleGround.RiverX(z);
                Assert.That(ReferenceSampleGround.Height(x,z),Is.LessThan(ReferenceSampleGround.WaterLevel));
                Assert.That(ReferenceSampleGround.IsRiver(x,z),Is.True);
                Assert.That(ReferenceSampleGround.Height(x+ReferenceSampleGround.RiverHalfWidth+8,z),Is.GreaterThan(ReferenceSampleGround.WaterLevel));
            }
        }
        [Test] public void WalkingRouteStaysOutOfWaterAndHasBoundedSlope()
        {
            var route=ReferenceSampleGround.WalkRoute;
            Assert.That(route.Length,Is.GreaterThanOrEqualTo(5));
            for(var i=1;i<route.Length;i++)for(var j=0;j<=30;j++) {
                var p=Vector2.Lerp(route[i-1],route[i],j/30f);
                Assert.That(ReferenceSampleGround.IsRiver(p.x,p.y),Is.False,$"Route enters water at {p}");
                var dx=(ReferenceSampleGround.Height(p.x+.25f,p.y)-ReferenceSampleGround.Height(p.x-.25f,p.y))/.5f;
                var dz=(ReferenceSampleGround.Height(p.x,p.y+.25f)-ReferenceSampleGround.Height(p.x,p.y-.25f))/.5f;
                Assert.That(Mathf.Sqrt(dx*dx+dz*dz),Is.LessThan(.6f));
            }
        }
        [Test] public void SampleScenePreservesCampAndHasClearGateAndPhysicalWalkingRoute()
        {
            var camp=File.ReadAllBytes("Assets/CampMind/Scenes/Camp.unity");var buildScenes=EditorBuildSettings.scenes.Select(s=>s.path).ToArray();
            ReferenceSampleBuilder.BuildScene();
            Assert.That(File.ReadAllBytes("Assets/CampMind/Scenes/Camp.unity"),Is.EqualTo(camp),"Sample must not overwrite Camp");
            Assert.That(EditorBuildSettings.scenes.Select(s=>s.path).ToArray(),Is.EqualTo(buildScenes));
            var view=Object.FindFirstObjectByType<ReferenceSampleView>();Assert.That(view,Is.Not.Null);
            Assert.That(view.actor.GetComponentInChildren<SkinnedMeshRenderer>(),Is.Not.Null);
            Assert.That(view.actor.GetComponent<CharacterController>(),Is.Not.Null);
            Assert.That(view.subjects.Length,Is.EqualTo(4));
            view.SetGate(false);Physics.SyncTransforms();
            Assert.That(Physics.CheckSphere(new Vector3(12,4,-40),.4f,1<<8),Is.True);
            view.SetGate(true);Physics.SyncTransforms();
            Assert.That(Physics.CheckCapsule(new Vector3(12,3.5f,-40),new Vector3(12,4.5f,-40),.28f,1<<8),Is.False);
            var route=ReferenceSampleGround.WalkRoute;
            for(var i=1;i<route.Length;i++)for(var j=0;j<=40;j++) {
                var p=Vector2.Lerp(route[i-1],route[i],j/40f);var floor=new Vector3(p.x,3,p.y);
                Assert.That(Physics.CheckCapsule(floor+Vector3.up*.5f,floor+Vector3.up*1.4f,.28f,1<<8),Is.False,$"Blocked at {p}");
                Assert.That(Physics.Raycast(floor+Vector3.up*.3f,Vector3.down,1,1<<9),Is.True,$"Unsupported at {p}");
            }
        }
    }
}
