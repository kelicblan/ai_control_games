using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeSettingsTests
    {
        [Test] public void UsesFullSourceRosterAndRejectsOutOfRangeOrPartialSettings()
        {
            var config=new NativeNpcSettings();var settings=config.Defaults;
            Assert.That(((JObject)settings["characters"]).Count,Is.EqualTo(9));
            Assert.That(config.Fields.Count,Is.EqualTo(20));
            Assert.DoesNotThrow(()=>config.Validate(settings));
            var invalid=(JObject)settings.DeepClone();invalid["characters"]["azhuang"]["trait.diligence"]=1.1;
            Assert.Throws<ArgumentException>(()=>config.Validate(invalid));
            invalid=(JObject)settings.DeepClone();((JObject)invalid["characters"]).Remove("azhuang");
            Assert.Throws<ArgumentException>(()=>config.Validate(invalid));
        }
    }
}
