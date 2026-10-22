using UnityEngine;

namespace CampMind.PixelWorld
{
    /// <summary>Presentation only: shared shader inputs and a point-filtered authoritative water mask.</summary>
    public static class PixelEnvironmentMotion
    {
        public static bool IsTree(string kind)=>kind=="pine"||kind=="oak"||kind=="ornamental-tree"||kind=="scenery-tree"||kind=="scenery-tree-gold"||kind=="scenery-pine";

        public static float Wind(float strength)=>float.IsFinite(strength)?Mathf.Clamp01(strength):0;

        public static Color32[] WaterPixels(PixelChunk chunk)
        {
            var pixels=new Color32[64*64];
            for(int y=0;y<64;y++)for(int x=0;x<64;x++)
                pixels[(63-y)*64+x]=new Color32(chunk.tiles[y*64+x]==5?(byte)255:(byte)0,0,0,255);
            return pixels;
        }

        public static void ConfigureTree(SpriteRenderer renderer,string kind)
        {
            if(!IsTree(kind)||renderer.sprite==null)return;
            var block=new MaterialPropertyBlock();renderer.GetPropertyBlock(block);
            block.SetFloat("_MotionKind",1);
            var sprite=renderer.sprite;
            block.SetVector("_TreeBounds",new Vector4(sprite.rect.yMin/sprite.texture.height,sprite.rect.height/sprite.texture.height,0,0));
            renderer.SetPropertyBlock(block);
        }
    }
}
