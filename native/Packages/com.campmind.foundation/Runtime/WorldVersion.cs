using System;

namespace CampMind.Foundation
{
    public sealed class WorldVersion
    {
        public const long MaxSafeInteger = 9007199254740991L;
        public string Generation { get; }
        public string Branch { get; }
        public long Revision { get; }
        public long Tick { get; }
        public WorldVersion(string generation, string branch, long revision, long tick)
        {
            Generation = RequireId(generation, nameof(generation));
            Branch = RequireId(branch, nameof(branch));
            Revision = RequireCounter(revision, nameof(revision));
            Tick = RequireCounter(tick, nameof(tick));
        }
        public bool MatchesScope(WorldVersion other) => other != null
            && string.Equals(Generation, other.Generation, StringComparison.Ordinal)
            && string.Equals(Branch, other.Branch, StringComparison.Ordinal);
        internal static string RequireId(string value, string name)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > 128) throw new ArgumentException("Expected a nonempty identity of at most 128 characters", name);
            return value;
        }
        internal static long RequireCounter(long value, string name)
        {
            if (value < 0 || value > MaxSafeInteger) throw new ArgumentOutOfRangeException(name);
            return value;
        }
    }
}
