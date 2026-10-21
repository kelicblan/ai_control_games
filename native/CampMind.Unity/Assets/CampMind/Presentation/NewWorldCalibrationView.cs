using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using Newtonsoft.Json.Linq;

namespace CampMind.Presentation
{
    [Serializable] public sealed class NewWorldWalkRoute { public string id; public Vector3[] points; }
    public sealed class NewWorldCalibrationView:MonoBehaviour
    {
        public Camera referenceCamera;
        public Texture2D reference;
        [TextArea] public string report;
        public Transform actor;
        public NewWorldGateDoor gate;
        public Vector3[] walkTargets;
        public NewWorldWalkRoute[] yardRoutes;
        public string[] studioIds;
        public Vector3[] studioCenters;
        public float[] studioRadii;
        public GameObject[] studioObjects;
        public float[] studioBaseYaw;
        private int studioIndex=-1,defaultCullingMask;
        private float studioOrbitYaw,studioPitch=15,studioDistanceFactor=4.8f;
        private bool overlay,hideHud,walking,capturing,captureSkipStudio;
        private Font previewFont;
        private float mapFov;
        private Vector3 savedPosition,spawn;
        private Quaternion savedRotation;
        private CharacterController motor;
        private Animator animator;
        private float vertical,yaw,pitch=25,distance=8;
        private string clip;
        private void Start(){Application.runInBackground=true;Application.targetFrameRate=60;mapFov=referenceCamera.fieldOfView;previewFont=Font.CreateDynamicFontFromOSFont(new[]{"Microsoft YaHei UI","Microsoft YaHei","SimHei"},16);defaultCullingMask=referenceCamera.cullingMask;savedPosition=referenceCamera.transform.position;savedRotation=referenceCamera.transform.rotation;spawn=actor.position;motor=actor.GetComponent<CharacterController>();animator=actor.GetComponentInChildren<Animator>();var args=Environment.GetCommandLineArgs();captureSkipStudio=args.Contains("-new-world-capture-skip-studio");var index=Array.IndexOf(args,"-new-world-capture");if(index>=0&&index+1<args.Length){hideHud=true;capturing=true;StartCoroutine(Capture(args[index+1]));}}
        private void Update(){
            if(capturing)return;var key=Keyboard.current;if(key==null)return;if(key.rKey.wasPressedThisFrame&&studioIndex<0&&!walking)overlay=!overlay;if(key.hKey.wasPressedThisFrame)hideHud=!hideHud;
            if(key.f1Key.wasPressedThisFrame){walking=false;ExitStudio();referenceCamera.orthographic=false;referenceCamera.fieldOfView=mapFov;referenceCamera.transform.SetPositionAndRotation(savedPosition,savedRotation);}
            var studioKeys=new[]{key.f2Key,key.f3Key,key.f4Key,key.f5Key,key.f6Key,key.f7Key,key.f8Key,key.f9Key,key.f10Key,key.f11Key,key.f12Key};for(int i=0;i<studioKeys.Length;i++)if(studioKeys[i].wasPressedThisFrame&&studioCenters!=null&&i<studioCenters.Length){walking=false;overlay=false;StudioShot(i,0);}
            if(key.tabKey.wasPressedThisFrame){walking=!walking;ExitStudio();overlay=false;referenceCamera.fieldOfView=walking?48:mapFov;if(!walking){referenceCamera.transform.SetPositionAndRotation(savedPosition,savedRotation);referenceCamera.orthographic=false;}}
            if(key.homeKey.wasPressedThisFrame){motor.enabled=false;actor.position=spawn;motor.enabled=true;vertical=0;}
            if(walking){var mouse=Mouse.current;if(mouse!=null){if(mouse.rightButton.isPressed){var delta=mouse.delta.ReadValue();yaw+=delta.x*.15f;pitch=Mathf.Clamp(pitch-delta.y*.12f,5,75);}distance=Mathf.Clamp(distance-mouse.scroll.ReadValue().y*.008f,3,25);}
                var input=new Vector3((key.dKey.isPressed?1:0)-(key.aKey.isPressed?1:0),0,(key.wKey.isPressed?1:0)-(key.sKey.isPressed?1:0));Step(Quaternion.Euler(0,yaw,0)*input,Time.deltaTime);
                var target=actor.position+Vector3.up*1.4f;PlaceWalkCamera(target,Quaternion.Euler(pitch,yaw,0)*new Vector3(0,0,-distance));
            }
            else if(studioIndex>=0&&Mouse.current!=null){var mouse=Mouse.current;if(mouse.rightButton.isPressed){var delta=mouse.delta.ReadValue();studioOrbitYaw+=delta.x*.2f;studioPitch=Mathf.Clamp(studioPitch-delta.y*.15f,-10,75);}studioDistanceFactor=Mathf.Clamp(studioDistanceFactor-mouse.scroll.ReadValue().y*.002f,2.4f,9);StudioShot(studioIndex,studioOrbitYaw);}
        }
        private void PlaceWalkCamera(Vector3 target,Vector3 offset)
        {
            float length=offset.magnitude;
            var hits=Physics.SphereCastAll(target,.2f,offset/length,length,~(1<<2),QueryTriggerInteraction.Ignore).Where(hit=>hit.collider.transform!=actor&&!hit.collider.transform.IsChildOf(actor)).OrderBy(hit=>hit.distance).ToArray();
            if(hits.Length>0)offset=offset/length*Mathf.Max(.35f,hits[0].distance-.18f);
            referenceCamera.transform.position=target+offset;referenceCamera.transform.LookAt(target);
        }
        private void Step(Vector3 direction,float dt){
            if(gate)gate.Step(actor.position,dt);
            direction=Vector3.ClampMagnitude(new Vector3(direction.x,0,direction.z),1);vertical=motor.isGrounded?-2:Mathf.Max(-25,vertical-20*dt);var before=actor.position;motor.Move((direction*6+Vector3.up*vertical)*dt);
            if(direction.sqrMagnitude>.001f)actor.rotation=Quaternion.Slerp(actor.rotation,Quaternion.LookRotation(direction),dt*15);
            var desired=(actor.position-before).sqrMagnitude>.0001f&&direction.sqrMagnitude>.001f?"Walk":"Idle";if(desired!=clip){animator.CrossFade(desired,.12f);clip=desired;}
        }
        private void OnGUI(){
            if(overlay&&reference){var color=GUI.color;GUI.color=new Color(1,1,1,.5f);GUI.DrawTexture(new Rect(0,0,Screen.width,Screen.height),reference,ScaleMode.ScaleToFit);GUI.color=color;}
            if(!hideHud){if(previewFont)GUI.skin.font=previewFont;GUI.Box(new Rect(12,12,700,104),"新世界施工预览｜尚未接入正式世界\nTab：切换行走　WASD：移动　右键：环绕　滚轮：远近\nF1：总览机位　R：总览叠加参考图　Home：重置人物　H：隐藏说明\nF2—F12：查看已生成源件（独立检查区）");}
        }
        private void ExitStudio(){studioIndex=-1;referenceCamera.cullingMask=defaultCullingMask;if(studioObjects!=null)foreach(var go in studioObjects)go.SetActive(false);}
        private void StudioShot(int index,float yaw){studioIndex=index;studioOrbitYaw=yaw;for(int i=0;i<studioObjects.Length;i++)studioObjects[i].SetActive(i==index);referenceCamera.cullingMask=1<<2;referenceCamera.orthographic=false;referenceCamera.fieldOfView=28;referenceCamera.transform.position=studioCenters[index]+Quaternion.Euler(studioPitch,studioBaseYaw[index]+yaw,0)*new Vector3(0,0,-studioRadii[index]*studioDistanceFactor);referenceCamera.transform.LookAt(studioCenters[index]);}
        private IEnumerator Capture(string output){
            Directory.CreateDirectory(output);yield return new WaitForSecondsRealtime(3);
            if(Screen.width!=1672||Screen.height!=941){File.WriteAllText(Path.Combine(output,"capture-error.txt"),$"Unexpected size {Screen.width}x{Screen.height}");Application.Quit(2);yield break;}
            overlay=false;referenceCamera.orthographic=false;yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"perspective-greybox.png"));yield return new WaitForSecondsRealtime(1);
            overlay=true;yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"perspective-overlay.png"));yield return new WaitForSecondsRealtime(1);
            // Same geometry: this comparison is diagnostic, not a separately fitted orthographic scene.
            overlay=false;referenceCamera.orthographic=true;yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"orthographic-unfitted.png"));yield return new WaitForSecondsRealtime(1);
            referenceCamera.orthographic=false;
            var sun=RenderSettings.sun;float dayIntensity=sun?sun.intensity:0;var daySun=sun?sun.color:Color.white;var dayAmbient=RenderSettings.ambientLight;var daySky=referenceCamera.backgroundColor;var dayFog=RenderSettings.fogColor;float dayStrength=Shader.GetGlobalFloat("_NewWorldDaylight");
            if(sun){sun.intensity=.05f;sun.color=new Color(.4f,.55f,1);}RenderSettings.ambientLight=new Color(.06f,.08f,.12f);referenceCamera.backgroundColor=new Color(.025f,.035f,.055f);RenderSettings.fogColor=referenceCamera.backgroundColor;
            for(int frame=0;frame<4;frame++)yield return null;float nightStrength=Shader.GetGlobalFloat("_NewWorldDaylight");yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"lighting-night-preview.png"));yield return new WaitForSecondsRealtime(.5f);
            if(sun){sun.intensity=dayIntensity;sun.color=daySun;}RenderSettings.ambientLight=dayAmbient;referenceCamera.backgroundColor=daySky;RenderSettings.fogColor=dayFog;for(int frame=0;frame<4;frame++)yield return null;
            var route=new JArray();Physics.SyncTransforms();
            for(int segment=1;segment<walkTargets.Length;segment++){
                var target=walkTargets[segment];var start=actor.position;int iterations=0;bool arrived=false;
                for(;iterations<2400;iterations++){
                    var delta=target-actor.position;delta.y=0;if(delta.magnitude<.65f&&Mathf.Abs(actor.position.y-target.y)<.6f){arrived=true;break;}Step(delta.normalized,1f/60);
                    if(iterations%30==0)yield return null;
                    if(actor.position.y< -10)break;
                }
                var contacts=Physics.OverlapCapsule(actor.position+Vector3.up*.3f,actor.position+Vector3.up*1.55f,.33f).Where(hit=>hit.transform!=actor).Select(hit=>hit.name).Distinct();
                route.Add(new JObject{["segment"]=segment,["arrived"]=arrived,["start"]=JArray.FromObject(new[]{start.x,start.y,start.z}),["end"]=JArray.FromObject(new[]{actor.position.x,actor.position.y,actor.position.z}),["target"]=JArray.FromObject(new[]{target.x,target.y,target.z}),["iterations"]=iterations,["nearbyColliders"]=new JArray(contacts),["gateOpenFraction"]=gate?gate.OpenFraction:0});
                if(!arrived)break;
            }
            var result=JObject.Parse(report);result["lightingDiagnostic"]=new JObject{["dayStrength"]=dayStrength,["nightStrength"]=nightStrength,["file"]="lighting-night-preview.png",["policy"]="Local lighting diagnostic only; no authoritative game time or weather validation"};result["walkViewFov"]=48;result["walkProbe"]=route;result["walkProbePassed"]=route.Count==walkTargets.Length-1&&System.Linq.Enumerable.All(route,p=>(bool)p["arrived"]);
            referenceCamera.fieldOfView=48;var lookAt=actor.position+Vector3.up*1.4f;PlaceWalkCamera(lookAt,new Vector3(14,8,-18));yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"walk-at-stairs.png"));yield return new WaitForSecondsRealtime(1);
            var yardResults=new JArray();
            if(yardRoutes!=null)foreach(var yard in yardRoutes){
                motor.enabled=false;actor.position=yard.points[0]+Vector3.up*.4f;motor.enabled=true;vertical=0;Physics.SyncTransforms();bool passed=true;var segments=new JArray();
                for(int segment=1;segment<yard.points.Length;segment++){
                    var target=yard.points[segment];int iterations=0;bool arrived=false;
                    for(;iterations<2400;iterations++){var delta=target-actor.position;delta.y=0;if(delta.magnitude<.65f&&Mathf.Abs(actor.position.y-target.y)<.65f){arrived=true;break;}Step(delta.normalized,1f/60);if(iterations%30==0)yield return null;if(actor.position.y<-10)break;}
                    var contacts=Physics.OverlapCapsule(actor.position+Vector3.up*.3f,actor.position+Vector3.up*1.55f,.33f).Where(hit=>hit.transform!=actor).Select(hit=>hit.name).Distinct();
                    segments.Add(new JObject{["segment"]=segment,["arrived"]=arrived,["iterations"]=iterations,["end"]=JArray.FromObject(new[]{actor.position.x,actor.position.y,actor.position.z}),["target"]=JArray.FromObject(new[]{target.x,target.y,target.z}),["nearbyColliders"]=new JArray(contacts)});
                    if(!arrived){passed=false;break;}
                }
                yardResults.Add(new JObject{["id"]=yard.id,["passed"]=passed,["segments"]=segments});
                var yardLook=actor.position+Vector3.up*1.4f;PlaceWalkCamera(yardLook,new Vector3(8,5,-12));yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(output,"walk-yard-"+yard.id+".png"));yield return new WaitForSecondsRealtime(.15f);
            }
            result["yardWalkProbes"]=yardResults;result["allYardRoutesPassed"]=yardResults.Count==5&&yardResults.All(y=>(bool)y["passed"]);
            var studioShots=new JArray();
            if(!captureSkipStudio&&studioCenters!=null)for(int asset=0;asset<studioCenters.Length;asset++)for(int side=0;side<4;side++){
                StudioShot(asset,side*90);yield return new WaitForSecondsRealtime(.12f);yield return new WaitForEndOfFrame();var name="studio-"+studioIds[asset]+"-"+side+".png";ScreenCapture.CaptureScreenshot(Path.Combine(output,name));yield return new WaitForSecondsRealtime(.15f);studioShots.Add(new JObject{["asset"]=studioIds[asset],["yaw"]=studioBaseYaw[asset]+side*90,["relativeYaw"]=side*90,["isolated"]=true,["file"]=name});
            }
            result["assetStudioShots"]=studioShots;File.WriteAllText(Path.Combine(output,"scene-report.json"),result.ToString());Application.Quit(0);
        }
    }
}
