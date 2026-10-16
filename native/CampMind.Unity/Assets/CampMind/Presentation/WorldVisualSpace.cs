using UnityEngine;
namespace CampMind.Presentation
{
    // Logical saves stay in their original RHS 2D space. Rendering is LH.
    public readonly struct WorldVisualSpace
    {
        public readonly Vector2 Origin;
        public WorldVisualSpace(Vector2 origin){Origin=origin;}
        public Vector3 ToUnity(Vector2 logical,float height)=>new Vector3(Origin.x-logical.x,height,logical.y-Origin.y);
        public Vector2 ToLogical(Vector3 unity)=>new Vector2(Origin.x-unity.x,unity.z+Origin.y);
        public Vector3 Direction(Vector2 logical)=>new Vector3(-logical.x,0,logical.y);
        public Vector2 LogicalDirection(Vector3 unity)=>new Vector2(-unity.x,unity.z);
        public Vector3 Direction(Vector3 logical)=>new Vector3(-logical.x,logical.y,logical.z);
    }
}
