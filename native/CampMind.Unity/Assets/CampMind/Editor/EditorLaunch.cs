using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace CampMind.Editor
{
    public static class EditorLaunch
    {
        [Serializable] sealed class Ready
        {
            public string unity,scene;
            public bool loaded,batchMode;
            public int pid;
        }
        public static void OpenCamp()
        {
            var args=Environment.GetCommandLineArgs();var index=Array.IndexOf(args,"-campmind-editor-ready");
            if(index<0||index+1>=args.Length)throw new ArgumentException("Missing Editor launcher receipt path");
            var receipt=Path.GetFullPath(args[index+1]);var artifacts=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Artifacts"));
            if(!receipt.StartsWith(artifacts+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Receipt must be inside native/Artifacts");
            var scene=EditorSceneManager.OpenScene("Assets/CampMind/Scenes/Camp.unity");
            EditorApplication.delayCall+=()=>{
                File.WriteAllText(receipt,JsonUtility.ToJson(new Ready{unity=Application.unityVersion,scene=scene.path,loaded=scene.isLoaded,batchMode=Application.isBatchMode,pid=System.Diagnostics.Process.GetCurrentProcess().Id},true));
                Debug.Log("CampMind interactive Editor ready: "+scene.path);
            };
        }
    }
}
