using System;
using UnityEngine;

namespace CampMind.Presentation
{
    [Serializable]
    public sealed class InteriorRoom
    {
        public string id;
        public Vector3 center;
        public Vector2 half;
        public float height;
        public Renderer[] exterior;
        public GameObject interior;
        [NonSerialized] public bool observed;
        public bool Contains(Vector3 point)=>Mathf.Abs(point.x-center.x)<half.x-.3f&&Mathf.Abs(point.z-center.z)<half.y-.3f&&point.y>=center.y-1&&point.y<=center.y+height;
    }
    public sealed class NativeInteriorView : MonoBehaviour
    {
        public InteriorRoom[] rooms;
        public NativeCampView view;
        public void Observe(Vector3 point)
        {
            foreach(var room in rooms){var visible=room.Contains(point)||room.Contains(view.viewCamera.transform.position);
                if(visible==room.observed)continue;room.observed=visible;
                foreach(var renderer in room.exterior)renderer.enabled=!visible;
                room.interior.SetActive(visible);
            }
        }
        private void LateUpdate(){Observe((view.lordView?view.lord:view.Selection).position);}
    }
}
