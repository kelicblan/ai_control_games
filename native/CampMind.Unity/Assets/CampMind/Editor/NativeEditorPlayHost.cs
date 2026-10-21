using System;
using System.IO;
using System.Diagnostics;
using CampMind.Presentation;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    // Own only the isolated Editor world. Original saves and other services are never touched.
    [InitializeOnLoad]
    public static class NativeEditorPlayHost
    {
        const string RunKey="CampMind.EditorWorld.Run";
        public const string ControlsDataKey="CampMind.EditorWorld.ControlsTestData";
        static string run;
        static double deadline;
        static bool HeadlessTest=>Array.IndexOf(Environment.GetCommandLineArgs(),"-campmind-editor-world-smoke")>=0;
        [Serializable] sealed class Ready { public string endpoint,player; public int owner; }
        [Serializable] sealed class Failure { public string error; }
        static NativeEditorPlayHost()
        {
            EditorApplication.playModeStateChanged+=Changed;
            EditorApplication.quitting+=Stop;
            if((!Application.isBatchMode||HeadlessTest)&&EditorApplication.isPlaying)
                EditorApplication.delayCall+=Start;
        }
        static void Changed(PlayModeStateChange state)
        {
            if(Application.isBatchMode&&!HeadlessTest)return;
            if(state==PlayModeStateChange.EnteredPlayMode)Start();
            if(state==PlayModeStateChange.ExitingPlayMode)Stop();
        }
        static void Start()
        {
            if(!EditorApplication.isPlaying||UnityEngine.Object.FindFirstObjectByType<NativeCampView>()==null)return;
            run=SessionState.GetString(RunKey,"");
            if(string.IsNullOrEmpty(run)||File.Exists(Path.Combine(run,"stop")))
            {
                var root=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
                var testData=HeadlessTest?SessionState.GetString("CampMind.EditorWorld.TestData",""):"";
                var controlsData=SessionState.GetString(ControlsDataKey,"");
                if(!string.IsNullOrEmpty(controlsData)){
                    var allowed=Path.GetFullPath(Path.Combine(root,"native","LocalData","free-camera-controls"))+Path.DirectorySeparatorChar;
                    testData=Path.GetFullPath(controlsData);if(!testData.StartsWith(allowed,StringComparison.OrdinalIgnoreCase)||!File.Exists(Path.Combine(testData,"world.sqlite")))throw new InvalidOperationException("Controls audit requires an existing isolated fixture.");
                }
                if(HeadlessTest&&string.IsNullOrEmpty(testData)){UnityEngine.Debug.LogError("Editor world smoke requires isolated test data");return;}
                run=Path.Combine(root,"native","Artifacts","editor-play",Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(run);
                SessionState.SetString(RunKey,run);
                try
                {
                    var info=new ProcessStartInfo {
                        FileName=EditorPrefs.GetString("CampMind.NodeExecutable","node"),
                        Arguments="\""+Path.Combine(root,"scripts","unity","editor-world-host.mjs")+"\" --run \""+run+"\" --owner "+Process.GetCurrentProcess().Id,
                        WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true
                    };
                    var newMap=UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>()!=null;
                    if(newMap)info.Arguments+=" --layout new-world-v1";
                    if(!string.IsNullOrEmpty(testData))info.Arguments+=" --data \""+testData+"\"";
                    else if(newMap)info.Arguments+=" --data \""+Path.Combine(root,"native","LocalData","editor-new-world-v1")+"\"";
                    if(!string.IsNullOrEmpty(controlsData)){info.Arguments+=" --offline";info.Environment["CAMP_VILLAGE_OFFLINE_PROGRESS"]="0";}
                    using(var process=Process.Start(info)) { }
                }
                catch(Exception e){Stop();UnityEngine.Debug.LogError("营地世界启动失败："+e.Message);return;}
            }
            deadline=EditorApplication.timeSinceStartup+40;
            EditorApplication.update-=Poll;
            EditorApplication.update+=Poll;
        }
        static void Poll()
        {
            if(!EditorApplication.isPlaying){Stop();return;}
            var readyPath=Path.Combine(run,"ready.json");
            try
            {
                if(File.Exists(readyPath))
                {
                    var ready=JsonUtility.FromJson<Ready>(File.ReadAllText(readyPath));
                    if(ready.owner!=Process.GetCurrentProcess().Id)throw new InvalidOperationException("世界服务所有者不匹配");
                    var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();
                    if(view==null){Stop();return;}
                    view.ConnectAuthority(ready.endpoint,ready.player);
                    EditorApplication.update-=Poll;
                    UnityEngine.Debug.Log("营地编辑器世界已连接（独立存档）");
                    return;
                }
                var errorPath=Path.Combine(run,"error.json");
                if(File.Exists(errorPath))throw new InvalidOperationException(JsonUtility.FromJson<Failure>(File.ReadAllText(errorPath)).error);
                if(EditorApplication.timeSinceStartup>deadline)throw new TimeoutException("世界服务启动超时");
            }
            catch(IOException){ /* Receipt is being written; retry on the next Editor update. */ }
            catch(Exception e){Stop();UnityEngine.Debug.LogError("营地世界连接失败："+e.Message);}
        }
        static void Stop()
        {
            EditorApplication.update-=Poll;
            run=run??SessionState.GetString(RunKey,"");
            if(!string.IsNullOrEmpty(run))
            {
                try{File.WriteAllText(Path.Combine(run,"stop"),"");}
                catch(IOException e){UnityEngine.Debug.LogWarning("世界服务退出标记写入失败："+e.Message);}
            }
            SessionState.EraseString(RunKey);run=null;
        }
    }
}
