using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
namespace CampMind.Presentation
{
    public sealed class NativeQualityView:MonoBehaviour
    {
        public struct Settings
        {
            public float renderScale,lodBias,shadowDistance;
            public int shadowResolution;
        }
        public int Current {get;private set;}=1;
        public static Settings Profile(int level)
        {
            if(level<0||level>2)throw new ArgumentOutOfRangeException(nameof(level));
            return new Settings{renderScale=1,lodBias=level==0?.75f:level==1?1:1.3f,shadowDistance=level==0?300:level==1?450:600,shadowResolution=level==0?1024:level==1?2048:4096};
        }
        void Start(){Apply(PlayerPrefs.GetInt("camp.native.quality",1),false);}
        public void Apply(int level,bool persist=true)
        {
            var settings=Profile(level);var pipeline=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if(pipeline==null)throw new InvalidOperationException("Native quality requires URP");
            pipeline.renderScale=settings.renderScale;pipeline.shadowDistance=settings.shadowDistance;pipeline.mainLightShadowmapResolution=settings.shadowResolution;QualitySettings.lodBias=settings.lodBias;Current=level;
            if(persist){PlayerPrefs.SetInt("camp.native.quality",level);PlayerPrefs.Save();}
        }
    }
}
