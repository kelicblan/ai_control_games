using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeAudioTests
    {
        [Test] public void VocalSynthesisMatchesAllOriginalProfilesReactionsAndIntensities()
        {
            var fixtures=JObject.Parse(Resources.Load<TextAsset>("Audio/vocal-fixtures").text);
            foreach(var fixture in fixtures["fixtures"] as JArray)
            {
                var samples=NativeVocalSynth.Samples((string)fixture["kind"],(string)fixture["npc"],(double)fixture["intensity"],(JObject)fixtures["profiles"]);
                Assert.That(samples.Length,Is.EqualTo((int)fixture["length"]));
                for(var i=0;i<((JArray)fixture["indices"]).Count;i++)Assert.That(samples[(int)fixture["indices"][i]],Is.EqualTo((float)fixture["values"][i]).Within(.00001f),fixture.ToString());
            }
        }
    }
}
