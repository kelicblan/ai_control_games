using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace CampMind.PixelWorld.Editor
{
    public static class TinySwordsImport
    {
        const string Source="Assets/ThirdParty/TinySwords/Tiny Swords (Free Pack)/";
        const string Output="Assets/CampMind/PixelWorld/Resources/PixelWorld/TinySwords.asset";
        static Texture2D Texture(string relative)
        {
            var path=relative.StartsWith("Assets/")?relative:Source+relative;var importer=AssetImporter.GetAtPath(path) as TextureImporter;
            if(importer==null)throw new FileNotFoundException("缺少TinySwords素材",path);
            if(!importer.isReadable||importer.filterMode!=FilterMode.Point||importer.textureCompression!=TextureImporterCompression.Uncompressed||importer.mipmapEnabled){
                importer.isReadable=true;importer.filterMode=FilterMode.Point;importer.mipmapEnabled=false;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
        [MenuItem("CampMind/二维地图/准备TinySwords素材")]
        public static void Prepare()
        {
            var library=AssetDatabase.LoadAssetAtPath<TinySwordsLibrary>(Output);
            if(library==null){library=ScriptableObject.CreateInstance<TinySwordsLibrary>();AssetDatabase.CreateAsset(library,Output);}
            library.terrain=new[]{Texture("Terrain/Tileset/Tilemap_color2.png"),Texture("Terrain/Tileset/Tilemap_color3.png"),Texture("Terrain/Tileset/Tilemap_color4.png")};
            var entries=new List<TinySwordsLibrary.Entry>();
            void Add(string kind,string file,int frames=1)=>entries.Add(new TinySwordsLibrary.Entry{kind=kind,texture=Texture(file),frames=frames});
            Add("pine","Terrain/Resources/Wood/Trees/Tree1.png",8);
            Add("oak","Terrain/Resources/Wood/Trees/Tree3.png",8);
            Add("ornamental-tree","Terrain/Resources/Wood/Trees/Tree4.png",8);
            Add("scenery-tree","Terrain/Resources/Wood/Trees/Tree3.png",8);
            Add("scenery-tree-gold","Terrain/Resources/Wood/Trees/Tree4.png",8);
            Add("scenery-pine","Terrain/Resources/Wood/Trees/Tree1.png",8);
            Add("bush","Terrain/Decorations/Bushes/Bushe1.png",8);
            Add("berry","Terrain/Decorations/Bushes/Bushe3.png",8);
            Add("rock","Terrain/Decorations/Rocks/Rock1.png");
            Add("ornamental-rock","Terrain/Decorations/Rocks/Rock3.png");
            Add("goldore","Terrain/Resources/Gold/Gold Stones/Gold Stone 2.png");
            Add("stump","Terrain/Resources/Wood/Trees/Stump 1.png");
            Add("fire-flame","Particle FX/Fire_01.png",8);
            var architecture=Texture("Assets/CampMind/PixelWorld/Resources/PixelWorld/ReferenceVillageAtlas-v2.png");
            void Crop(string kind,Texture2D texture,float left,float top,float right,float bottom){
                int x=Mathf.RoundToInt(left*texture.width),y=Mathf.RoundToInt(top*texture.height);
                entries.Add(new TinySwordsLibrary.Entry{kind=kind,texture=texture,cropX=x,cropY=y,cropWidth=Mathf.RoundToInt(right*texture.width)-x,cropHeight=Mathf.RoundToInt(bottom*texture.height)-y});
            }
            Crop("hall",architecture,0,0,.30f,.455f);
            Crop("house",architecture,.30f,0,.52f,.455f);
            Crop("house-alt",architecture,.52f,0,.76f,.455f);
            Crop("workshop",architecture,.76f,0,1,.455f);
            Crop("storehouse",architecture,0,.455f,.29f,1);
            Crop("gate-open",architecture,.29f,.455f,.59f,1);
            Crop("gate-closed",architecture,.29f,.455f,.59f,1);
            Crop("well",architecture,.59f,.455f,.80f,1);
            Crop("tower",architecture,.80f,.455f,1,1);
            var mountains=Texture("Assets/CampMind/PixelWorld/Resources/PixelWorld/ReferenceMountainsAtlas-v2.png");
            Crop("mountain-peak",mountains,0,0,1f/3,1);
            Crop("mountain-ridge",mountains,1f/3,0,2f/3,1);
            Crop("snow-peak",mountains,2f/3,0,1,1);
            Add("lord-idle","Units/Blue Units/Pawn/Pawn_Idle.png",8);
            Add("lord-run","Units/Blue Units/Pawn/Pawn_Run.png",6);
            library.entries=entries.ToArray();EditorUtility.SetDirty(library);AssetDatabase.SaveAssets();
            Debug.Log("TinySwords素材引用与可读图集已准备："+entries.Count);
        }
    }
}
