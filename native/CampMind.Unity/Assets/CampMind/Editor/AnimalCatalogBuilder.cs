using System.IO;
using UnityEditor;
using UnityEngine;
namespace CampMind.Editor
{
    public static class AnimalCatalogBuilder
    {
        public static void Build()
        {
            const string folder="Assets/CampMind/Resources/Animals";Directory.CreateDirectory(folder);
            foreach(var species in new[]{"Bear","Boar","Deer","Pheasant","Rabbit","Tiger"}){
                var source=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/CampMind/Content/Animals/"+species+"/"+species+".prefab");
                if(source==null)throw new FileNotFoundException("Missing audited animal prefab: "+species);
                var root=new GameObject(species);var child=(GameObject)PrefabUtility.InstantiatePrefab(source);child.transform.SetParent(root.transform,false);
                PrefabUtility.SaveAsPrefabAsset(root,folder+"/"+species+".prefab");Object.DestroyImmediate(root);
            }
            AssetDatabase.SaveAssets();AssetDatabase.Refresh();
        }
    }
}
