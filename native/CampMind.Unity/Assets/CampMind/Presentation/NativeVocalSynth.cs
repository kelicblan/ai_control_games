using System;
using Newtonsoft.Json.Linq;
namespace CampMind.Presentation
{
    public static class NativeVocalSynth
    {
        sealed class Resonator { public double B,A1,A2,Y1,Y2; }
        public static float[] Samples(string kind,string npc,double intensity,JObject voices)
        {
            double duration,breath,pitchMultiplier;int pulses;double[] frequencies;
            switch(kind)
            {
                case "burn":duration=.95;frequencies=new[]{850d,1400,2700};breath=.09;pitchMultiplier=1.52;pulses=2;break;
                case "thorns":duration=.72;frequencies=new[]{340d,1850,2900};breath=.62;pitchMultiplier=1.16;pulses=1;break;
                case "impact":duration=.58;frequencies=new[]{620d,1000,2300};breath=.12;pitchMultiplier=.93;pulses=2;break;
                case "water":duration=1.05;frequencies=new[]{450d,1200,2450};breath=.35;pitchMultiplier=1.24;pulses=4;break;
                case "bump":duration=.32;frequencies=new[]{430d,1050,2250};breath=.1;pitchMultiplier=.82;pulses=1;break;
                default:throw new ArgumentException("Unknown reaction");
            }
            const int rate=22050;var strength=double.IsNaN(intensity)||double.IsInfinity(intensity)?.5:Math.Min(1,Math.Max(.1,intensity));
            var pitch=(double)voices[npc]["pitch"];var formant=(double)voices[npc]["formant"];var samples=new float[(int)Math.Ceiling(rate*duration)];
            var resonators=new Resonator[3];
            for(var band=0;band<3;band++){var omega=2*Math.PI*Math.Min(rate*.42,frequencies[band]*formant)/rate;var alpha=Math.Sin(omega)/(2*(band==0?4:7));resonators[band]=new Resonator{B=alpha/(1+alpha),A1=-2*Math.Cos(omega)/(1+alpha),A2=(1-alpha)/(1+alpha)};}
            double phase=0,x1=0,x2=0,peak=0;var noiseState=(uint)(kind.Length*131+npc.Length*977+pitch);var weights=new[]{1.4,.7,.28};
            for(var i=0;i<samples.Length;i++)
            {
                var time=(double)i/rate;var progress=(double)i/Math.Max(1,samples.Length-1);
                var contour=.74+.62*Math.Exp(-progress*3.4)+.07*Math.Sin(time*2*Math.PI*(kind=="water"?16:5.8));
                phase=(phase+pitch*pitchMultiplier*contour/rate)%1;
                unchecked{noiseState^=noiseState<<13;noiseState^=noiseState>>17;noiseState^=noiseState<<5;}
                var noise=noiseState/2147483648d-1;
                var glottal=Math.Sin(phase*Math.PI*2)+.43*Math.Sin(phase*Math.PI*4)+.23*Math.Sin(phase*Math.PI*6)+.17*(2*phase-1);
                var input=glottal*(1-breath)+noise*breath;var vocal=.09*glottal;
                for(var band=0;band<3;band++){var r=resonators[band];var result=r.B*(input-x2)-r.A1*r.Y1-r.A2*r.Y2;r.Y2=r.Y1;r.Y1=result;vocal+=result*weights[band];}
                x2=x1;x1=input;var onset=Math.Min(1,time/.018);var ending=Math.Pow(Math.Max(0,1-progress),.72);var syllable=.22+.78*Math.Pow(Math.Sin(Math.PI*progress*pulses),2);
                var value=Math.Tanh(vocal*2.3)*onset*ending*syllable;samples[i]=(float)value;peak=Math.Max(peak,Math.Abs(value));
            }
            var scale=(.42+strength*.4)/Math.Max(.001,peak);for(var i=0;i<samples.Length;i++)samples[i]=(float)(samples[i]*scale);return samples;
        }
    }
}
