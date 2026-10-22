using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;

namespace CampMind.PixelWorld
{
    /// <summary>Explicit native GPU check; renders offscreen and never mutates world state.</summary>
    public sealed class PixelEnvironmentMotionProbe:MonoBehaviour
    {
        [Serializable] sealed class Result {
            public bool passed,shaderSupported,calmTreeStable,waterFlows,landStable,windMovesCrown,rootStable,rainMoves,stormDarkens,lightningBrightens,actualTreeMoves,actualTreeRootStable;
            public int actualTreeChanged,actualTreeRootChanged;
            public int waterChanged,landChanged,crownChanged,rootChanged;
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-pixel-environment-probe")>=0)new GameObject("Environment GPU verification").AddComponent<PixelEnvironmentMotionProbe>();}
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"-pixel-capture-dir");
            if(at<0||at+1>=args.Length)yield break;
            string folder=Path.GetFullPath(args[at+1]);Directory.CreateDirectory(folder);
            var result=new Result();var shader=Resources.Load<Shader>("PixelWorld/PixelWorldUnlit");
            result.shaderSupported=shader!=null&&shader.isSupported;
            if(!result.shaderSupported){File.WriteAllText(Path.Combine(folder,"environment-motion.json"),JsonUtility.ToJson(result,true));Application.Quit(1);yield break;}
            var material=new Material(shader);var texture=new Texture2D(96,96,TextureFormat.RGBA32,false){filterMode=FilterMode.Point};
            var fill=new Color32[96*96];for(int i=0;i<fill.Length;i++)fill[i]=new Color32(61,133,153,255);texture.SetPixels32(fill);texture.Apply();
            var mask=new Texture2D(2,1,TextureFormat.RGBA32,false){filterMode=FilterMode.Point};mask.SetPixels32(new[]{new Color32(255,0,0,255),new Color32(0,0,0,255)});mask.Apply();
            var sprite=Sprite.Create(texture,new Rect(0,0,96,96),new Vector2(.5f,0),16,0,SpriteMeshType.FullRect);
            var surface=new GameObject("Probe surface");surface.layer=30;surface.transform.position=new Vector3(100000,99997,0);
            var renderer=surface.AddComponent<SpriteRenderer>();renderer.sprite=sprite;renderer.sharedMaterial=material;
            var cameraObject=new GameObject("Probe camera");var camera=cameraObject.AddComponent<Camera>();camera.orthographic=true;camera.orthographicSize=4;
            camera.transform.position=new Vector3(100000,100000,-10);camera.cullingMask=1<<30;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;
            var target=new RenderTexture(256,256,24,RenderTextureFormat.ARGB32);target.Create();camera.targetTexture=target;camera.enabled=false;captureCamera=camera;
            var block=new MaterialPropertyBlock();block.SetFloat("_MotionKind",2);block.SetTexture("_WaterMask",mask);renderer.SetPropertyBlock(block);
            material.SetFloat("_MotionTime",0);yield return new WaitForEndOfFrame();var waterA=Capture(target,folder,"water-a");
            material.SetFloat("_MotionTime",1.25f);yield return new WaitForEndOfFrame();var waterB=Capture(target,folder,"water-b");
            for(int y=40;y<216;y++)for(int x=40;x<216;x++)if(Different(waterA[y*256+x],waterB[y*256+x])){if(x<124)result.waterChanged++;else if(x>132)result.landChanged++;}
            result.waterFlows=result.waterChanged>100;result.landStable=result.landChanged==0;
            block.Clear();renderer.SetPropertyBlock(block);PixelEnvironmentMotion.ConfigureTree(renderer,"oak");
            material.SetVector("_Wind",Vector4.zero);material.SetFloat("_MotionTime",0);yield return new WaitForEndOfFrame();var calmA=Capture(target,folder,"calm-a");
            material.SetFloat("_MotionTime",2);yield return new WaitForEndOfFrame();var calmB=Capture(target,folder,"calm-b");
            result.calmTreeStable=true;for(int i=0;i<calmA.Length;i++)if(Different(calmA[i],calmB[i]))result.calmTreeStable=false;
            material.SetVector("_Wind",new Vector4(1,0,1,0));material.SetFloat("_MotionTime",0);yield return new WaitForEndOfFrame();var treeA=Capture(target,folder,"tree-a");
            material.SetFloat("_MotionTime",2);yield return new WaitForEndOfFrame();var treeB=Capture(target,folder,"tree-b");
            for(int y=0;y<256;y++)for(int x=0;x<256;x++)if(Different(treeA[y*256+x],treeB[y*256+x])){if(y>=160)result.crownChanged++;if(y==32)result.rootChanged++;}
            result.windMovesCrown=result.crownChanged>20;result.rootStable=result.rootChanged==0;
            block.Clear();renderer.SetPropertyBlock(block);material.SetVector("_Wind",Vector4.zero);
            var weatherMaterial=new Material(Resources.Load<Shader>("PixelWorld/PixelWeather"));
            var weatherObject=new GameObject("Weather probe");weatherObject.layer=30;weatherObject.transform.position=surface.transform.position;
            var weatherRenderer=weatherObject.AddComponent<SpriteRenderer>();weatherRenderer.sprite=sprite;weatherRenderer.sharedMaterial=weatherMaterial;weatherRenderer.sortingOrder=100;
            weatherMaterial.SetFloat("_Aspect",1);var clear=Capture(target,folder,"weather-clear");
            weatherMaterial.SetFloat("_Rain",.85f);weatherMaterial.SetFloat("_Darkness",.25f);weatherMaterial.SetFloat("_WeatherTime",0);var rainA=Capture(target,folder,"weather-rain-a");
            weatherMaterial.SetFloat("_WeatherTime",.3f);var rainB=Capture(target,folder,"weather-rain-b");
            int rainChanges=0;for(int i=0;i<rainA.Length;i++)if(Different(rainA[i],rainB[i]))rainChanges++;
            result.rainMoves=rainChanges>100;
            weatherMaterial.SetFloat("_Darkness",.5f);var storm=Capture(target,folder,"weather-storm");
            weatherMaterial.SetFloat("_Flash",1);weatherMaterial.SetFloat("_Strike",3);var lightning=Capture(target,folder,"weather-lightning");
            long clearLight=0,stormLight=0,flashLight=0;for(int i=0;i<clear.Length;i++){clearLight+=clear[i].r+clear[i].g+clear[i].b;stormLight+=storm[i].r+storm[i].g+storm[i].b;flashLight+=lightning[i].r+lightning[i].g+lightning[i].b;}
            result.stormDarkens=stormLight<clearLight*.85;result.lightningBrightens=flashLight>stormLight*1.15;
            weatherObject.SetActive(false);
            using(var actualArt=new PixelArtLibrary()){
                renderer.sprite=actualArt.Get("oak");surface.transform.position=new Vector3(100000,100000,0);
                surface.transform.localScale=Vector3.one*(8*8/renderer.sprite.rect.width);PixelEnvironmentMotion.ConfigureTree(renderer,"oak");
                // Match 1100px / 310 world-unit desktop framing, using the reported wind vector.
                camera.orthographicSize=36;material.SetFloat("_TreeSway",Mathf.Min(3.5f,36*2/256f*12));
                const float strength=.633894f,angle=5.027933f;
                material.SetVector("_Wind",new Vector4(Mathf.Cos(angle)*strength,Mathf.Sin(angle)*strength,strength,0));
                material.SetFloat("_MotionTime",0);var actualA=Capture(target,folder,"actual-oak-a");
                material.SetFloat("_MotionTime",1.5f);var actualB=Capture(target,folder,"actual-oak-b");
                for(int y=0;y<256;y++)for(int x=0;x<256;x++)if(Different(actualA[y*256+x],actualB[y*256+x])){result.actualTreeChanged++;if(y<129)result.actualTreeRootChanged++;}
                result.actualTreeMoves=result.actualTreeChanged>10;result.actualTreeRootStable=result.actualTreeRootChanged==0;
            }
            result.passed=result.shaderSupported&&result.waterFlows&&result.landStable&&result.calmTreeStable&&result.windMovesCrown&&result.rootStable&&result.rainMoves&&result.stormDarkens&&result.lightningBrightens&&result.actualTreeMoves&&result.actualTreeRootStable;
            File.WriteAllText(Path.Combine(folder,"environment-motion.json"),JsonUtility.ToJson(result,true));
            camera.targetTexture=null;target.Release();Destroy(weatherObject);Destroy(weatherMaterial);Destroy(cameraObject);Destroy(surface);Destroy(sprite);Destroy(texture);Destroy(mask);Destroy(material);Destroy(target);
            Application.Quit(result.passed?0:1);
        }
        static bool Different(Color32 a,Color32 b)=>Math.Abs(a.r-b.r)+Math.Abs(a.g-b.g)+Math.Abs(a.b-b.b)>3;
        static Camera captureCamera;
        static Color32[] Capture(RenderTexture source,string folder,string name)
        {
            // Explicit submission also runs when the native window is hidden during automated QA.
            if(GraphicsSettings.currentRenderPipeline==null)captureCamera.Render();
            else RenderPipeline.SubmitRenderRequest(captureCamera,new RenderPipeline.StandardRequest{destination=source});
            var previous=RenderTexture.active;RenderTexture.active=source;
            var image=new Texture2D(source.width,source.height,TextureFormat.RGBA32,false);image.ReadPixels(new Rect(0,0,source.width,source.height),0,0);image.Apply();
            RenderTexture.active=previous;File.WriteAllBytes(Path.Combine(folder,name+".png"),image.EncodeToPNG());var pixels=image.GetPixels32();Destroy(image);return pixels;
        }
    }
}
