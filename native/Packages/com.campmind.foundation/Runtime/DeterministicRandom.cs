namespace CampMind.Foundation
{
    /// <summary>Xorshift32 from CampMind's authoritative worldRandom; not cryptographic.</summary>
    public sealed class DeterministicRandom
    {
        public uint State { get; private set; }
        public DeterministicRandom(uint state) { State = state == 0 ? 0x6d2b79f5u : state; }
        public uint NextUInt32()
        {
            var value = State;
            value ^= value << 13;
            value ^= value >> 17;
            value ^= value << 5;
            State = value;
            return value;
        }
        public double NextUnit() => NextUInt32() / 4294967296d;
    }
}
