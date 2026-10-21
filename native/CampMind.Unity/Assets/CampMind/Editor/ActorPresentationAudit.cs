using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CampMind.Presentation;

namespace CampMind.Editor
{
    public static class ActorPresentationAudit
    {
        static JArray V(Vector3 p)=>new JArray(p.x,p.y,p.z);
        public static void Audit()
        {
            var args=Environment.GetCommandLineArgs();var index=Array.IndexOf(args,"-actor-audit-output");
            var output=Path.GetFullPath(args[index+1]);Directory.CreateDirectory(output);
            EditorSceneManager.OpenScene("Assets/CampMind/NewWorldGame/Camp.unity");Physics.SyncTransforms();
            var view=UnityEngine.Object.FindFirstObjectByType<NativeCampView>();var report=new JArray();
            foreach(var actor in view.characters)
            {
                var animator=actor.GetComponentInChildren<Animator>();var clip=animator.runtimeAnimatorController.animationClips.First(c=>c.name=="Walk");
                var poses=new JArray();
                foreach(var phase in new[]{0f,.125f,.25f,.5f,.75f})
                {
                    clip.SampleAnimation(animator.gameObject,clip.length*phase);
                    NativeCampView.FaceMovement(actor,Vector3.forward);view.GroundActor(actor);
                    var mesh=new Mesh();var first=true;var b=new Bounds();
                    foreach(var skin in actor.GetComponentsInChildren<SkinnedMeshRenderer>())
                    {
                        skin.BakeMesh(mesh);foreach(var p in mesh.vertices){var world=skin.transform.TransformPoint(p);if(first){b=new Bounds(world,Vector3.zero);first=false;}else b.Encapsulate(world);}mesh.Clear();
                    }
                    UnityEngine.Object.DestroyImmediate(mesh);
                    var hits=Physics.RaycastAll(actor.position+Vector3.up*500,Vector3.down,1000,~0,QueryTriggerInteraction.Ignore).OrderByDescending(h=>h.point.y).ToArray();
                    var details=new JArray();foreach(var skin in actor.GetComponentsInChildren<SkinnedMeshRenderer>()){
                        var baked=new Mesh();skin.BakeMesh(baked,false);var falseBounds=baked.bounds;skin.BakeMesh(baked,true);
                        var vertices=skin.sharedMesh.vertices;var weights=skin.sharedMesh.boneWeights;var binds=skin.sharedMesh.bindposes;var matrices=skin.bones.Select((bone,i)=>bone.localToWorldMatrix*binds[i]).ToArray();var cpu=new Bounds();var trueWorld=new Bounds();
                        for(int vi=0;vi<vertices.Length;vi++){var w=weights[vi];var p=matrices[w.boneIndex0].MultiplyPoint3x4(vertices[vi])*w.weight0+matrices[w.boneIndex1].MultiplyPoint3x4(vertices[vi])*w.weight1+matrices[w.boneIndex2].MultiplyPoint3x4(vertices[vi])*w.weight2+matrices[w.boneIndex3].MultiplyPoint3x4(vertices[vi])*w.weight3;if(vi==0)cpu=new Bounds(p,Vector3.zero);else cpu.Encapsulate(p);}
                        var bv=baked.vertices;for(int vi=0;vi<bv.Length;vi++){var p=skin.transform.TransformPoint(bv[vi]);if(vi==0)trueWorld=new Bounds(p,Vector3.zero);else trueWorld.Encapsulate(p);}
                        details.Add(new JObject{["name"]=skin.name,["cpuWorldMin"]=V(cpu.min),["cpuWorldMax"]=V(cpu.max),["trueWorldMin"]=V(trueWorld.min),["trueWorldMax"]=V(trueWorld.max),["rendererMin"]=V(skin.bounds.min),["rendererMax"]=V(skin.bounds.max),["localBoundsMin"]=V(skin.localBounds.min),["localBoundsMax"]=V(skin.localBounds.max),["bakedFalseMin"]=V(falseBounds.min),["bakedFalseMax"]=V(falseBounds.max),["bakedTrueMin"]=V(baked.bounds.min),["bakedTrueMax"]=V(baked.bounds.max)});UnityEngine.Object.DestroyImmediate(baked);
                    }
                    poses.Add(new JObject{["phase"]=phase,["meshMin"]=V(b.min),["meshMax"]=V(b.max),["skins"]=details,["root"]=V(actor.position),["floors"]=new JArray(hits.Take(12).Select(h=>new JObject{["name"]=h.collider.name,["layer"]=h.collider.gameObject.layer,["y"]=h.point.y,["normal"]=V(h.normal)}))});
                }
                var hierarchy=new JArray(actor.GetComponentsInChildren<Transform>().Where(t=>t==actor||t.GetComponent<Animator>()||t.GetComponent<SkinnedMeshRenderer>()||t.name.Contains("Foot")||t.name=="Head"||t.name=="Root"||t.name=="Asset fit"||t.name=="Restore logical X").Select(t=>new JObject{["name"]=t.name,["parent"]=t.parent?.name,["worldPosition"]=V(t.position),["localPosition"]=V(t.localPosition),["localEuler"]=V(t.localEulerAngles),["scale"]=V(t.localScale),["lossyScale"]=V(t.lossyScale)}));
                report.Add(new JObject{["actor"]=actor.name,["poses"]=poses,["hierarchy"]=hierarchy});
            }
            File.WriteAllText(Path.Combine(output,"audit.json"),report.ToString());
            var spawn=view.lord.position;var camera=view.viewCamera;camera.orthographic=false;camera.fieldOfView=38;camera.nearClipPlane=.05f;
            foreach(var actor in view.characters)actor.gameObject.SetActive(false);
            foreach(var actor in new[]{view.lord,view.characters.First(a=>a!=view.lord)})
            {
                actor.gameObject.SetActive(true);actor.position=spawn;NativeCampView.FaceMovement(actor,Vector3.forward);
                var animator=actor.GetComponentInChildren<Animator>();var clip=animator.runtimeAnimatorController.animationClips.First(c=>c.name=="Walk");clip.SampleAnimation(animator.gameObject,clip.length*.25f);
                view.GroundActor(actor);camera.transform.position=spawn+new Vector3(4,3.5f,6);camera.transform.LookAt(spawn+Vector3.up);
                Capture(camera,Path.Combine(output,actor.name+"-toward-positive-z.png"));actor.gameObject.SetActive(false);
            }
        }
        static void Capture(Camera camera,string path)
        {
            var texture=new RenderTexture(1024,1024,24);camera.targetTexture=texture;camera.Render();RenderTexture.active=texture;
            var pixels=new Texture2D(1024,1024,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,1024,1024),0,0);pixels.Apply();File.WriteAllBytes(path,pixels.EncodeToPNG());
            camera.targetTexture=null;RenderTexture.active=null;UnityEngine.Object.DestroyImmediate(pixels);UnityEngine.Object.DestroyImmediate(texture);
        }
    }
}
