using UnityEngine;
namespace CampMind.PixelWorld
{
    public sealed class PixelSpriteAnimation:MonoBehaviour
    {
        public TinySwordsLibrary library;
        public string kind;
        SpriteRenderer target;
        int previous=-1;
        void Awake(){target=GetComponent<SpriteRenderer>();}
        void Update(){int frame=(int)(Time.unscaledTime*10)%8;if(frame==previous)return;previous=frame;target.sprite=library.Get(kind,frame);}
    }
}
