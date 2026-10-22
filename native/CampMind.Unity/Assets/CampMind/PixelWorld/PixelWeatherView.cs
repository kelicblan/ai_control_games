using Newtonsoft.Json.Linq;
using UnityEngine;
using CampMind.Presentation;

namespace CampMind.PixelWorld
{
    /// <summary>Camera-sized weather layer above map sprites and below the original screen-space UI.</summary>
    public sealed class PixelWeatherView:MonoBehaviour
    {
        Camera cameraView;Material material;GameObject layer;Sprite sprite;Texture2D texture;
        float rain,darkness,flash,clock;double lastLightning;string worldId;bool initialized;
        public float Rain=>rain;
        public float Darkness=>darkness;
        public float Flash=>flash;
        public static float TargetDarkness(string weather,float cloud)=>Mathf.Clamp01(cloud)*.12f+(weather=="storm"?.38f:weather=="rain"?.18f:0);
        public void Initialize(Camera camera)
        {
            cameraView=camera;material=new Material(Resources.Load<Shader>("PixelWorld/PixelWeather"));
            texture=new Texture2D(1,1);texture.SetPixel(0,0,Color.white);texture.Apply();
            sprite=Sprite.Create(texture,new Rect(0,0,1,1),new Vector2(.5f,.5f),1,0,SpriteMeshType.FullRect);
            layer=new GameObject("二维雨幕与雷暴");layer.transform.SetParent(camera.transform,false);layer.transform.localPosition=Vector3.forward;
            var renderer=layer.AddComponent<SpriteRenderer>();renderer.sprite=sprite;renderer.sharedMaterial=material;renderer.sortingOrder=32760;
        }
        public void Present(JObject state,float delta)
        {
            if(material==null||state==null)return;
            string kind=(string)state["weather"],id=(string)state["worldId"];
            var atmosphere=state["atmosphere"];
            float intensity=kind=="rain"||kind=="storm"?PixelEnvironmentMotion.Wind((float?)atmosphere?["rainIntensity"]??(kind=="storm"?1:.65f)):0;
            float cloud=PixelEnvironmentMotion.Wind((float?)atmosphere?["cloudCover"]??0);
            double lightning=(double?)atmosphere?["lightningAt"]??0;
            if(!initialized||id!=worldId){initialized=true;worldId=id;lastLightning=lightning;flash=0;}
            else if(lightning>lastLightning){lastLightning=lightning;if(kind=="storm")flash=1;}
            float blend=1-Mathf.Exp(-Mathf.Max(0,delta)*3);
            rain=Mathf.Lerp(rain,intensity,blend);darkness=Mathf.Lerp(darkness,TargetDarkness(kind,cloud),blend);
            clock+=Mathf.Max(0,delta);flash=Mathf.Max(0,flash-delta*2.4f);
            material.SetFloat("_WeatherTime",clock);material.SetFloat("_Rain",rain);material.SetFloat("_Darkness",darkness);material.SetFloat("_Flash",flash);
            material.SetFloat("_WindSlant",Mathf.Cos((float?)atmosphere?["windAngle"]??0)*PixelEnvironmentMotion.Wind((float?)atmosphere?["windStrength"]??0)*.4f);
            material.SetFloat("_Strike",(float)(lastLightning%1000));
            material.SetFloat("_Aspect",cameraView.aspect);
            layer.transform.localScale=new Vector3(cameraView.orthographicSize*2*cameraView.aspect,cameraView.orthographicSize*2,1);
        }
        void LateUpdate(){Present(GetComponent<NativeVillageUi>()?.Snapshot,Time.unscaledDeltaTime);}
        void OnDestroy(){if(layer!=null)Destroy(layer);if(sprite!=null)Destroy(sprite);if(texture!=null)Destroy(texture);if(material!=null)Destroy(material);}
    }
}
