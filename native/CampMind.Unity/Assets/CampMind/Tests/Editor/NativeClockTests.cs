using CampMind.Presentation;
using NUnit.Framework;
namespace CampMind.Tests
{
    public class NativeClockTests
    {
        [TestCase(0,1,360,"早上")][TestCase(70,1,480,"早上")][TestCase(140,1,600,"中午")]
        [TestCase(280,1,840,"下午")][TestCase(420,1,1080,"晚上")][TestCase(510,1,0,"晚上")][TestCase(600,2,360,"早上")]
        public void MatchesSourceDaylightAndNightRates(double elapsed,long day,int minutes,string period)
        {var actual=NativeCampClock.Read(elapsed);Assert.That(actual.Day,Is.EqualTo(day));Assert.That(actual.Minutes,Is.EqualTo(minutes));Assert.That(actual.Period,Is.EqualTo(period));}
    }
}
