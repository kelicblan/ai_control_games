using System;
using System.IO;
using System.Diagnostics;
using CampMind.Presentation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Newtonsoft.Json.Linq;
namespace CampMind.Editor
{
    [InitializeOnLoad]
    public static class EditorPlaySmoke
    {
        const string Phase="CampMind.EditorSmoke.Phase",Deadline="CampMind.EditorSmoke.Deadline";
        static string DirectoryName
        {
            get{var args=Environment.GetCommandLineArgs();var index=Array.IndexOf(args,"-campmind-editor-world-smoke");return index>=0&&index+1<args.Length?Path.GetFullPath(args[index+1]):null;}
        }
        static EditorPlaySmoke(){if(DirectoryName!=null)EditorApplication.update+=Tick;}
        public static void Run()
        {
            var directory=DirectoryName??throw new ArgumentException("Missing Editor Play smoke directory");
            var allowed=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Artifacts/editor-play-smoke"))+Path.DirectorySeparatorChar;
            if(!directory.StartsWith(allowed,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Smoke must use native/Artifacts/editor-play-smoke");
            var data=Path.GetFullPath(Path.Combine(Application.dataPath,"../../LocalData/editor-play-smoke",Path.GetFileName(directory)));
            SessionState.SetString("CampMind.EditorWorld.TestData",data);
            SessionState.SetString(Deadline,DateTime.UtcNow.AddSeconds(120).Ticks.ToString());SessionState.SetString(Phase,"starting");
            EditorSceneManager.OpenScene("Assets/CampMind/Scenes/Camp.unity");EditorApplication.isPlaying=true;
        }
        static void Tick()
        {
            var phase=SessionState.GetString(Phase,"");if(string.IsNullOrEmpty(phase))return;
            try
            {
                if(DateTime.UtcNow.Ticks>long.Parse(SessionState.GetString(Deadline,"0")))throw new TimeoutException("Editor Play world lifecycle timed out at "+phase);
                if(phase=="starting"&&EditorApplication.isPlaying)
                {
                    var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();
                    if(view?.Authority?.ReadyForActions!=true)return;
                    if(view.World!=null)throw new InvalidOperationException("Smoke world was not isolated and empty");
                    view.Authority.Enqueue(new JObject{["type"]="start",["options"]=new JObject{["seed"]=17,["mode"]= "rules"}});SessionState.SetString(Phase,"worldstarting");
                }
                else if(phase=="worldstarting")
                {
                    var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();if(view?.World==null)return;
                    var count=((JArray)view.World["npcs"]).Count;if(count!=9)throw new InvalidOperationException("Editor world roster mismatch");
                    if(view.GetComponent<NativeGameUi>()==null)throw new InvalidOperationException("Editor Play did not create native UI");
                    var run=SessionState.GetString("CampMind.EditorWorld.Run","");
                    var ready=JObject.Parse(File.ReadAllText(Path.Combine(run,"ready.json")));
                    File.WriteAllText(Path.Combine(DirectoryName,"checkpoint.json"),new JObject{["npcCount"]=count,["scope"]=view.Authority.gate.Scope,["serverPid"]=ready["pid"],["worldData"]=SessionState.GetString("CampMind.EditorWorld.TestData","")}.ToString());
                    SessionState.SetString("CampMind.EditorSmoke.ObserveAt",DateTime.UtcNow.Ticks.ToString());
                    SessionState.SetString("CampMind.EditorSmoke.Elapsed",((double)view.World["elapsed"]).ToString(System.Globalization.CultureInfo.InvariantCulture));
                    SessionState.SetString(Phase,"observing");
                }
                else if(phase=="observing")
                {
                    var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();
                    var seconds=TimeSpan.FromTicks(DateTime.UtcNow.Ticks-long.Parse(SessionState.GetString("CampMind.EditorSmoke.ObserveAt","0"))).TotalSeconds;
                    if(seconds<5)return;
                    var elapsed=(double)view.World["elapsed"]-double.Parse(SessionState.GetString("CampMind.EditorSmoke.Elapsed","0"),System.Globalization.CultureInfo.InvariantCulture);
                    if(elapsed>seconds+1||elapsed<seconds-2)throw new InvalidOperationException($"Editor 1x time mismatch: {elapsed} game seconds / {seconds} wall seconds");
                    Canvas.ForceUpdateCanvases();var surfaces=view.GetComponent<NativeGameUi>().Canvas.GetComponentsInChildren<NativeUiSurface>();var rendered=0;
                    foreach(var surface in surfaces){var renderer=surface.GetComponent<CanvasRenderer>();if(renderer==null)throw new InvalidOperationException("Editor background missing CanvasRenderer");var mesh=renderer.GetMesh();if(mesh!=null&&mesh.vertexCount>0)rendered++;}
                    if(rendered<20)throw new InvalidOperationException("Editor background meshes were not submitted: "+rendered);
                    var result=JObject.Parse(File.ReadAllText(Path.Combine(DirectoryName,"checkpoint.json")));result["gameSeconds"]=elapsed;result["wallSeconds"]=seconds;result["renderedBackgrounds"]=rendered;File.WriteAllText(Path.Combine(DirectoryName,"checkpoint.json"),result.ToString());
                    SessionState.SetString(Phase,"stopping");EditorApplication.isPlaying=false;
                }
                else if(phase=="stopping"&&!EditorApplication.isPlaying&&!EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    var result=JObject.Parse(File.ReadAllText(Path.Combine(DirectoryName,"checkpoint.json")));
                    try{using(var process=Process.GetProcessById((int)result["serverPid"]))if(!process.HasExited)return;}catch(ArgumentException){}
                    result["success"]=true;result["serverStopped"]=true;result["kind"]="actual-editor-play-owned-world-lifecycle";
                    File.WriteAllText(Path.Combine(DirectoryName,"result.json"),result.ToString());SessionState.EraseString(Phase);SessionState.EraseString("CampMind.EditorWorld.TestData");EditorApplication.Exit(0);
                }
            }
            catch(Exception e)
            {
                File.WriteAllText(Path.Combine(DirectoryName,"result.json"),new JObject{["success"]=false,["error"]=e.Message}.ToString());SessionState.EraseString(Phase);UnityEngine.Debug.LogError(e);EditorApplication.Exit(2);
            }
        }
    }
}
