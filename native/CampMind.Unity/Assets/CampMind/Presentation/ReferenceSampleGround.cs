using UnityEngine;

namespace CampMind.Presentation
{
    // Authored art-sample geography only. Does not modify authoritative world data.
    public static class ReferenceSampleGround
    {
        public const float WaterLevel=0, RiverHalfWidth=9;
        public static float RiverX(float z)=>-76+14*Mathf.Sin((z+15)/55);
        public static bool IsRiver(float x,float z)=>Mathf.Abs(x-RiverX(z))<16;
        public static float Height(float x,float z)
        {
            var shore=Mathf.Abs(x-RiverX(z));
            var t=Mathf.Clamp01((shore-7)/17);
            var h=Mathf.Lerp(-3,3,t*t*(3-2*t));
            var outside=Mathf.Max(0,Mathf.Max(Mathf.Abs(x)-100,z-95));
            return h+outside*.16f;
        }
        public static readonly Vector2[] WalkRoute={new Vector2(12,-52),new Vector2(12,-32),new Vector2(0,-24),new Vector2(-35,-24),new Vector2(0,-24),new Vector2(12,-32),new Vector2(12,-52),new Vector2(-35,-52),new Vector2(-35,-60),new Vector2(-58,-60)};
    }
}
