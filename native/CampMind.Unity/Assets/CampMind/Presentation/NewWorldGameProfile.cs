using UnityEngine;
namespace CampMind.Presentation
{
    // Marker for the scene-derived authority map and isolated save. No simulation here.
    [DefaultExecutionOrder(150)] public sealed class NewWorldGameProfile:MonoBehaviour
    {
        public const string LayoutId="new-world-v1";
        public NativeCampView view;
        public NewWorldGateDoor gate;
        public Vector3 referencePosition,referenceFocus;
        public Quaternion referenceRotation;
        public float referenceFov=28,referenceYaw,referencePitch,referenceZoom;
        void Start(){var args=System.Environment.GetCommandLineArgs();int index=System.Array.IndexOf(args,"-campmind-new-world-probe");if(index>=0&&index+1<args.Length)gameObject.AddComponent<NewWorldGameProbe>().Begin(this,args[index+1]);view.focus=referenceFocus;view.yaw=referenceYaw;view.pitch=referencePitch;view.zoom=referenceZoom;view.lordView=false;view.lordDistance=8;}
        public void ApplyOverview()
        {
            view.pitch=Mathf.Clamp(view.pitch,.25f,1.35f);
            view.zoom=Mathf.Clamp(view.zoom,.06f,2.8f);
            ApplyPose();
        }
        void ApplyPose()
        {
            var ratio=Mathf.Clamp(referenceZoom/Mathf.Max(.01f,view.zoom),.05f,3);
            var yawDelta=(view.yaw-referenceYaw)*Mathf.Rad2Deg;
            var original=referencePosition-referenceFocus;
            var elevation=Mathf.Clamp(Mathf.Atan2(original.y,new Vector2(original.x,original.z).magnitude)+view.pitch-referencePitch,.15f,1.45f);
            var horizontal=Quaternion.Euler(0,-yawDelta,0)*Vector3.ProjectOnPlane(original,Vector3.up).normalized;
            var offset=(horizontal*Mathf.Cos(elevation)+Vector3.up*Mathf.Sin(elevation))*original.magnitude*ratio;
            view.viewCamera.orthographic=false;view.viewCamera.fieldOfView=referenceFov;
            view.viewCamera.transform.position=view.focus+offset;
            view.viewCamera.transform.LookAt(view.focus);
        }
        void LateUpdate(){if(gate&&gate.leftLeaf&&gate.rightLeaf){gate.leftLeaf.rotation=gate.leftClosed*Quaternion.Euler(0,view.GateOpen?-105:0,0);gate.rightLeaf.rotation=gate.rightClosed*Quaternion.Euler(0,view.GateOpen?105:0,0);}}
    }
}
