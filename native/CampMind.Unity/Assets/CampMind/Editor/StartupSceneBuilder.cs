using System.IO;
using System.Linq;
using CampMind.Presentation;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CampMind.Editor
{
    public static class StartupSceneBuilder
    {
        public const string ScenePath="Assets/CampMind/Scenes/Startup.unity";
        public static void Build()
        {
            AssetDatabase.Refresh();
            const string logoPath="Assets/Resources/Branding/logo.png";
            var importer=(TextureImporter)AssetImporter.GetAtPath(logoPath);
            importer.textureType=TextureImporterType.Default;importer.alphaIsTransparency=true;importer.mipmapEnabled=false;importer.SaveAndReimport();
            var wordmark=AssetImporter.GetAtPath("Assets/Resources/Branding/startup-wordmark.png") as TextureImporter;
            if(wordmark!=null){wordmark.alphaIsTransparency=true;wordmark.mipmapEnabled=false;wordmark.textureCompression=TextureImporterCompression.Uncompressed;wordmark.SaveAndReimport();}
            const string iconPath="Assets/Resources/Branding/app-icon-gold.png";
            var iconImporter=(TextureImporter)AssetImporter.GetAtPath(iconPath);
            iconImporter.alphaIsTransparency=true;iconImporter.mipmapEnabled=false;iconImporter.textureCompression=TextureImporterCompression.Uncompressed;iconImporter.SaveAndReimport();
            var logo=AssetDatabase.LoadAssetAtPath<Texture2D>(iconPath);
            var iconSizes=PlayerSettings.GetIconSizes(NamedBuildTarget.Standalone,IconKind.Any);
            PlayerSettings.SetIcons(NamedBuildTarget.Standalone,iconSizes.Select(_=>logo).ToArray(),IconKind.Any);
            PlayerSettings.SplashScreen.show=false;
            PlayerSettings.SplashScreen.showUnityLogo=false;
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            new GameObject("游戏启动视频").AddComponent<NativeStartup>();
            EditorSceneManager.SaveScene(scene,ScenePath);AssetDatabase.SaveAssets();
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true),new EditorBuildSettingsScene("Assets/CampMind/Scenes/Camp.unity",true)};
        }
    }
}
