using NUnit.Framework;
using UnityEngine;
using CampMind.Editor;

namespace CampMind.Tests
{
    public class ReferenceRegionCalibrationTests
    {
        [Test] public void PixelRayIntersectionReturnsSamePixelAcrossPoseAndHeight()
        {
            var go=new GameObject("Reference projection test");var camera=go.AddComponent<Camera>();camera.aspect=2048f/1303;camera.fieldOfView=50;
            try{
                foreach(var yaw in new[]{0f,28f,-63f})foreach(var pitch in new[]{30f,35f,57f}){
                    camera.transform.rotation=Quaternion.Euler(pitch,yaw,0);camera.transform.position=-camera.transform.forward*650;
                    foreach(var pixel in new[]{Vector2.zero,new Vector2(2048,1303),new Vector2(1059,768),new Vector2(1291,802)})foreach(var height in new[]{0f,18f,95f}){
                        var world=ReferenceRegionCalibrationBuilder.Unproject(camera,pixel,height);var projected=ReferenceRegionCalibrationBuilder.Project(camera,world);
                        Assert.That(Vector2.Distance(projected,pixel),Is.LessThan(.003f),$"Wrong pixel axis or camera basis at {yaw}/{pitch}");Assert.That(world.y,Is.EqualTo(height).Within(.001f));
                    }
                }
            }finally{Object.DestroyImmediate(go);}
        }
        [Test] public void HorizonCannotBecomeFakeGroundPoint()
        {
            var go=new GameObject("Horizon test");var camera=go.AddComponent<Camera>();camera.transform.position=Vector3.up*10;camera.transform.rotation=Quaternion.identity;camera.aspect=2048f/1303;
            try{Assert.Throws<System.InvalidOperationException>(()=>ReferenceRegionCalibrationBuilder.Unproject(camera,new Vector2(1024,651.5f)));}
            finally{Object.DestroyImmediate(go);}
        }
    }
}
