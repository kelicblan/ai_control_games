using UnityEngine;
namespace CampMind.Presentation
{
    public struct NativeCameraPose
    {
        public Vector3 Position,Target;
        public bool Orthographic;
        public float Size,Fov,Near,Far;
        public void Apply(Camera camera){camera.orthographic=Orthographic;camera.orthographicSize=Size;camera.fieldOfView=Fov;camera.nearClipPlane=Near;camera.farClipPlane=Far;camera.transform.position=Position;camera.transform.LookAt(Target);}
    }
    public static class NativeCameraProfile
    {
        public static NativeCameraPose God(int width,int height,Vector3 focus,float azimuth,float elevation,float zoom)
        {
            var aspect=Mathf.Max(1,width)/(float)Mathf.Max(1,height);var halfWidth=aspect<.85f?36:Mathf.Max(36,33*aspect);var halfHeight=halfWidth/aspect;
            elevation=Mathf.Clamp(elevation,.2f,1.5f);zoom=Mathf.Clamp(zoom,.15f,2.8f)*(aspect<.85f?1.55f:1.08f);
            var c=Mathf.Abs(Mathf.Cos(azimuth));var s=Mathf.Abs(Mathf.Sin(azimuth));var vertical=halfHeight/Mathf.Sin(elevation);
            zoom=Mathf.Max(zoom,2*Mathf.Max(halfWidth*c+vertical*s,halfWidth*s+vertical*c)/1280);
            var distance=Mathf.Max(180,halfHeight/zoom*Mathf.Cos(elevation)/Mathf.Sin(elevation)+90);var horizontal=Mathf.Cos(elevation)*distance;
            return new NativeCameraPose{Orthographic=true,Size=halfHeight/zoom,Fov=58,Near=.1f,Far=4000,Target=focus,Position=focus+new Vector3(-Mathf.Sin(azimuth)*horizontal,Mathf.Sin(elevation)*distance,Mathf.Cos(azimuth)*horizontal)};
        }
        public static NativeCameraPose Lord(Vector3 player,float azimuth,float elevation,float distance)
        {
            distance=Mathf.Clamp(distance,10,650);elevation=Mathf.Clamp(elevation,.08f,1.35f);var target=player+Vector3.up*4.5f;
            var offset=new Vector3(-(Mathf.Sin(azimuth)*Mathf.Cos(elevation)*distance+Mathf.Cos(azimuth)*2),Mathf.Sin(elevation)*distance,Mathf.Cos(azimuth)*Mathf.Cos(elevation)*distance-Mathf.Sin(azimuth)*2);
            return new NativeCameraPose{Orthographic=false,Size=5,Fov=58,Near=.2f,Far=2400,Target=target,Position=target+offset};
        }
        public static Vector2 LogicalMove(Vector2 input,float azimuth)
        {
            input=Vector2.ClampMagnitude(input,1);return new Vector2(input.x*Mathf.Cos(azimuth)-input.y*Mathf.Sin(azimuth),-input.x*Mathf.Sin(azimuth)-input.y*Mathf.Cos(azimuth));
        }
    }
}
