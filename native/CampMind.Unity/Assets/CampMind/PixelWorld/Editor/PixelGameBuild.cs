using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace CampMind.PixelWorld.Editor
{
    /// <summary>默认Windows二维客户端构建；只编译像素场景，不将旧3D场景混入启动列表。</summary>
    public static class PixelGameBuild
    {
        [Serializable] sealed class Report
        {
            public bool success;
            public string backend="IL2CPP",scene=PixelWorldEditor.ScenePath,executable,sourceHash,error;
            public int errors,warnings;
        }
        static string Argument(string key)
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,key);
            if(i<0||i+1>=args.Length)throw new ArgumentException("缺少构建参数："+key);
            return args[i+1];
        }
        public static void Build()
        {
            string root=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
            string builds=Path.GetFullPath(Path.Combine(root,"native/Builds"))+Path.DirectorySeparatorChar;
            string output=Path.GetFullPath(Argument("-pixel-build-output"));
            string reportFile=Path.GetFullPath(Argument("-pixel-build-report"));
            string artifacts=Path.GetFullPath(Path.Combine(root,"native/Artifacts"))+Path.DirectorySeparatorChar;
            if(!output.StartsWith(builds,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(output)!="CampMind.exe")throw new ArgumentException("构建输出必须位于本工程native/Builds");
            if(!reportFile.StartsWith(artifacts,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("构建报告必须位于本工程native/Artifacts");
            var result=new Report{executable=output,sourceHash=Argument("-pixel-source-hash")};
            try
            {
                if(!File.Exists(PixelWorldEditor.ScenePath))throw new FileNotFoundException("缺少正式二维场景",PixelWorldEditor.ScenePath);
                EditorSceneManager.OpenScene(PixelWorldEditor.ScenePath,OpenSceneMode.Single);
                if(UnityEngine.Object.FindObjectsByType<PixelWorldView>(FindObjectsSortMode.None).Length!=1)throw new InvalidOperationException("正式场景必须恰好包含一个二维世界客户端");
                EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(PixelWorldEditor.ScenePath,true)};
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,ScriptingImplementation.IL2CPP);
                Directory.CreateDirectory(Path.GetDirectoryName(output));
                var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{PixelWorldEditor.ScenePath},locationPathName=output,target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
                result.errors=(int)report.summary.totalErrors;result.warnings=(int)report.summary.totalWarnings;
                result.success=report.summary.result==BuildResult.Succeeded&&File.Exists(output);
                if(!result.success)result.error="Unity构建未成功："+report.summary.result;
            }
            catch(Exception error){result.success=false;result.error=error.ToString();}
            Directory.CreateDirectory(Path.GetDirectoryName(reportFile));File.WriteAllText(reportFile,JsonUtility.ToJson(result,true));
            if(!result.success){Debug.LogError(result.error);EditorApplication.Exit(1);}
            else Debug.Log("二维客户端编译完成；这不代表实机画面或完整玩法已经验收。");
        }
    }
}
