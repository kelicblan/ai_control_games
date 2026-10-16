using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace CampMind.Editor
{
    public static class BuildEntry
    {
        private const string SmokeScene = "Assets/CampMind/Scenes/CompatibilitySmoke.unity";
        private static string Argument(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs(); var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        public static void BuildCompatibilitySmoke()
        {
            var camp = Argument("-campmind-scene", "Compatibility") == "Camp";
            if (camp) CampSceneBuilder.BuildScene();
            var repository = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
            var buildRoot = Path.Combine(repository, "native", "Builds") + Path.DirectorySeparatorChar;
            var output = Path.GetFullPath(Argument("-campmind-build-output", Path.Combine(buildRoot, "Smoke", "CompatibilitySmoke.exe")));
            if (!output.StartsWith(buildRoot, StringComparison.OrdinalIgnoreCase) || Path.GetExtension(output).ToLowerInvariant() != ".exe")
                throw new InvalidOperationException("Build output must be an executable under native/Builds");
            var backend = Argument("-campmind-backend", "IL2CPP");
            if (backend != "IL2CPP" && backend != "Mono") throw new InvalidOperationException("Unknown scripting backend");
            if (!File.Exists(SmokeScene))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SmokeScene));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var camera = new GameObject("Compatibility Smoke Camera").AddComponent<Camera>();
                camera.backgroundColor = new Color(.08f, .12f, .15f); camera.clearFlags = CameraClearFlags.SolidColor;
                EditorSceneManager.SaveScene(scene, SmokeScene);
            }
            PlayerSettings.companyName = "CampMind";
            PlayerSettings.runInBackground = camp;
            PlayerSettings.enableFrameTimingStats=camp;
            PlayerSettings.productName = camp ? "CampMind Native Preview" : "CampMind Compatibility Smoke";
            PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, backend == "IL2CPP" ? ScriptingImplementation.IL2CPP : ScriptingImplementation.Mono2x);
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.Standalone, ManagedStrippingLevel.Low);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new[] { GraphicsDeviceType.Direct3D11 });
            var options = Argument("-campmind-configuration", "Release") == "Development" ? BuildOptions.Development : BuildOptions.None;
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            AssetDatabase.SaveAssets();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { camp ? "Assets/CampMind/Scenes/Camp.unity" : SmokeScene }, locationPathName = output, target = BuildTarget.StandaloneWindows64, options = options });
            if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Native smoke build failed: " + report.summary.result);
            Debug.Log("CampMind compatibility build succeeded: " + output);
        }
    }
}
