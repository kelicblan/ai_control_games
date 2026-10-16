using System;
using UnityEngine;

namespace CampMind.Presentation
{
    [Serializable]
    public struct RoofRegion
    {
        public Vector2 center,half;
        public float height;
        public RoofRegion(Vector2 center,Vector2 half,float height){this.center=center;this.half=half;this.height=height;}
        public bool Occludes(Vector3 point)=>Mathf.Abs(point.x-center.x)<=half.x&&Mathf.Abs(point.z-center.y)<=half.y&&point.y<height;
    }
    public sealed class NativeWeatherView : MonoBehaviour
    {
        public RoofRegion[] roofs;
        public Transform[] foliage;
        public Material rainMaterial;
        public ParticleSystem rain;
        public NativeCampView view;
        private float wind,angle,flash,nextFoliage;
        private double lastLightning;
        public void Conditions(float strength,float direction,double lightning)
        {
            wind=strength;angle=direction;
            if(lightning>0&&lightning>lastLightning){lastLightning=lightning;flash=.18f;}
        }
        private void Start()
        {
            var bounds=new Vector4[16];var heights=new Vector4[16];var count=Math.Min(16,roofs.Length);
            for(var i=0;i<count;i++){bounds[i]=new Vector4(roofs[i].center.x,roofs[i].center.y,roofs[i].half.x,roofs[i].half.y);heights[i]=new Vector4(roofs[i].height,0,0,0);}
            rainMaterial.SetVectorArray("_RoofBounds",bounds);rainMaterial.SetVectorArray("_RoofHeights",heights);rainMaterial.SetInt("_RoofCount",count);
        }
        private void LateUpdate()
        {
            var velocity=rain.velocityOverLifetime;velocity.enabled=true;velocity.space=ParticleSystemSimulationSpace.World;
            velocity.x=Mathf.Sin(angle)*wind*12;velocity.y=0;velocity.z=Mathf.Cos(angle)*wind*12;
            if(flash>0){view.sun.intensity+=Mathf.Clamp01(flash/.18f)*3;flash-=Time.unscaledDeltaTime;}
            if(Time.unscaledTime<nextFoliage)return;nextFoliage=Time.unscaledTime+.1f;
            var center=view.lordView?view.lord.position:view.focus;
            foreach(var plant in foliage){if((plant.position-center).sqrMagnitude>225*225)continue;
                var wave=Mathf.Sin(Time.time*1.3f+plant.position.x*.13f+plant.position.z*.07f)*wind*1.2f;
                plant.localRotation=Quaternion.Euler(Mathf.Cos(angle)*wave,0,-Mathf.Sin(angle)*wave);
            }
        }
    }
}
