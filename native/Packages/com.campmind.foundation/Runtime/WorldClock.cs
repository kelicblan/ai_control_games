using System;

namespace CampMind.Foundation
{
    /// <summary>Fixed 100ms rule time. The host explicitly supplies elapsed time and a catch-up budget.</summary>
    public sealed class WorldClock
    {
        public const int StepMilliseconds = 100;
        public long Tick { get; private set; }
        public long PendingMilliseconds { get; private set; }
        public WorldClock(long tick = 0) { Tick = WorldVersion.RequireCounter(tick, nameof(tick)); }
        public int AdvanceBy(long elapsedMilliseconds, int maxSteps, bool paused = false)
        {
            if (maxSteps < 1) throw new ArgumentOutOfRangeException(nameof(maxSteps));
            if (paused || elapsedMilliseconds < 0) return 0;
            var pending = checked(PendingMilliseconds + elapsedMilliseconds);
            var steps = (int)Math.Min(pending / StepMilliseconds, maxSteps);
            var nextTick = WorldVersion.RequireCounter(checked(Tick + steps), nameof(Tick));
            Tick = nextTick;
            PendingMilliseconds = pending - (long)steps * StepMilliseconds;
            return steps;
        }
    }
}
