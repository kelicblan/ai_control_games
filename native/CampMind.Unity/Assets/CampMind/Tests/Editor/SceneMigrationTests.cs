using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using System.IO;
using System.Reflection;
using Newtonsoft.Json.Linq;
using CampMind.Presentation;

namespace CampMind.Tests
{
    public class SceneMigrationTests
    {
        [Test]
        public void AuthoredCampUsesRealSkinnedCharactersAndSharedTerrainInUrp()
        {
            var builder = Type.GetType("CampMind.Editor.CampSceneBuilder, CampMind.Editor");
            Assert.That(builder, Is.Not.Null, "Native scene builder has not been implemented");
            builder.GetMethod("BuildScene").Invoke(null, null);
            Assert.That(GraphicsSettings.defaultRenderPipeline, Is.Not.Null);
            Assert.That(PlayerSettings.colorSpace,Is.EqualTo(ColorSpace.Linear),"glTF/PBR baseline must use linear lighting");
            Assert.That(Physics.Raycast(new Vector3(0,500,5),Vector3.down,out var floorHit,1000,1<<9),Is.True,"Converted terrain must remain a top-facing physical ground surface");
            var characters = GameObject.Find("Characters");
            Assert.That(characters, Is.Not.Null);
            Assert.That(characters.transform.childCount, Is.EqualTo(10));
            foreach (Transform actor in characters.transform)
            {
                Assert.That(actor.GetComponentsInChildren<SkinnedMeshRenderer>().Length, Is.GreaterThan(0), actor.name);
                var animator = actor.GetComponentInChildren<Animator>();
                Assert.That(animator, Is.Not.Null, actor.name);
                Assert.That(animator.applyRootMotion, Is.False);
                var clips = animator.runtimeAnimatorController.animationClips;
                Assert.That(clips.Any(c=>c.name.Contains("Idle")), Is.True, actor.name);
                Assert.That(clips.Any(c=>c.name.Contains("Walk")), Is.True, actor.name);
                var walk=clips.First(c=>c.name=="Walk");
                var bindings=AnimationUtility.GetCurveBindings(walk);
                Assert.That(bindings.Count(b=>animator.transform.Find(b.path)!=null), Is.GreaterThan(bindings.Length/2), "Unbound animation paths: "+actor.name);
                animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
                animator.Rebind();animator.Play("Walk",0,0);animator.Update(.1f);
                var bones=actor.GetComponentInChildren<SkinnedMeshRenderer>().bones;
                var rotations=bones.Select(b=>b.localRotation).ToArray();animator.Update(.3f);
                Assert.That(bones.Where((b,i)=>Quaternion.Angle(b.localRotation,rotations[i])>.1f).Count(),Is.GreaterThan(2), "Walk must actually animate bones: "+actor.name);
            }
            Assert.That(GameObject.Find("Forest").transform.childCount, Is.GreaterThan(100));
            var tree=GameObject.Find("Forest").transform.GetChild(0).GetComponent<LODGroup>();
            Assert.That(tree,Is.Not.Null);var levels=tree.GetLODs();Assert.That(levels.Length,Is.EqualTo(2));
            var full=levels[0].renderers.Sum(r=>r.GetComponent<MeshFilter>().sharedMesh.triangles.Length);
            var distant=levels[1].renderers.Sum(r=>r.GetComponent<MeshFilter>().sharedMesh.triangles.Length);
            Assert.That(distant,Is.GreaterThan(0).And.LessThan(full),"Far LOD must reduce real triangles while retaining geometry");
            Assert.That(GameObject.Find("Hinged settlement gate").GetComponent<CampMind.Presentation.NativeGateView>(),Is.Not.Null);
            var wilderness=GameObject.Find("Wilderness").GetComponent<CampMind.Presentation.NativeWildernessView>();
            Assert.That(wilderness.animals.Length,Is.EqualTo(43));Assert.That(wilderness.resources.Length,Is.GreaterThan(50));
            Assert.That(wilderness.animals.All(a=>a.legs.Length>=2&&a.head!=null),Is.True);
            var terrain = GameObject.Find("AuthoredTerrain");
            Assert.That(terrain.GetComponentsInChildren<MeshFilter>().Sum(f=>f.sharedMesh.vertexCount), Is.GreaterThan(400000));
            Assert.That(GameObject.Find("Main Camera").GetComponent<Camera>(), Is.Not.Null);
            Assert.That(AssetDatabase.LoadAssetAtPath<SceneAsset>("Assets/CampMind/Scenes/Camp.unity"), Is.Not.Null);
            var fixture=JObject.Parse(File.ReadAllText(Path.GetFullPath("../../contracts/migration/fixtures/new-world.json")));var state=(JObject)fixture["initialState"];
            state["npcs"].First(n=>(string)n["id"]=="azhuang")["inventory"]["food"]=4;
            var view=GameObject.Find("CampMind Native Presentation").GetComponent<NativeCampView>();var carrier=characters.transform.Find("azhuang");
            view.PresentReplayState(state);var point=new Vector3(carrier.position.x,0,carrier.position.z);if(Physics.Raycast(point+Vector3.up*500,Vector3.down,out var ground,1000,1<<9))point.y=ground.point.y;carrier.position=point;
            var source=state.ToString();typeof(NativeCampView).GetMethod("PresentWorld",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(view,null);
            var carriedAnimator=carrier.GetComponentInChildren<Animator>();carriedAnimator.Update(.3f);
            Assert.That(carriedAnimator.GetCurrentAnimatorStateInfo(0).IsName("Carry"),Is.True,"Loaded character must actually use its carrying clip for source inventory");
            var carryType=Type.GetType("CampMind.Presentation.NativeCarryView, CampMind.Presentation");
            Assert.That(carryType,Is.Not.Null,"Source hand props must have a native presenter");
            var carry=carrier.GetComponent(carryType);
            Assert.That(carry,Is.Not.Null);
            carryType.GetMethod("RefreshPose").Invoke(carry,null);
            var basket=(Transform)carryType.GetField("basket").GetValue(carry);
            Assert.That(basket.gameObject.activeSelf,Is.True,"Source food inventory must show its original basket");
            var left=(Transform)carryType.GetField("leftHand").GetValue(carry);
            var right=(Transform)carryType.GetField("rightHand").GetValue(carry);
            Assert.That(Vector3.Distance(basket.position,(left.position+right.position)*.5f),Is.LessThan(.001f));
            Assert.That(state.ToString(),Is.EqualTo(source),"Rendering must not edit source state");
        }
    }
}
