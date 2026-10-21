using System;
using System.IO;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CampMind.Presentation
{
    public sealed class ReferenceRegionCalibrationView:MonoBehaviour
    {
        public Camera referenceCamera;public Texture2D reference;[TextArea]public string report;
        private bool overlay,hideHud,capture;
        private void Start(){Application.runInBackground=true;Application.targetFrameRate=30;var args=Environment.GetCommandLineArgs();var i=Array.IndexOf(args,"-reference-region-capture");if(i>=0&&i+1<args.Length){capture=true;hideHud=true;StartCoroutine(Capture(args[i+1]));}}
        private void Update(){var key=Keyboard.current;if(key==null)return;if(key.rKey.wasPressedThisFrame)overlay=!overlay;if(key.hKey.wasPressedThisFrame)hideHud=!hideHud;}
        private void OnGUI(){
            var expected=2048f/1303;var width=Screen.width;var height=width/expected;var frame=new Rect(0,(Screen.height-height)/2,width,height);
            if(overlay&&reference){var old=GUI.color;GUI.color=new Color(1,1,1,.5f);GUI.DrawTexture(frame,reference,ScaleMode.StretchToFill);GUI.color=old;}
            if(!hideHud)GUI.Box(new Rect(14,14,600,62),"REFERENCE CONSTRAINT FIT | NOT FINAL GAME / NOT ACCEPTED\nR: 50% original-image overlay | H: hide panel\nCandidate models are uniform-scale; terrain/camera calibration remains open.");
        }
        private IEnumerator Capture(string directory){
            if(Application.isBatchMode){Debug.LogError("Reference capture needs a rendered player");Application.Quit(2);yield break;}
            Directory.CreateDirectory(directory);yield return new WaitForSecondsRealtime(3);yield return new WaitForEndOfFrame();
            if(Screen.width!=2048||Screen.height!=1303){File.WriteAllText(Path.Combine(directory,"capture-error.txt"),$"Unexpected frame {Screen.width}x{Screen.height}");Application.Quit(2);yield break;}
            overlay=false;ScreenCapture.CaptureScreenshot(Path.Combine(directory,"candidate-fit.png"));File.WriteAllText(Path.Combine(directory,"fit-report.json"),report);yield return new WaitForSecondsRealtime(1);Application.Quit(0);
        }
    }
}
