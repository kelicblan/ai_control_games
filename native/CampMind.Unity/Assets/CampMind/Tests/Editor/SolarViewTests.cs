using CampMind.Presentation;
using NUnit.Framework;
namespace CampMind.Tests
{
    public class SolarViewTests
    {
        [TestCase(0,1)][TestCase(210,1)][TestCase(400,1)][TestCase(410,.525)][TestCase(420,.05)][TestCase(580,.05)][TestCase(590,.525)][TestCase(600,1)]
        public void SourceTwilightIsPreserved(double elapsed,double expected)=>Assert.That(NativeSolarView.Daylight(elapsed),Is.EqualTo(expected).Within(.00001));
    }
}
