using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace CampMind.Tests
{
    public class RoofWeatherTests
    {
        [Test]
        public void RainIsOccludedOnlyBelowTheRoofAndInsideItsFootprint()
        {
            var roof=new RoofRegion(new Vector2(50,-45),new Vector2(29,21),56);
            Assert.That(roof.Occludes(new Vector3(50,20,-45)),Is.True);
            Assert.That(roof.Occludes(new Vector3(50,57,-45)),Is.False);
            Assert.That(roof.Occludes(new Vector3(80,20,-45)),Is.False);
            Assert.That(roof.Occludes(new Vector3(50,20,-23)),Is.False);
        }
    }
}
