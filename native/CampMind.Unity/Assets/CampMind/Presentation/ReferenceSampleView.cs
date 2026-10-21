using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CampMind.Presentation
{
    // Isolated art acceptance scene. No world service, commands, inventories or saves.
    public sealed class ReferenceSampleView : MonoBehaviour
    {
        public Transform actor;
        public Camera viewCamera;
        public Transform gateLeft,gateRight;
        public BoxCollider closedGate;
        public Transform[] subjects;
        private CharacterController motor;
        private Animator animator;
        private bool walking,gateOpen=true,probing,hideHud;
        private float yaw=0,pitch=25,distance=8,vertical;
        private int shot;
        private string clip;
        public bool GateOpen=>gateOpen;
        public static readonly string[] ShotNames={"overview","manor","dwelling","gate","watchtower","riverbank"};
        private static readonly Vector3[] Positions={new Vector3(74,55,-100),new Vector3(9,10,-10),new Vector3(-6,9,-24),new Vector3(27,11,-65),new Vector3(48,16,-14),new Vector3(-26,19,-85)};
        private static readonly Vector3[] Targets={new Vector3(-10,8,12),new Vector3(0,8,12),new Vector3(-18,6,-8),new Vector3(12,8,-40),new Vector3(30,11,13),new Vector3(-65,1,-30)};
        private void Start()
        {
            Application.runInBackground=true;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            motor=actor.GetComponent<CharacterController>();animator=actor.GetComponentInChildren<Animator>();
            animator?.Rebind();SetGate(true);SetShot(0);
            var args=Environment.GetCommandLineArgs();var index=Array.IndexOf(args,"-reference-sample-probe");
            if(index>=0&&index+1<args.Length){probing=true;hideHud=true;if(args.Contains("-batchmode")){Debug.LogError("Rendered Player required");Application.Quit(2);return;}StartCoroutine(Probe(Path.GetFullPath(args[index+1])));}
        }
        public void SetGate(bool open)
        {
            gateOpen=open;if(closedGate)closedGate.enabled=!open;
            if(gateLeft)gateLeft.localRotation=Quaternion.Euler(0,open?-95:0,0);
            if(gateRight)gateRight.localRotation=Quaternion.Euler(0,open?95:0,0);
        }
        public void SetShot(int index)
        {
            walking=false;shot=Mathf.Clamp(index,0,Positions.Length-1);viewCamera.orthographic=false;viewCamera.fieldOfView=shot==0?49:52;
            viewCamera.transform.position=Positions[shot];viewCamera.transform.LookAt(Targets[shot]);
        }
        private void Update()
        {
            if(probing)return;var keys=Keyboard.current;var mouse=Mouse.current;
            if(keys==null)return;
            if(keys.tabKey.wasPressedThisFrame)walking=!walking;
            if(keys.digit1Key.wasPressedThisFrame)SetShot(0);if(keys.digit2Key.wasPressedThisFrame)SetShot(1);
            if(keys.digit3Key.wasPressedThisFrame)SetShot(2);if(keys.digit4Key.wasPressedThisFrame)SetShot(3);
            if(keys.digit5Key.wasPressedThisFrame)SetShot(4);if(keys.digit6Key.wasPressedThisFrame)SetShot(5);
            if(keys.eKey.wasPressedThisFrame&&Vector3.Distance(actor.position,new Vector3(12,3,-40))<12)SetGate(!gateOpen);
            if(keys.homeKey.wasPressedThisFrame){Teleport(new Vector2(12,-52));SetShot(0);}
            if(keys.hKey.wasPressedThisFrame)hideHud=!hideHud;
            if(keys.f12Key.wasPressedThisFrame){var dir=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../Artifacts/reference-sample-manual"));Directory.CreateDirectory(dir);ScreenCapture.CaptureScreenshot(Path.Combine(dir,DateTime.Now.ToString("yyyyMMdd-HHmmss")+".png"));}
            if(walking){
                if(mouse!=null){if(mouse.rightButton.isPressed){var d=mouse.delta.ReadValue();yaw+=d.x*.2f;pitch=Mathf.Clamp(pitch-d.y*.15f,8,65);}distance=Mathf.Clamp(distance-mouse.scroll.ReadValue().y*.005f,3,18);}
                var input=new Vector2((keys.dKey.isPressed?1:0)-(keys.aKey.isPressed?1:0),(keys.wKey.isPressed?1:0)-(keys.sKey.isPressed?1:0));
                var direction=Quaternion.Euler(0,yaw,0)*new Vector3(input.x,0,input.y);Step(direction,Time.unscaledDeltaTime);
                var target=actor.position+Vector3.up*1.5f;var offset=Quaternion.Euler(pitch,yaw,0)*new Vector3(0,0,-distance);var pos=target+offset;
                if(Physics.Linecast(target,pos,out var hit,(1<<8)|(1<<9),QueryTriggerInteraction.Ignore))pos=hit.point+hit.normal*.2f;
                viewCamera.transform.position=pos;viewCamera.transform.LookAt(target);
            }else Animate(false);
        }
        public void Teleport(Vector2 p){motor.enabled=false;actor.position=new Vector3(p.x,ReferenceSampleGround.Height(p.x,p.y)+.08f,p.y);motor.enabled=true;vertical=0;Physics.SyncTransforms();}
        public void Step(Vector3 direction,float dt)
        {
            direction=Vector3.ClampMagnitude(new Vector3(direction.x,0,direction.z),1);
            var next=actor.position+direction*(4*dt);
            if(ReferenceSampleGround.IsRiver(next.x,next.z)||Mathf.Abs(next.x)>145||next.z< -120||next.z>115)direction=Vector3.zero;
            vertical=motor.isGrounded?-2:Mathf.Max(-25,vertical-20*dt);
            var before=actor.position;motor.Move((direction*4+Vector3.up*vertical)*dt);
            if(direction.sqrMagnitude>.001f)actor.rotation=Quaternion.Slerp(actor.rotation,Quaternion.LookRotation(direction),Mathf.Min(1,dt*15));
            Animate(new Vector2(actor.position.x-before.x,actor.position.z-before.z).sqrMagnitude>.000001f);
        }
        private void Animate(bool moving){var desired=moving?"Walk":"Idle";if(animator&&desired!=clip){animator.CrossFade(desired,.12f);clip=desired;}}
        private void OnGUI()
        {
            if(hideHud)return;
            GUI.Box(new Rect(18,18,700,83),"REFERENCE ART SAMPLE | isolated from world saves\n1: overview  2: manor  3: dwelling  4: gate  5: tower  6: riverbank\nTab: walk camera  WASD: walk  RMB: orbit  Wheel: distance  E: gate nearby\nHome: reset  H: hide panel  F12: screenshot");
        }
        private IEnumerator Probe(string directory)
        {
            Directory.CreateDirectory(directory);yield return new WaitForSecondsRealtime(3);
            var bones=actor.GetComponentInChildren<SkinnedMeshRenderer>().bones;var rotations=bones.Select(b=>b.localRotation).ToArray();Animate(true);yield return new WaitForSecondsRealtime(.45f);
            var changed=bones.Where((b,i)=>Quaternion.Angle(rotations[i],b.localRotation)>.1f).Count();Animate(false);
            var cameras=new JArray();
            for(var i=0;i<ShotNames.Length;i++) {
                SetGate(i!=3);SetShot(i);yield return new WaitForSecondsRealtime(.6f);yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(Path.Combine(directory,ShotNames[i]+".png"));
                cameras.Add(new JObject{["name"]=ShotNames[i],["position"]=JArray.FromObject(new[]{viewCamera.transform.position.x,viewCamera.transform.position.y,viewCamera.transform.position.z}),["target"]=JArray.FromObject(new[]{Targets[i].x,Targets[i].y,Targets[i].z}),["fov"]=viewCamera.fieldOfView});
            }
            SetGate(false);Physics.SyncTransforms();var gateBlocked=Physics.CheckSphere(new Vector3(12,4,-40),.4f,1<<8,QueryTriggerInteraction.Ignore);SetGate(true);Physics.SyncTransforms();
            var openPassage=!Physics.CheckCapsule(new Vector3(12,3.5f,-40),new Vector3(12,4.6f,-40),.3f,1<<8,QueryTriggerInteraction.Ignore);
            var route=ReferenceSampleGround.WalkRoute;Teleport(route[0]);var segments=new JArray();var total=0f;var supported=true;var overlap=false;
            for(var i=1;i<route.Length;i++) {
                var start=actor.position;var target=new Vector3(route[i].x,3,route[i].y);var begun=Time.realtimeSinceStartup;
                while(Vector2.Distance(new Vector2(actor.position.x,actor.position.z),route[i])>.3f&&Time.realtimeSinceStartup-begun<25) {
                    Step(target-actor.position,Mathf.Min(.05f,Time.unscaledDeltaTime));
                    supported&=Physics.Raycast(actor.position+Vector3.up*.3f,Vector3.down,1.2f,1<<9,QueryTriggerInteraction.Ignore);
                    overlap|=Physics.CheckCapsule(actor.position+Vector3.up*.5f,actor.position+Vector3.up*1.35f,.23f,1<<8,QueryTriggerInteraction.Ignore);
                    yield return null;
                }
                var error=Vector2.Distance(new Vector2(actor.position.x,actor.position.z),route[i]);total+=Vector3.Distance(start,actor.position);
                segments.Add(new JObject{["index"]=i,["targetError"]=error,["passed"]=error<.4f});
            }
            walking=true;var follow=actor.position+new Vector3(5,4,-7);viewCamera.transform.position=follow;viewCamera.transform.LookAt(actor.position+Vector3.up);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,"walk.png"));
            var result=new JObject{["scene"]="ReferenceSample",["animatedBones"]=changed,["distance"]=total,["groundSupported"]=supported,["obstacleOverlap"]=overlap,["closedGateBlocked"]=gateBlocked,["openGatePassage"]=openPassage,["segments"]=segments,["cameras"]=cameras,["authorityConnected"]=false,["visualAccepted"]=false};
            result["passed"]=changed>2&&supported&&!overlap&&gateBlocked&&openPassage&&segments.All(s=>(bool)s["passed"]);
            File.WriteAllText(Path.Combine(directory,"result.json"),result.ToString());yield return new WaitForSecondsRealtime(1);Application.Quit((bool)result["passed"]?0:2);
        }
    }
}
