using System;
using System.IO;
using System.Linq;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
namespace CampMind.Tests
{
    public class RenderReplayTests
    {
        [Test]
        public void LoadsTheActualSourceCaptureOnceAndRejectsCorruptedInputs()
        {
            var root=new GameObject("replay input");try{
                var content=root.AddComponent<NativeReplayContent>();var manifest=JObject.Parse(File.ReadAllText("Assets/CampMind/Content/Replay/manifest.json"));
                content.clearReplay=AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/CampMind/Content/Replay/clear.bytes");content.clearSha=(string)manifest["files"].First(f=>(string)f["file"]=="clear.bytes")["sha256"];
                var before=GC.GetTotalMemory(true);var replay=content.Load(false);var retained=GC.GetTotalMemory(true)-before;
                Assert.That(retained,Is.LessThan(256L*1024*1024),"Replay must not retain hundreds of full cognition/persistence graphs");
                Assert.That(replay.Duration,Is.EqualTo(90));Assert.That(replay.Count,Is.EqualTo(901));Assert.That(replay.At(.15).Elapsed,Is.EqualTo(.1).Within(.000001));
                Assert.That(ReferenceEquals(replay.At(.15),replay.At(90.15)),Is.True,"Playback must reuse cached source states rather than cloning every100ms");
                Assert.That(replay.At(5).Actors.Count,Is.EqualTo(9));Assert.That(replay.At(5).Resources.Count,Is.EqualTo(84));
                Assert.Throws<ArgumentOutOfRangeException>(()=>replay.At(double.NaN));content.clearSha=new string('0',64);Assert.Throws<InvalidDataException>(()=>content.Load(false));
            }finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
}
