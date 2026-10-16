using System;
namespace CampMind.Presentation
{
    // Read-only adaptation of simulation/clock.ts for presentation.
    public static class NativeSolarView
    {
        public static double Daylight(double elapsed)
        {
            var cycle=(double.IsNaN(elapsed)||double.IsInfinity(elapsed)?0:Math.Max(0,elapsed))%600;
            var t=Math.Max(0,Math.Min(1,(cycle-(cycle>=420?580:400))/20));var smooth=t*t*(3-2*t);
            return cycle>=420?.05+.95*smooth:1-.95*smooth;
        }
    }
}
