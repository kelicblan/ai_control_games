using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using CampMind.Presentation;
namespace CampMind.PixelWorld
{
    public sealed class PixelTreeRuntimeProbe:MonoBehaviour
    {
        [Serializable] sealed class Result{public bool ready,rootStable;public string tree,shader,weather;public float snapshotWind,materialWind,timeA,timeB,kind,zoom,sway,rotationA,rotationB;public int crownChanged;}
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Install(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-pixel-tree-runtime-probe")>=0)new GameObject("Real map tree verification").AddComponent<PixelTreeRuntimeProbe>();}
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"-pixel-capture-dir");if(index<0)yield break;
            string folder=Path.GetFullPath(args[index+1]);Directory.CreateDirectory(folder);var result=new Result();
            var view=FindFirstObjectByType<PixelWorldView>();float deadline=Time.unscaledTime+50;
            while((!view.MapReady||view.GetComponent<NativeVillageUi>()?.Snapshot==null)&&Time.unscaledTime<deadline)yield return null;
            if(!view.MapReady){File.WriteAllText(Path.Combine(folder,"tree-runtime.json"),JsonUtility.ToJson(result,true));Application.Quit(1);yield break;}
            view.AutomatedCapture=true;var manifest=view.GetComponent<PixelWorldClient>().Manifest;
            view.Observe(new Vector2(manifest.village.x+180,manifest.village.y-5),85);yield return new WaitForSecondsRealtime(9);
            var camera=Camera.main;var block=new MaterialPropertyBlock();SpriteRenderer tree=null;
            foreach(var candidate in view.GetComponent<PixelChunkRenderer>().GetComponentsInChildren<SpriteRenderer>()){
                candidate.GetPropertyBlock(block);if(block.GetFloat("_MotionKind")!=1&&candidate.GetComponent<PixelTreeSway>()==null)continue;
                var point=camera.WorldToViewportPoint(candidate.bounds.center);if(point.x>.3f&&point.x<.7f&&point.y>.3f&&point.y<.7f){tree=candidate;break;}
            }
            if(tree==null){File.WriteAllText(Path.Combine(folder,"tree-runtime.json"),JsonUtility.ToJson(result,true));Application.Quit(2);yield break;}
            var weather=view.GetComponent<NativeVillageUi>().Snapshot;tree.GetPropertyBlock(block);
            result.ready=true;result.tree=tree.name;result.shader=tree.sharedMaterial.shader.name;result.weather=(string)weather["weather"];result.snapshotWind=(float?)weather["atmosphere"]?["windStrength"]??0;
            result.materialWind=tree.sharedMaterial.GetVector("_Wind").z;result.kind=block.GetFloat("_MotionKind");result.zoom=camera.orthographicSize;result.sway=tree.sharedMaterial.GetFloat("_TreeSway");
            var target=new RenderTexture(1600,1100,24);target.Create();
            var lower=camera.WorldToViewportPoint(tree.bounds.min);var upper=camera.WorldToViewportPoint(tree.bounds.max);
            var rect=new RectInt(Mathf.Clamp((int)(lower.x*1600),0,1599),Mathf.Clamp((int)(lower.y*1100),0,1099),Mathf.Max(1,(int)((upper.x-lower.x)*1600)),Mathf.Max(1,(int)((upper.y-lower.y)*1100)));
            rect.width=Mathf.Min(rect.width,1600-rect.x);rect.height=Mathf.Min(rect.height,1100-rect.y);
            var canvases=FindObjectsByType<Canvas>(FindObjectsSortMode.None).Where(c=>c.enabled).ToArray();foreach(var canvas in canvases)canvas.enabled=false;
            var weatherLayer=camera.transform.Find("二维雨幕与雷暴");bool weatherActive=weatherLayer!=null&&weatherLayer.gameObject.activeSelf;if(weatherLayer!=null)weatherLayer.gameObject.SetActive(false);
            yield return null;yield return new WaitForEndOfFrame();result.timeA=tree.sharedMaterial.GetFloat("_MotionTime");result.rotationA=tree.transform.localEulerAngles.z;var root=tree.transform.position;var a=AutomaticCapture(folder,"tree-map-a",rect);
            yield return new WaitForSecondsRealtime(1.5f);yield return new WaitForEndOfFrame();result.timeB=tree.sharedMaterial.GetFloat("_MotionTime");result.rotationB=tree.transform.localEulerAngles.z;result.rootStable=tree.transform.position==root;var b=AutomaticCapture(folder,"tree-map-b",rect);
            foreach(var canvas in canvases)if(canvas!=null)canvas.enabled=true;if(weatherLayer!=null)weatherLayer.gameObject.SetActive(weatherActive);
            for(int y=rect.height/3;y<rect.height;y++)for(int x=0;x<rect.width;x++){int i=y*rect.width+x;if(Math.Abs(a[i].r-b[i].r)+Math.Abs(a[i].g-b[i].g)+Math.Abs(a[i].b-b[i].b)>10)result.crownChanged++;}
            File.WriteAllText(Path.Combine(folder,"tree-runtime.json"),JsonUtility.ToJson(result,true));target.Release();Destroy(target);Application.Quit(result.crownChanged>5&&result.rootStable&&Mathf.Abs(Mathf.DeltaAngle(result.rotationA,result.rotationB))>.1f?0:1);
        }
        static Color32[] AutomaticCapture(string folder,string name,RectInt crop)
        {
            var image=ScreenCapture.CaptureScreenshotAsTexture();File.WriteAllBytes(Path.Combine(folder,name+".png"),image.EncodeToPNG());
            var pixels=image.GetPixels32();var result=new Color32[crop.width*crop.height];for(int y=0;y<crop.height;y++)Array.Copy(pixels,(crop.y+y)*image.width+crop.x,result,y*crop.width,crop.width);Destroy(image);return result;
        }
        static Color32[] Capture(Camera camera,RenderTexture target,string folder,string name,RectInt crop)
        {
            var weather=camera.transform.Find("二维雨幕与雷暴");bool active=weather!=null&&weather.gameObject.activeSelf;if(weather!=null)weather.gameObject.SetActive(false);
            var previous=camera.targetTexture;camera.targetTexture=target;RenderPipeline.SubmitRenderRequest(camera,new RenderPipeline.StandardRequest{destination=target});camera.targetTexture=previous;if(weather!=null)weather.gameObject.SetActive(active);
            var old=RenderTexture.active;RenderTexture.active=target;var full=new Texture2D(1600,1100,TextureFormat.RGBA32,false);full.ReadPixels(new Rect(0,0,1600,1100),0,0);full.Apply();RenderTexture.active=old;
            File.WriteAllBytes(Path.Combine(folder,name+".png"),full.EncodeToPNG());var pixels=full.GetPixels32();var result=new Color32[crop.width*crop.height];
            for(int y=0;y<crop.height;y++)Array.Copy(pixels,(crop.y+y)*1600+crop.x,result,y*crop.width,crop.width);Destroy(full);return result;
        }
    }
}
