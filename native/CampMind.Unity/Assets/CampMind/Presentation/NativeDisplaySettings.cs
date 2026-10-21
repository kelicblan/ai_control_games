using System;
using UnityEngine;
namespace CampMind.Presentation
{
    public static class NativeDisplaySettings
    {
        public static bool UseNativeResolution(string[] args)=>Array.IndexOf(args,"-windowed")<0&&Array.IndexOf(args,"-screen-width")<0&&Array.IndexOf(args,"-screen-height")<0;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Initialize()
        {
            if(Application.isEditor||Application.isBatchMode||!UseNativeResolution(Environment.GetCommandLineArgs()))return;
            // Override the old 720p resolution saved by previous Player launches.
            var width=Display.main.systemWidth;var height=Display.main.systemHeight;
            if(width<=0||height<=0){width=Screen.currentResolution.width;height=Screen.currentResolution.height;}
            if(width>0&&height>0)Screen.SetResolution(width,height,FullScreenMode.FullScreenWindow);
        }
    }
}
