using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace CampMind.PixelWorld
{
    /// <summary>只由显式验证参数开启；相机勘察不改玩家坐标或库存。</summary>
    public sealed class PixelMapVisualProbe:MonoBehaviour
    {
        [Serializable] sealed class Result { public bool ready,finished;public int captures,loadedChunks;public float steadyAverageFrameMs;public string error; }
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"-pixel-capture-dir");
            if(i<0||i+1>=args.Length)yield break;
            string directory=Path.GetFullPath(args[i+1]);Directory.CreateDirectory(directory);
            var result=new Result();var view=GetComponent<PixelWorldView>();float deadline=Time.realtimeSinceStartup+45;
            while((!view.MapReady||!view.OverviewReady)&&Time.realtimeSinceStartup<deadline)yield return null;
            result.ready=view.MapReady&&view.OverviewReady;
            if(!result.ready){result.error="地图连接超时";File.WriteAllText(Path.Combine(directory,"visual.json"),JsonUtility.ToJson(result,true));yield break;}
            var manifest=GetComponent<PixelWorldClient>().Manifest;var v=new Vector2(manifest.village.x,manifest.village.y);
            var centers=new[]{v+new Vector2(0,-10),v+new Vector2(0,-12),v+new Vector2(80,-115),v+new Vector2(180,-5),new Vector2(manifest.landmarks[1].x,manifest.landmarks[1].y),new Vector2(2000,3000),new Vector2(manifest.landmarks[8].x,manifest.landmarks[8].y)};
            var zooms=new[]{155f,85f,90f,100f,120f,145f,110f};var names=new[]{"01-village","02-common-space","03-creek-bridge","04-forest-edge","05-goldmine","06-mountains","07-wetland"};
            for(int n=0;n<centers.Length;n++){
                view.ShowRegionMap(false);view.Observe(centers[n],zooms[n]);yield return new WaitForSecondsRealtime(9);
                yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,names[n]+".png"));
                result.captures++;result.loadedChunks=view.LoadedChunks;yield return new WaitForSecondsRealtime(.5f);
            }
            foreach(float zoom in new[]{250f,500f,1200f,4000f}){view.Observe(v,zoom);yield return new WaitForSecondsRealtime(5);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,"zoom-"+zoom+".png"));result.captures++;}
            view.ShowWholeRegion();yield return new WaitForSecondsRealtime(6);view.ExportAtlas(Path.Combine(directory,"09-authoritative-atlas.png"));yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,"08-region-map.png"));result.captures++;
            yield return new WaitForSecondsRealtime(.5f);view.ShowRegionMap(false);
            view.Observe(v+new Vector2(0,-10),155);yield return new WaitForSecondsRealtime(4);
            int frames=0;float start=Time.realtimeSinceStartup;while(Time.realtimeSinceStartup-start<5){frames++;yield return null;}
            result.steadyAverageFrameMs=(Time.realtimeSinceStartup-start)*1000/Math.Max(1,frames);result.finished=true;
            File.WriteAllText(Path.Combine(directory,"visual.json"),JsonUtility.ToJson(result,true));
            view.AutomatedCapture=false;
        }
    }
}
