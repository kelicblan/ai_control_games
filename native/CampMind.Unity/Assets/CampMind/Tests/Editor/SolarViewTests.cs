using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class SolarViewTests
    {
        [TestCase(0,1)][TestCase(210,1)][TestCase(400,1)][TestCase(410,.525)][TestCase(420,.05)][TestCase(580,.05)][TestCase(590,.525)][TestCase(600,1)]
        public void SourceTwilightIsPreserved(double elapsed,double expected)=>Assert.That(NativeSolarView.Daylight(elapsed),Is.EqualTo(expected).Within(.00001));
        [TestCase(0,-100,45)][TestCase(210,0,125)][TestCase(420,100,45)][TestCase(600,-100,45)]
        public void SolarDirectionUsesTheSourceOffsetRatherThanClockAngle(double elapsed,float x,float y)=>Assert.That(Vector3.Distance(NativeSolarView.SunOffset(elapsed),new Vector3(x,y,65)),Is.LessThan(.0001));
        [TestCase(.25,0)][TestCase(.75,420)][TestCase(.05,528)]
        public void PreviewPhaseUsesTheSameClockProfile(double phase,double elapsed)=>Assert.That(NativeSolarView.ElapsedAtPhase(phase),Is.EqualTo(elapsed).Within(.00001));
    }
}
