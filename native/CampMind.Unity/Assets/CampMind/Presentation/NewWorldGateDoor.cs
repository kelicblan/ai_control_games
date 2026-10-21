using UnityEngine;

namespace CampMind.Presentation
{
    // Calibration interaction only. Both leaves retain real box collision.
    public sealed class NewWorldGateDoor : MonoBehaviour
    {
        public Transform leftLeaf,rightLeaf;
        public Vector3 center;
        public Quaternion leftClosed,rightClosed;
        private float openness;
        public float OpenFraction=>openness;
        public void Step(Vector3 actor,float dt)
        {
            var delta=actor-center;delta.y=0;
            openness=Mathf.MoveTowards(openness,delta.magnitude<16?1:0,dt*2);
            leftLeaf.rotation=leftClosed*Quaternion.Euler(0,-105*openness,0);
            rightLeaf.rotation=rightClosed*Quaternion.Euler(0,105*openness,0);
            Physics.SyncTransforms();
        }
    }
}
