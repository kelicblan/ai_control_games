using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Profiling;
namespace CampMind.Presentation
{
    // Full recorded TS state presentation; no live rules, bridge, AI or saves.
    public sealed class NativeFrameProbe:MonoBehaviour
    {
        public NativeCampView view;
        public IEnumerator Run(string directory,string scenario,float warmup,float duration)
        {
            if(Application.isBatchMode||SystemInfo.graphicsDeviceType==UnityEngine.Rendering.GraphicsDeviceType.Null)throw new InvalidOperationException("Frame probe requires a real rendered window");
            if(warmup<0||duration<1||duration>7200||!new[]{"god-clear","god-storm","lord-clear","lord-storm"}.Contains(scenario))throw new ArgumentException("Invalid frame probe scenario/duration");
            yield return null; // Allow every scene component's Start before pinning settings.
            Directory.CreateDirectory(directory);QualitySettings.vSyncCount=0;Application.targetFrameRate=60;
            GetComponent<NativeQualityView>().Apply(1,false);view.focus=view.Space.ToUnity(new Vector2(50,55),1.5f);view.zoom=.16f;view.yaw=-.18f;view.pitch=.60f;view.lordYaw=.46f;view.lordPitch=.28f;view.lordDistance=24;view.lordView=scenario.StartsWith("lord");view.storm=scenario.EndsWith("storm");
            var beforeCache=GC.GetTotalMemory(true);var content=GetComponent<NativeReplayContent>();var replay=content.Load(scenario.EndsWith("storm"));var cacheBytesEstimate=GC.GetTotalMemory(true)-beforeCache;
            var timeline=Time.realtimeSinceStartupAsDouble;var lastFrame=-1;var appliedFrames=0;var sourceTime=0.0;
            void ApplyReplay(){var elapsed=Time.realtimeSinceStartupAsDouble-timeline;var frame=(int)Math.Floor((elapsed%replay.Duration)*10);if(frame==lastFrame)return;if(frame<lastFrame)GetComponent<NativeWeatherView>().ResetReplay();lastFrame=frame;var state=replay.At(elapsed);sourceTime=state.Elapsed;view.PresentReplayFrame(state);appliedFrames++;}
            ApplyReplay();var until=Time.realtimeSinceStartupAsDouble+warmup;while(Time.realtimeSinceStartupAsDouble<until){ApplyReplay();FrameTimingManager.CaptureFrameTimings();yield return null;}
            var samples=new List<double>(90000);var timings=new FrameTiming[1];var timingSamples=0;var gpuSamples=0;var started=Time.realtimeSinceStartupAsDouble;var previous=started;var gc=GC.CollectionCount(0);var spikes=0;
            using(var csv=new StreamWriter(Path.Combine(directory,"frames.csv"),false,new System.Text.UTF8Encoding(false),65536)){
                csv.WriteLine("elapsed_s,frame_ms,cpu_frame_ms,main_thread_ms,render_thread_ms,gpu_ms,valid_timing,allocated_bytes,managed_bytes,gc0,source_s");
                while(Time.realtimeSinceStartupAsDouble-started<duration){ApplyReplay();FrameTimingManager.CaptureFrameTimings();yield return null;
                    var now=Time.realtimeSinceStartupAsDouble;var ms=(now-previous)*1000;previous=now;var valid=FrameTimingManager.GetLatestTimings(1,timings)>0;var t=timings[0];if(valid)timingSamples++;if(valid&&t.gpuFrameTime>0)gpuSamples++;
                    samples.Add(ms);if(ms>100)spikes++;csv.WriteLine(string.Format(CultureInfo.InvariantCulture,"{0:F6},{1:F4},{2:F4},{3:F4},{4:F4},{5:F4},{6},{7},{8},{9},{10:F1}",now-started,ms,valid?t.cpuFrameTime:0,valid?t.cpuMainThreadFrameTime:0,valid?t.cpuRenderThreadFrameTime:0,valid?t.gpuFrameTime:0,valid?1:0,Profiler.GetTotalAllocatedMemoryLong(),Profiler.GetMonoUsedSizeLong(),GC.CollectionCount(0)-gc,sourceTime));
                }
            }
            var measured=Time.realtimeSinceStartupAsDouble-started;ScreenCapture.CaptureScreenshot(Path.Combine(directory,"scene.png"));yield return new WaitForSecondsRealtime(.5f);samples.Sort();
            double Percentile(double p)=>samples[Math.Min(samples.Count-1,(int)Math.Ceiling(samples.Count*p)-1)];
            var ecology=GetComponentInChildren<NativeWildernessView>();
            var camera=view.viewCamera;var position=camera.transform.position;
            var result=new{
                version=1,success=samples.Count>0&&ecology.ResourceSnapshotCount==84&&ecology.AnimalSnapshotCount==43,kind="typescript-full-state-render-replay",scenario,
                warmupSeconds=warmup,measuredSeconds=measured,frames=samples.Count,averageFps=samples.Count/measured,p95Ms=Percentile(.95),p99Ms=Percentile(.99),spikesOver100ms=spikes,timingSamples,gpuSamples,
                width=Screen.width,height=Screen.height,quality="Medium",renderScale=1,vsync=QualitySettings.vSyncCount,frameRateLimit=Application.targetFrameRate,colorSpace=QualitySettings.activeColorSpace.ToString(),
                gpu=SystemInfo.graphicsDeviceName,cpu=SystemInfo.processorType,graphicsApi=SystemInfo.graphicsDeviceType.ToString(),unity=Application.unityVersion,
                orthographic=camera.orthographic,orthographicSize=camera.orthographicSize,fieldOfView=camera.fieldOfView,cameraPosition=new[]{position.x,position.y,position.z},logicalOrigin=new[]{view.logicalOrigin.x,view.logicalOrigin.y},
                replayPolicy="teacher-v3-zero-latency",sourceFrames=replay.Count,appliedFrames,cacheBytesEstimate,inputSha=scenario.EndsWith("storm")?content.stormSha:content.clearSha,resources=ecology.ResourceSnapshotCount,animals=ecology.AnimalSnapshotCount,
                instrumentation="Buffered per-frame CSV includes sampling/write overhead; delayed/zero GPU times may be unavailable. Memory includes full replay cache; estimate is not final game memory",authority="recorded-typescript-states-only"
            };
            File.WriteAllText(Path.Combine(directory,"result.json"),JsonConvert.SerializeObject(result,Formatting.Indented));Application.Quit();
        }
    }
}
