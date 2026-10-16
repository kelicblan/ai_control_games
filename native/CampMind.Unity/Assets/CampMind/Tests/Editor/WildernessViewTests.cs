using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class WildernessViewTests
    {
        [Test]
        public void DepletionHidesOnlyTheHarvestAndAnimalVisibilityUsesActualObservers()
        {
            var root=new GameObject("wilderness");var renderer=root.AddComponent<NativeWildernessView>();
            var patch=new GameObject("patch");patch.transform.SetParent(root.transform);var crop=new GameObject("crop");crop.transform.SetParent(patch.transform);
            renderer.resources=new[]{new ResourceVisual{id="berry",root=patch.transform,crop=crop.transform}};renderer.animals=new AnimalVisual[0];
            var state=JObject.Parse("{status:'paused',lord:{position:{x:0,y:0}},npcs:[],world:{ecology:{resources:[{id:'berry',kind:'berries',position:{x:0,y:0},remaining:0,capacity:4}],animals:[]}}}");var before=state.ToString();
            renderer.SetSnapshot(state);renderer.Present(0,0);Assert.That(patch.activeSelf,Is.True);Assert.That(crop.activeSelf,Is.False);Assert.That(state.ToString(),Is.EqualTo(before));
            state["world"]["ecology"]["resources"][0]["remaining"]=2;renderer.SetSnapshot(state);renderer.Present(0,0);Assert.That(crop.activeSelf,Is.True);Assert.That(crop.transform.localScale.x,Is.EqualTo(.7f).Within(.00001));
            Assert.That(NativeWildernessView.AnimalVisible(Vector2.zero,1,new Vector2(100,0),new[]{new Vector2(110,0)}),Is.False);
            Assert.That(NativeWildernessView.AnimalVisible(Vector2.zero,1,new Vector2(100,0),new[]{new Vector2(109,0)}),Is.True);
            Assert.That(NativeWildernessView.AnimalVisible(Vector2.zero,0,Vector2.zero,new[]{Vector2.zero}),Is.False);
            renderer.SetSnapshot(null);renderer.Present(0,0);Assert.That(patch.activeSelf,Is.False);Object.DestroyImmediate(root);
        }
    }
}
