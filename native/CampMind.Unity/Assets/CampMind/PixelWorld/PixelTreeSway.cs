using UnityEngine;
namespace CampMind.PixelWorld
{
    /// <summary>Root-anchored presentation motion, updated through the normal SpriteRenderer transform path.</summary>
    public sealed class PixelTreeSway:MonoBehaviour
    {
        PixelChunkRenderer owner;
        public void Bind(PixelChunkRenderer renderer)
        {
            owner=renderer;
            // Do not combine transform sway with the shader-only deformation.
            var sprite=GetComponent<SpriteRenderer>();var block=new MaterialPropertyBlock();sprite.GetPropertyBlock(block);block.SetFloat("_MotionKind",0);sprite.SetPropertyBlock(block);
        }
        public void Present(float strength,float angle,float time)
        {
            strength=PixelEnvironmentMotion.Wind(strength);
            float phase=transform.position.x*.19f+transform.position.y*.13f;
            float wave=Mathf.Sin(time*1.35f+phase)*.72f+Mathf.Sin(time*2.13f+phase*1.7f)*.28f;
            float direction=Mathf.Cos(angle)<0?-1:1;
            transform.localRotation=Quaternion.Euler(0,0,wave*strength*12*direction);
        }
        void Update(){if(owner!=null)Present(owner.WindStrength,owner.WindAngle,Time.unscaledTime);}
    }
}
