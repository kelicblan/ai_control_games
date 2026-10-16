using UnityEngine;

namespace CampMind.Presentation
{
    // Visuals and local preview collision only. TS retains movement authority.
    public sealed class NativeGateView:MonoBehaviour
    {
        public NativeCampView view;
        public Transform left,right;
        public BoxCollider closedCollision;
        bool initialized;
        void LateUpdate(){if(view!=null)Apply(view.GateOpen,Time.unscaledDeltaTime);}
        public void Apply(bool open,float dt)
        {
            var factor=initialized?1-Mathf.Exp(-Mathf.Clamp(dt,0,1)*8):1;initialized=true;
            left.localRotation=Quaternion.Slerp(left.localRotation,Quaternion.Euler(0,open?-90:0,0),factor);
            right.localRotation=Quaternion.Slerp(right.localRotation,Quaternion.Euler(0,open?90:0,0),factor);
            closedCollision.enabled=!open;
        }
    }
}
