using System;
using UnityEngine;
namespace CampMind.Presentation
{
    // Explicit cost diagnostics only. These runs cannot satisfy fidelity/FPS gates.
    public static class NativeRenderIsolation
    {
        public static bool Apply(NativeCampView view,string mode)
        {
            switch(mode){
                case "none":return false;
                case "shadows":view.sun.shadows=LightShadows.None;return true;
                case "rain":view.rain.GetComponent<ParticleSystemRenderer>().enabled=false;return true;
                case "forest":
                    foreach(var renderer in view.transform.Find("Forest").GetComponentsInChildren<Renderer>())renderer.enabled=false;
                    return true;
                default:throw new ArgumentException("Unknown render cost isolation: "+mode);
            }
        }
    }
}
