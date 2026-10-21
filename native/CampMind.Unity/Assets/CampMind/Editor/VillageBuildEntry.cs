using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
namespace CampMind.Editor
{
    // Builds saved scenes without saving or replacing the map author's open scene.
    public static class VillageBuildEntry
    {
        static string Repo => Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        static string Request => Path.Combine(Repo, "native/Artifacts/village-build.request");
        static bool busy;
        static double next;
        [InitializeOnLoadMethod] static void Initialize() { EditorApplication.update += Poll; }
        static void Poll()
        {
            if (busy || EditorApplication.timeSinceStartup < next || EditorApplication.isCompiling || EditorApplication.isUpdating || EditorApplication.isPlayingOrWillChangePlaymode || BuildPipeline.isBuildingPlayer) return;
            next = EditorApplication.timeSinceStartup + 2;
            if (!File.Exists(Request)) return;
            busy = true;
            try { Build(); File.Move(Request, Request + ".completed-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss")); }
            catch (Exception e) { File.WriteAllText(Request + ".error", e.ToString()); File.Move(Request, Request + ".failed-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss")); Debug.LogException(e); }
            finally { busy = false; }
        }
        [MenuItem("CampMind/一寨之主/构建玩法验证包")]
        public static void Build()
        {
            string scene = "Assets/CampMind/NewWorldGame/Camp.unity";
            if (!File.Exists(scene)) throw new FileNotFoundException("Saved shared map scene is required", scene);
            string root = Environment.GetEnvironmentVariable("CAMP_VILLAGE_LOCAL_BUILD")=="1"?Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CampMindBuilds")):Path.GetFullPath(Path.Combine(Repo, "native/Builds"));
            string folder = Path.GetFullPath(Path.Combine(root, "Village-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")));
            var reuse=Environment.GetEnvironmentVariable("CAMP_VILLAGE_REUSE_UNVERIFIED");
            if(!String.IsNullOrEmpty(reuse)){
                var requested=Path.GetFullPath(reuse);
                if(Environment.GetEnvironmentVariable("CAMP_VILLAGE_UI_PREVIEW_REUSE")=="1"){
                    var uiReceipt=JObject.Parse(File.ReadAllText(Path.Combine(Repo,"native/Artifacts/ui-unified/verification.json")));
                    if((bool?)uiReceipt["uiVerified"]!=true||requested!=Path.GetDirectoryName((string)uiReceipt["executable"])||!requested.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Environment.GetEnvironmentVariable("CAMP_VILLAGE_LOCAL_BUILD")!="1")throw new InvalidOperationException("Only this chat's local UI preview may be rebuilt in place");
                }else{
                    var pendingRecord=JObject.Parse(File.ReadAllText(Path.Combine(Repo,"native/Artifacts/village/P6/build.json")));
                    if((bool?)pendingRecord["modelsPending"]!=true||requested!=Path.GetDirectoryName((string)pendingRecord["executable"])||!requested.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Only the latest unverified build may be rebuilt in place");
                }
                folder=requested;
            }
            if (!folder.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Invalid build destination");
            Directory.CreateDirectory(folder);
            PlayerSettings.runInBackground = true;
            AnimalCatalogBuilder.Build();
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
            var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { "Assets/CampMind/Scenes/Startup.unity", scene }, locationPathName = Path.Combine(folder, "CampMind.exe"), target = BuildTarget.StandaloneWindows64, options = BuildOptions.None });
            var record = new JObject { ["success"] = result.summary.result == BuildResult.Succeeded, ["executable"] = Path.Combine(folder, "CampMind.exe"), ["errors"] = result.summary.totalErrors, ["warnings"] = result.summary.totalWarnings, ["builtUtc"] = DateTime.UtcNow.ToString("O"), ["modelsPending"] = true };
            Directory.CreateDirectory(Path.Combine(Repo, "native/Artifacts/village/P6"));
            File.WriteAllText(Path.Combine(Repo, "native/Artifacts/village/P6/build.json"), record.ToString());
            if (result.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Village build failed: " + result.summary.result);
            File.WriteAllText(Path.Combine(folder,"world-layout.json"),new JObject{["layout"]="new-world-v1",["scene"]=scene,["builtUtc"]=DateTime.UtcNow.ToString("O")}.ToString());
        }
    }
}
