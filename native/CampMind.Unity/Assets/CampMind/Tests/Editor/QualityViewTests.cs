using CampMind.Presentation;
using NUnit.Framework;
namespace CampMind.Tests
{
    public class QualityViewTests
    {
        [Test]
        public void PresetsKeepNativeResolutionAndRetainDistantGeometry()
        {
            var low=NativeQualityView.Profile(0);var medium=NativeQualityView.Profile(1);var high=NativeQualityView.Profile(2);
            Assert.That(low.renderScale,Is.EqualTo(1));Assert.That(medium.renderScale,Is.EqualTo(1));Assert.That(high.renderScale,Is.EqualTo(1));
            Assert.That(low.lodBias,Is.GreaterThan(0));Assert.That(high.shadowResolution,Is.GreaterThan(medium.shadowResolution));
            Assert.That(low.msaa,Is.EqualTo(2));Assert.That(medium.msaa,Is.EqualTo(4));Assert.That(high.msaa,Is.EqualTo(4));
            Assert.That(low.shadowDistance,Is.GreaterThanOrEqualTo(300),"Even low quality must cover the normal god camera focus");
            Assert.Throws<System.ArgumentOutOfRangeException>(()=>NativeQualityView.Profile(-1));
        }
    }
}
