using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Debug=UnityEngine.Debug;
namespace CampMind.PixelWorld.Editor
{
    /// <summary>只管理自己启动的地图宿主；绝不按进程名结束Unity、Node或旧世界。</summary>
    [InitializeOnLoad]
    public static class PixelWorldEditor
    {
        const string Prefix="CampMind.PixelWorld.Owner.";
        static string Root=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        static string Local=>Path.Combine(Root,"native/LocalData/pixel-world-v1");
        static double nextRequestCheck;
        static PixelWorldEditor()
        {
            EditorApplication.playModeStateChanged+=OnPlay;
            EditorApplication.quitting+=StopOwned;
            EditorApplication.update+=CheckOpenRequest;
        }
        public const string ScenePath="Assets/CampMind/PixelWorld/PixelGame.unity";
        [MenuItem("CampMind/打开游戏")]
        public static void OpenGame()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode){Debug.LogWarning("请先停止当前Play，再打开游戏场景。");return;}
            if(!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
            if(!File.Exists(ScenePath))throw new FileNotFoundException("二维游戏场景缺失，请同步完整main分支。",ScenePath);
            EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            Debug.Log("已打开默认二维游戏场景。NPC、MLP和生产迁移尚未完成；旧玩法存档保留。");
        }
        [Serializable] sealed class Ready {public string unity,scene;public bool loaded,batchMode;public int pid;}
        // 保持原启动器的回执约定，改用正式二维场景。
        public static void OpenFromLauncher()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"-campmind-editor-ready");
            if(i<0||i+1>=args.Length)throw new ArgumentException("缺少编辑器启动回执路径");
            string receipt=Path.GetFullPath(args[i+1]),artifacts=Path.GetFullPath(Path.Combine(Root,"native/Artifacts"));
            if(!receipt.StartsWith(artifacts+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("回执必须位于native/Artifacts");
            string request=Path.Combine(Local,"open-editor.request");if(File.Exists(request))File.Delete(request);
            OpenGame();
            var scene=EditorSceneManager.GetActiveScene();
            Directory.CreateDirectory(Path.GetDirectoryName(receipt));
            File.WriteAllText(receipt,JsonUtility.ToJson(new Ready{unity=Application.unityVersion,scene=scene.path,loaded=scene.isLoaded&&scene.path==ScenePath,batchMode=Application.isBatchMode,pid=Process.GetCurrentProcess().Id},true));
        }
        static void CheckOpenRequest()
        {
            if(Application.isBatchMode||BuildPipeline.isBuildingPlayer)return;
            if(EditorApplication.timeSinceStartup<nextRequestCheck)return;nextRequestCheck=EditorApplication.timeSinceStartup+1;
            if(EditorApplication.timeSinceStartup<8||EditorApplication.isCompiling||EditorApplication.isUpdating||EditorApplication.isPlayingOrWillChangePlaymode)return;
            var file=Path.Combine(Local,"open-editor.request");if(!File.Exists(file))return;
            var age=DateTime.UtcNow-File.GetLastWriteTimeUtc(file);File.Delete(file);
            if(age.TotalMinutes>10)return;
            OpenGame();
        }
        static void OnPlay(PlayModeStateChange state)
        {
            if(state==PlayModeStateChange.ExitingEditMode&&UnityEngine.Object.FindFirstObjectByType<PixelWorldView>()!=null){
                try{StartOwned();}catch(Exception e){EditorApplication.isPlaying=false;Debug.LogError("二维游戏宿主启动失败："+e.Message);}
            }
            if(state==PlayModeStateChange.ExitingPlayMode||state==PlayModeStateChange.EnteredEditMode)StopOwned();
        }
        static string Quote(string value){if(value.Contains("\""))throw new ArgumentException("路径不能含引号");return"\""+value+"\"";}
        static void StartOwned()
        {
            StopOwned();Directory.CreateDirectory(Local);
            string connection=Path.Combine(Local,"editor-"+Guid.NewGuid().ToString("N")+".json");
            string node=Environment.GetEnvironmentVariable("CAMP_PIXEL_NODE");if(string.IsNullOrWhiteSpace(node))node="node";
            var start=new ProcessStartInfo{
                FileName=node,WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true,
                Arguments=Quote(Path.Combine(Root,"scripts/pixel-world/server.mjs"))+" --db "+Quote(Path.Combine(Local,"world.sqlite"))+" --connection-file "+Quote(connection)+" --parent-pid "+Process.GetCurrentProcess().Id
            };
            var process=Process.Start(start);if(process==null)throw new InvalidOperationException("Node进程未创建");
            SessionState.SetInt(Prefix+"pid",process.Id);SessionState.SetString(Prefix+"started",process.StartTime.ToUniversalTime().Ticks.ToString());
            SessionState.SetString(Prefix+"connection",connection);Environment.SetEnvironmentVariable("CAMP_PIXEL_CONNECTION",connection);process.Dispose();
        }
        static void StopOwned()
        {
            int pid=SessionState.GetInt(Prefix+"pid",0);string start=SessionState.GetString(Prefix+"started",""),file=SessionState.GetString(Prefix+"connection","");
            SessionState.EraseInt(Prefix+"pid");SessionState.EraseString(Prefix+"started");SessionState.EraseString(Prefix+"connection");
            if(pid<=0)return;
            try{
                using(var process=Process.GetProcessById(pid)){
                    if(process.StartTime.ToUniversalTime().Ticks.ToString()!=start)return; // 防止PID重用误杀其他进程。
                    if(File.Exists(file)){
                        try{
                            var c=JsonUtility.FromJson<PixelConnection>(File.ReadAllText(file));PixelProtocol.ValidateConnection(c);
                            if(c.pid==pid){
                                var request=(HttpWebRequest)WebRequest.Create(c.endpoint+"/shutdown");request.Proxy=null;request.Method="POST";request.ContentType="application/json";request.Headers["x-pixel-token"]=c.token;request.Timeout=800;request.ReadWriteTimeout=800;
                                var bytes=Encoding.UTF8.GetBytes("{}");request.ContentLength=bytes.Length;using(var stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);using(var response=request.GetResponse()){}
                            }
                        }catch{/* 本次宿主不可响应时才进入有界退出后备。 */}
                    }
                    if(!process.WaitForExit(1200))process.Kill();
                }
            }catch(ArgumentException){/* 所属进程已经退出。 */}
            catch(Exception e){Debug.LogWarning("地图宿主退出检查："+e.Message);}
            finally{if(Environment.GetEnvironmentVariable("CAMP_PIXEL_CONNECTION")==file)Environment.SetEnvironmentVariable("CAMP_PIXEL_CONNECTION",null);}
        }
    }
}
