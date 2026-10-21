using System.IO;
using NUnit.Framework;
using Newtonsoft.Json.Linq;
using UnityEditor.SceneManagement;
using UnityEngine;
using CampMind.Editor;

namespace CampMind.Tests
{
    public class ReferenceRegionTerrainTests
    {
        [Test] public void TracedCrestsSurviveOtherMassesAndCoreHasMatchingPhysicalGround()
        {
            var main=File.ReadAllBytes("Assets/CampMind/Scenes/Camp.unity");EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var go=new GameObject("Reference terrain test camera");var camera=go.AddComponent<Camera>();camera.fieldOfView=50;camera.aspect=2048f/1303;camera.transform.rotation=Quaternion.Euler(27.5f,0,0);camera.transform.position=-camera.transform.forward*650;
            var repo=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));var constraints=JObject.Parse(File.ReadAllText(Path.Combine(repo,"native/ArtSource/reference-initial-region/constraints.json")));
            var report=ReferenceRegionTerrainBuilder.Build(camera,constraints);
            foreach(var check in report["crestChecks"]){
                var tolerance=(string)check["id"]=="right-foreground"?22:2;
                Assert.That((float)check["maxTerrainCrestReprojectionErrorPixels"],Is.LessThan(tolerance),$"Another mass or river moved visible crest {(string)check["id"]}");
            }
            Physics.SyncTransforms();
            var plaza=ReferenceRegionCalibrationBuilder.Unproject(camera,new Vector2(1024,830));Assert.That(ReferenceRegionTerrainBuilder.Height(plaza.x,plaza.z),Is.EqualTo(0).Within(.001));
            Assert.That(Physics.Raycast(plaza+Vector3.up*4,Vector3.down,out var hit,8,1<<9),Is.True);Assert.That(hit.point.y,Is.EqualTo(0).Within(.01));
            var water=ReferenceRegionCalibrationBuilder.Unproject(camera,new Vector2(395,850),-18);Assert.That(ReferenceRegionTerrainBuilder.Height(water.x,water.z),Is.LessThan(-18));
            Assert.That(File.ReadAllBytes("Assets/CampMind/Scenes/Camp.unity"),Is.EqualTo(main),"Do not overwrite main game while testing reference terrain");
        }
    }
}
