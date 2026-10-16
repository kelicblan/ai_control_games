using System;
using UnityEngine;
namespace CampMind.Presentation
{
    // Read-only adaptation of simulation/clock.ts for presentation.
    public static class NativeSolarView
    {
        static Color Hex(string value){ColorUtility.TryParseHtmlString(value,out var color);return color;}
        static readonly Color SunDay=Hex("#fff0d5"),SunNight=Hex("#b8ccdc"),SunCloud=Hex("#c8d3dd"),SkyDay=Hex("#bfd9e7"),SkyStorm=Hex("#647983"),FogDay=Hex("#c5d5d3"),FogStorm=Hex("#768a91"),AmbientSky=Hex("#e7f1ff"),AmbientGround=Hex("#948362"),FillColor=Hex("#c9def0");
        public static void Apply(double elapsed,float cloud,Light sun,Light fill,Camera camera,WorldVisualSpace space)
        {
            cloud=Mathf.Clamp01(cloud);var day=(float)Daylight(elapsed);var night=1-day;
            sun.transform.rotation=Quaternion.LookRotation(-space.Direction(SunOffset(elapsed)));sun.color=Color.Lerp(Color.Lerp(SunDay.linear,SunNight.linear,night*.64f),SunCloud.linear,cloud*.55f).gamma;
            // Preserve the source profile relative to its clear-day peak; Three
            // and URP light intensity values are not interchangeable units.
            const float scale=1.3f/4.95f;sun.intensity=(.55f+day*4.4f)*(1-cloud*.4f)*scale;
            if(fill!=null){fill.transform.rotation=Quaternion.LookRotation(-space.Direction(new Vector3(28,35,-48)));fill.color=FillColor;fill.intensity=(.65f+day*.4f)*scale;}
            var ambient=(1.65f+day*(1.15f+cloud*.35f))*.65f/2.8f;RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor=(AmbientSky.linear*ambient).gamma;RenderSettings.ambientGroundColor=(AmbientGround.linear*ambient).gamma;RenderSettings.ambientEquatorColor=((AmbientSky.linear+AmbientGround.linear)*(.5f*ambient)).gamma;
            camera.backgroundColor=(Color.Lerp(SkyDay.linear,SkyStorm.linear,cloud*.65f)*(1-night*.6f)).gamma;
            RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogStartDistance=430;RenderSettings.fogEndDistance=1500;RenderSettings.fogColor=(Color.Lerp(FogDay.linear,FogStorm.linear,cloud*.65f)*(1-night*.45f)).gamma;
        }
        public static Vector3 SunOffset(double elapsed)
        {
            var safe=double.IsNaN(elapsed)||double.IsInfinity(elapsed)?0:Math.Max(0,elapsed);var progress=Math.Min(1,(safe%600)/420);
            return new Vector3((float)(-100*Math.Cos(progress*Math.PI)),(float)(45+80*Math.Sin(progress*Math.PI)),65);
        }
        public static double ElapsedAtPhase(double phase)
        {
            if(double.IsNaN(phase)||double.IsInfinity(phase))return 0;phase=((phase%1)+1)%1;
            return phase>=.25&&phase<=.75?(phase-.25)*840:420+(phase<.25?phase+.25:phase-.75)*360;
        }
        public static double Daylight(double elapsed)
        {
            var cycle=(double.IsNaN(elapsed)||double.IsInfinity(elapsed)?0:Math.Max(0,elapsed))%600;
            var t=Math.Max(0,Math.Min(1,(cycle-(cycle>=420?580:400))/20));var smooth=t*t*(3-2*t);
            return cycle>=420?.05+.95*smooth:1-.95*smooth;
        }
    }
}
