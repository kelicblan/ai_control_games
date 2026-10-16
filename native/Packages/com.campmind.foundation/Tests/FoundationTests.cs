using System;
using NUnit.Framework;
using CampMind.Foundation;

namespace CampMind.Foundation.Tests
{
    public sealed class FoundationTests
    {
        [Test]
        public void RandomStateCanResumeWithoutRestartingTheSequence()
        {
            var random = new DeterministicRandom(17);
            var first = random.NextUInt32();
            Assert.That(first, Is.EqualTo(4596240u));
            var resumed = new DeterministicRandom(random.State);
            for (var i = 0; i < 100; i++) Assert.That(resumed.NextUInt32(), Is.EqualTo(random.NextUInt32()));
        }

        [Test]
        public void ZeroSeedUsesTheSameFallbackAsTheTypeScriptWorld()
        {
            var zero = new DeterministicRandom(0);
            var fallback = new DeterministicRandom(0x6d2b79f5u);
            Assert.That(zero.NextUInt32(), Is.EqualTo(fallback.NextUInt32()));
            for (var i = 0; i < 100; i++) Assert.That(zero.NextUnit(), Is.InRange(0d, 0.999999999999d));
        }

        [Test]
        public void ClockUsesBoundedHundredMillisecondStepsAndKeepsTheRemainder()
        {
            var clock = new WorldClock();
            Assert.That(clock.AdvanceBy(250, 1), Is.EqualTo(1));
            Assert.That(clock.Tick, Is.EqualTo(1));
            Assert.That(clock.PendingMilliseconds, Is.EqualTo(150));
            Assert.That(clock.AdvanceBy(0, 10), Is.EqualTo(1));
            Assert.That(clock.PendingMilliseconds, Is.EqualTo(50));
            Assert.That(clock.AdvanceBy(50, 10), Is.EqualTo(1));
            Assert.That(clock.Tick, Is.EqualTo(3));
        }

        [Test]
        public void PausedOrBackwardTimeDoesNotAdvanceOrCreateCatchup()
        {
            var clock = new WorldClock(12);
            Assert.That(clock.AdvanceBy(-1000, 5), Is.EqualTo(0));
            Assert.That(clock.AdvanceBy(5000, 5, true), Is.EqualTo(0));
            Assert.That(clock.Tick, Is.EqualTo(12));
            Assert.That(clock.PendingMilliseconds, Is.Zero);
            Assert.Throws<ArgumentOutOfRangeException>(() => clock.AdvanceBy(100, 0));
        }

        [Test]
        public void InvalidVersionsAndUnsafeJavascriptIntegersAreRejected()
        {
            Assert.Throws<ArgumentException>(() => new WorldVersion("", "branch", 0, 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => new WorldVersion("generation", "branch", -1, 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => new WorldVersion("generation", "branch", 0, 9007199254740992L));
            var version = new WorldVersion("generation", "branch", 3, 10);
            Assert.That(version.MatchesScope(new WorldVersion("generation", "branch", 99, 100)), Is.True);
            Assert.That(version.MatchesScope(new WorldVersion("new-generation", "branch", 3, 10)), Is.False);
        }

        [Test]
        public void CommandCarriesIdempotencyIdentityAndWorldScope()
        {
            var version = new WorldVersion("generation", "branch", 3, 10);
            var command = new CommandEnvelope<string>("command-1", "session-1", "local-player", version, "gate-toggle", "{}");
            Assert.That(command.ExpectedVersion.Revision, Is.EqualTo(3));
            Assert.That(command.CommandId, Is.EqualTo("command-1"));
            Assert.Throws<ArgumentException>(() => new CommandEnvelope<string>(" ", "session", "actor", version, "move", "{}"));
            Assert.Throws<ArgumentNullException>(() => new CommandEnvelope<string>("c", "s", "a", version, "move", null!));
        }
    }
}
