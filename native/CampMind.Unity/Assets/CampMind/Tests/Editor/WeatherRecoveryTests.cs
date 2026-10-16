using System;
using System.Reflection;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class WeatherRecoveryTests
    {
        [Test]
        public void RestoringAnOldLightningTimestampDoesNotFlashAgain()
        {
            var root=new GameObject("weather recovery");try{
                var view=root.AddComponent<NativeCampView>();view.sun=root.AddComponent<Light>();view.sun.intensity=1;
                view.PresentReplayState(JObject.Parse("{status:'paused',elapsed:35,weather:'storm',npcs:[],atmosphere:{rainIntensity:1}}"));
                var weather=root.AddComponent<NativeWeatherView>();weather.view=view;weather.rain=root.AddComponent<ParticleSystem>();weather.foliage=Array.Empty<Transform>();
                weather.Conditions(0,0,26);typeof(NativeWeatherView).GetMethod("LateUpdate",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(weather,null);
                Assert.That(view.sun.intensity,Is.EqualTo(1).Within(.00001),"A saved event nine seconds old must not be treated as a fresh flash");
            }finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
}
