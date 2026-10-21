using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldShoreBuilder
    {
        public static JObject Build(Camera camera,JObject layout)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(NewWorldCalibrationBuilder.Folder+"/Models/terrain/terrain-base.glb");var filter=source.GetComponentInChildren<MeshFilter>();var variants=new Mesh[3];
            var centers=new[]{new Vector2(.28f,.24f),new Vector2(.30f,.16f),new Vector2(.20f,.32f)};
            for(int i=0;i<variants.Length;i++){
                var keep=new Bounds(new Vector3(centers[i].x,-.02f,centers[i].y),new Vector3(.09f,.16f,.11f));var mesh=NewWorldSourceModules.KeepBounds(filter.sharedMesh,keep);string path=NewWorldCalibrationBuilder.Folder+"/shore-source-fragment-"+i+".asset";var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(previous){EditorUtility.CopySerialized(mesh,previous);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);variants[i]=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            }
            Vector3 At(JToken p)=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),0);
            var outer=layout["river"]["outerBank"].Select(At).ToArray();var village=layout["river"]["villageBank"].Select(At).ToArray();int count=0;
            for(int i=1;i<outer.Length;i++){
                var a=outer[i-1];var b=outer[i];var direction=b-a;float length=direction.magnitude;if(length<.1f)continue;direction/=length;var at=(a+b)*.5f;var toward=village.OrderBy(p=>Vector3.SqrMagnitude(p-at)).First()-at;var right=Vector3.Cross(Vector3.up,direction);if(Vector3.Dot(right,toward)<0)direction=-direction;var rotation=Quaternion.LookRotation(direction);int variant=(i-1)%3;float scale=length/.11f;
                var origin=new Vector3(centers[variant].x-.015f,-.004f,centers[variant].y);var go=new GameObject("Observed outer shore source rock strip "+count++);go.transform.SetPositionAndRotation(at-rotation*(origin*scale),rotation);go.transform.localScale=Vector3.one*scale;go.AddComponent<MeshFilter>().sharedMesh=variants[variant];go.AddComponent<MeshRenderer>().sharedMaterials=filter.GetComponent<Renderer>().sharedMaterials;
            }
            return new JObject{["segments"]=count,["source"]="Approved terrain source, local rock-edge fragments",["policy"]="Source UV and original GLB preserved; observed outer river bank constrains placement; exact small rock shape and hidden clipping inferred; existing shore collision retained",["accepted"]=false};
        }
    }
}
