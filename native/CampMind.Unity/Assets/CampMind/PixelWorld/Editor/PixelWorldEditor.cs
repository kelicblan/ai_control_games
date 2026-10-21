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
        static string Local=>Path.Combine(Root,"native/LocalData/pixel-map-preview");
        static double nextRequestCheck;
        static PixelWorldEditor()
        {
            EditorApplication.playModeStateChanged+=OnPlay;
            EditorApplication.quitting+=StopOwned;
            EditorApplication.update+=CheckOpenRequest;
        }
        [MenuItem("CampMind/二维像素地图/打开独立地图验收场景")]
        public static void OpenPreview()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode){Debug.LogWarning("请先停止当前Play，再打开二维地图验收场景。");return;}
            if(!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            new GameObject("一寨之主 · 二维像素地图").AddComponent<PixelWorldView>();
            Debug.Log("已打开独立二维地图场景。按Play启动；不会改变Camp.unity、正式入口、旧存档或模型。");
        }
        static void CheckOpenRequest()
        {
            if(EditorApplication.timeSinceStartup<nextRequestCheck)return;nextRequestCheck=EditorApplication.timeSinceStartup+1;
            if(EditorApplication.timeSinceStartup<8||EditorApplication.isCompiling||EditorApplication.isUpdating||EditorApplication.isPlayingOrWillChangePlaymode)return;
            var file=Path.Combine(Local,"open-editor.request");if(!File.Exists(file))return;
            var age=DateTime.UtcNow-File.GetLastWriteTimeUtc(file);File.Delete(file);
            if(age.TotalMinutes>10)return;
            OpenPreview();
        }
        static void OnPlay(PlayModeStateChange state)
        {
            if(state==PlayModeStateChange.ExitingEditMode&&UnityEngine.Object.FindFirstObjectByType<PixelWorldView>()!=null){
                try{StartOwned();}catch(Exception e){EditorApplication.isPlaying=false;Debug.LogError("二维地图宿主启动失败："+e.Message);}
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
                Arguments=Quote(Path.Combine(Root,"scripts/pixel-world/server.mjs"))+" --db "+Quote(Path.Combine(Local,"editor-world.sqlite"))+" --connection-file "+Quote(connection)+" --parent-pid "+Process.GetCurrentProcess().Id
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
