using System;
namespace CampMind.Presentation
{
    public static class NativeCampClock
    {
        public static (long Day,int Minutes,string Period) Read(double elapsed)
        {
            var safe=double.IsFinite(elapsed)?Math.Max(0,elapsed):0;var cycle=safe%600;
            var minute=(int)Math.Floor((cycle>=420?1080+(cycle-420)/180*720:360+cycle/420*720)%1440);
            return (1+(long)Math.Floor(safe/600),minute,cycle>=420?"晚上":minute<600?"早上":minute<840?"中午":"下午");
        }
    }
}
