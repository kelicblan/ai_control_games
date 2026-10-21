using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Animations;
using UnityEngine;

namespace CampMind.Editor
{
    public static class WildlifeAssetAudit
    {
        static string AuditDirectory {
            get { var args=Environment.GetCommandLineArgs();var index=Array.IndexOf(args,"-wildlife-audit-root");return Path.GetFullPath(index>=0?args[index+1]:"../Artifacts/animals"); }
        }
        public static void FinalizeAssets(){RunAll();RenderAll();}
        public static void ValidateAll(){RunAll();VerifyControllers();RenderAll();}

        public static void VerifyControllers()
        {
            var reports=new JArray();
            foreach(var path in Directory.GetFiles("Assets/CampMind/Content/Animals","*.prefab",SearchOption.AllDirectories)){
                var instance=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path.Replace('\\','/')));
                try{
                    var animator=instance.GetComponentInChildren<Animator>();
                    if(!animator||!animator.runtimeAnimatorController)throw new Exception("Missing controller: "+path);
                    animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
                    var skins=instance.GetComponentsInChildren<SkinnedMeshRenderer>();
                    var clips=new JArray();
                    foreach(var clip in animator.runtimeAnimatorController.animationClips){
                        animator.Rebind();animator.Update(0);animator.Play(clip.name,0,0);animator.Update(0);
                        Vector3[] Points()=>skins.SelectMany(s=>{var mesh=new Mesh();s.BakeMesh(mesh);var p=mesh.vertices.Select(v=>s.transform.TransformPoint(v)).ToArray();UnityEngine.Object.DestroyImmediate(mesh);return p;}).ToArray();
                        var first=Points();animator.Update(clip.length*.25f);var next=Points();float moved=0;
                        for(int i=0;i<first.Length;i++)moved=Mathf.Max(moved,Vector3.Distance(first[i],next[i]));
                        if(!float.IsFinite(moved)||moved<.00001f)throw new Exception("Animator did not deform skin: "+path+" "+clip.name);
                        clips.Add(new JObject{["state"]=clip.name,["maxVertexMovement"]=moved});
                    }
                    reports.Add(new JObject{["prefab"]=path.Replace('\\','/'),["states"]=clips,["passed"]=true});
                }finally{UnityEngine.Object.DestroyImmediate(instance);}
            }
            if(reports.Count!=7)throw new Exception("Expected seven prefab controllers");
            Directory.CreateDirectory(AuditDirectory);
            File.WriteAllText(Path.Combine(AuditDirectory,"animator-playback-audit.json"),new JObject{["passed"]=true,["unity"]=Application.unityVersion,["animals"]=reports}.ToString());
            Debug.Log("Seven wildlife Animator controllers played all states successfully");
        }

        public static void RunAll()
        {
            var folder = "Assets/CampMind/Content/Animals";
            var output = AuditDirectory;
            Directory.CreateDirectory(output);
            var reports = new JArray();
            foreach (var path in Directory.GetFiles(folder,"*Actions.glb",SearchOption.AllDirectories))
            {
                var assetPath=path.Replace('\\','/');
                AssetDatabase.ImportAsset(assetPath,ImportAssetOptions.ForceSynchronousImport|ImportAssetOptions.ForceUpdate);
                var asset=AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                if(!asset) throw new Exception("Failed to import "+assetPath);
                var instance=UnityEngine.Object.Instantiate(asset);
                try {
                    var skins=instance.GetComponentsInChildren<SkinnedMeshRenderer>();
                    if(skins.Length==0) throw new Exception("Missing skin: "+assetPath);
                    int vertices=0,triangles=0,bones=0;
                    foreach(var skin in skins) {
                        if(!skin.sharedMesh || skin.bones.Length==0 || skin.bones.Any(b=>!b)) throw new Exception("Invalid bones: "+assetPath);
                        if(skin.sharedMaterials.Length==0 || skin.sharedMaterials.Any(m=>!m || !m.shader || m.shader.name.Contains("Error"))) throw new Exception("Invalid materials: "+assetPath);
                        var mesh=new Mesh();skin.BakeMesh(mesh);
                        if(mesh.vertices.Any(v=>!float.IsFinite(v.x)||!float.IsFinite(v.y)||!float.IsFinite(v.z))) throw new Exception("Invalid skin deformation: "+assetPath);
                        vertices+=mesh.vertexCount;triangles+=mesh.triangles.Length/3;bones+=skin.bones.Length;
                        UnityEngine.Object.DestroyImmediate(mesh);
                    }
                    var animationAudits=new JArray();
                    var transforms=instance.GetComponentsInChildren<Transform>();var restPositions=transforms.Select(t=>t.localPosition).ToArray();var restRotations=transforms.Select(t=>t.localRotation).ToArray();var restScales=transforms.Select(t=>t.localScale).ToArray();
                    void Restore(){for(int i=0;i<transforms.Length;i++){transforms[i].localPosition=restPositions[i];transforms[i].localRotation=restRotations[i];transforms[i].localScale=restScales[i];}}
                    var importedClips=AssetDatabase.LoadAllAssetsAtPath(assetPath).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview__")).ToArray();
                    foreach(var clip in importedClips){
                        Restore();Vector3[] first=null;float moved=0;
                        for(int phase=0;phase<=8;phase++){
                            clip.SampleAnimation(instance,clip.length*phase/8f);
                            var points=skins.SelectMany(s=>{var mesh=new Mesh();s.BakeMesh(mesh);var p=mesh.vertices.Select(v=>s.transform.TransformPoint(v)).ToArray();UnityEngine.Object.DestroyImmediate(mesh);return p;}).ToArray();
                            if(points.Any(p=>!float.IsFinite(p.x)||!float.IsFinite(p.y)||!float.IsFinite(p.z)||p.magnitude>100))throw new Exception("Invalid clip deformation: "+assetPath+" "+clip.name);
                            if(first==null)first=points;else for(int i=0;i<points.Length;i++)moved=Mathf.Max(moved,Vector3.Distance(points[i],first[i]));
                        }
                        if(moved<.00001f)throw new Exception("Static animation: "+assetPath+" "+clip.name);
                        animationAudits.Add(new JObject{["name"]=clip.name,["sampledPoses"]=9,["maxVertexMovement"]=moved});
                    }
                    Restore();
                    var species=Path.GetFileName(assetPath).Replace("Actions.glb","");
                    var controllerPath=assetPath.Replace("Actions.glb",".controller");
                    var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
                    if(!controller)controller=AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
                    var stateMachine=controller.layers[0].stateMachine;
                    foreach(var clip in importedClips){
                        var clipPath=Path.GetDirectoryName(assetPath).Replace('\\','/')+"/"+clip.name+".anim";
                        var copy=AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
                        if(!copy){copy=UnityEngine.Object.Instantiate(clip);copy.name=clip.name;AssetDatabase.CreateAsset(copy,clipPath);}else EditorUtility.CopySerialized(clip,copy);
                        copy.legacy=false;var settings=AnimationUtility.GetAnimationClipSettings(copy);settings.loopTime=clip.name=="Idle"||clip.name=="Walk"||clip.name=="Run"||clip.name=="Flap";AnimationUtility.SetAnimationClipSettings(copy,settings);
                        var state=stateMachine.states.Select(s=>s.state).FirstOrDefault(s=>s.name==clip.name)??stateMachine.AddState(clip.name);state.motion=copy;if(clip.name=="Idle")stateMachine.defaultState=state;EditorUtility.SetDirty(copy);
                    }
                    var animator=instance.GetComponentInChildren<Animator>()??instance.AddComponent<Animator>();animator.runtimeAnimatorController=controller;animator.applyRootMotion=false;EditorUtility.SetDirty(controller);
                    float length=species=="Tiger"?3f:species=="Bear"?2.2f:species=="Boar"?1.6f:species=="Rabbit"?.45f:species=="Deer"?2f:species=="Wolf"?1.7f:1f;
                    var wrapper=new GameObject(species);instance.transform.SetParent(wrapper.transform,false);
                    if(species=="Wolf"){
                        var wolfBones=skins.SelectMany(s=>s.bones).Distinct().ToArray();var head=wolfBones.First(b=>b.name.EndsWith("Head_0"));
                        var minY=wolfBones.Min(b=>b.position.y);var maxY=wolfBones.Max(b=>b.position.y);
                        var feet=wolfBones.Where(b=>b.position.y<minY+(maxY-minY)*.3f&&!Enumerable.Range(0,b.childCount).Any(i=>wolfBones.Contains(b.GetChild(i)))).ToArray();
                        if(feet.Length<4)throw new Exception("Cannot locate wolf feet for forward alignment");
                        var footCenter=feet.Aggregate(Vector3.zero,(sum,b)=>sum+b.position)/feet.Length;
                        var forward=Vector3.ProjectOnPlane(head.position-footCenter,Vector3.up).normalized;
                        if(forward.sqrMagnitude<.9f)throw new Exception("Wolf forward direction is invalid");
                        instance.transform.localRotation=Quaternion.FromToRotation(forward,Vector3.forward);
                    }else instance.transform.localRotation=Quaternion.Euler(0,90,0);
                    Bounds WorldBounds(){var b=new Bounds();bool first=true;foreach(var skin in skins){var mesh=new Mesh();skin.BakeMesh(mesh);foreach(var v in mesh.vertices){var p=skin.transform.TransformPoint(v);if(first){b=new Bounds(p,Vector3.zero);first=false;}else b.Encapsulate(p);}UnityEngine.Object.DestroyImmediate(mesh);}return b;}
                    var bounds=WorldBounds();instance.transform.localScale*=length/Mathf.Max(bounds.size.x,bounds.size.z);bounds=WorldBounds();
                    instance.transform.localPosition-=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
                    var prefabPath=assetPath.Replace("Actions.glb",".prefab");
                    PrefabUtility.SaveAsPrefabAsset(wrapper,prefabPath);
                    var clips=AssetDatabase.LoadAllAssetsAtPath(assetPath).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview__")).Select(c=>c.name).ToArray();
                    reports.Add(new JObject { ["asset"]=assetPath,["prefab"]=prefabPath,["controller"]=controllerPath,["vertices"]=vertices,["triangles"]=triangles,["bones"]=bones,["targetLengthMetres"]=length,["clips"]=new JArray(clips),["animationAudits"]=animationAudits,["passed"]=true });
                    UnityEngine.Object.DestroyImmediate(wrapper);
                } finally { UnityEngine.Object.DestroyImmediate(instance); }
            }
            if(reports.Count!=7) throw new Exception("Expected seven animal rigs, found "+reports.Count);
            AssetDatabase.SaveAssets();
            File.WriteAllText(Path.Combine(output,"wildlife-import-audit.json"),new JObject { ["passed"]=true,["unity"]=Application.unityVersion,["animals"]=reports }.ToString());
            Debug.Log("Seven animal rigs imported and baked successfully");
        }

        public static void Run()
        {
            var args=Environment.GetCommandLineArgs();var assetIndex=Array.IndexOf(args,"-wildlife-asset");var outputIndex=Array.IndexOf(args,"-wildlife-output");
            var path = assetIndex>=0?args[assetIndex+1]:"Assets/CampMind/Content/Animals/Tiger/TigerWalk.glb";
            var output = Path.GetFullPath(outputIndex>=0?args[outputIndex+1]:"../Artifacts/animals/tiger");
            RunAsset(path,output);
        }

        public static void RenderAll()
        {
            foreach(var species in new[]{"Tiger","Bear","Boar","Pheasant","Rabbit","Deer","Wolf"})
                RunAsset("Assets/CampMind/Content/Animals/"+species+"/"+species+"Actions.glb",Path.Combine(AuditDirectory,species.ToLowerInvariant()));
        }

        static void RunAsset(string path,string output)
        {
            Directory.CreateDirectory(output);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!asset) throw new Exception("Tiger animated GLB did not import");
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var root = UnityEngine.Object.Instantiate(asset);
            var skins = root.GetComponentsInChildren<SkinnedMeshRenderer>();
            var clips = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToArray();
            if (skins.Length == 0 || clips.Length == 0) throw new Exception("Missing skinned mesh or animation clip");
            var clip = clips.FirstOrDefault(c=>c.name=="Walk")??clips.First(c => c.length > 0);
            var bones = skins.SelectMany(s => s.bones).Distinct().ToArray();
            var poses = new JArray();
            Vector3[] first = null; float movement = 0; Bounds bounds = default;
            for (int phase = 0; phase < 8; phase++)
            {
                clip.SampleAnimation(root, clip.length * phase / 8f);
                var vertices = skins.SelectMany(s => {
                    var mesh = new Mesh(); s.BakeMesh(mesh);
                    var points = mesh.vertices.Select(v => s.transform.TransformPoint(v)).ToArray();
                    UnityEngine.Object.DestroyImmediate(mesh); return points;
                }).ToArray();
                if (vertices.Length == 0 || vertices.Any(v => !float.IsFinite(v.x) || !float.IsFinite(v.y) || !float.IsFinite(v.z))) throw new Exception("Invalid animated vertices");
                var b = new Bounds(vertices[0], Vector3.zero); foreach (var v in vertices) b.Encapsulate(v);
                if (phase == 0) { first = vertices; bounds = b; } else bounds.Encapsulate(b);
                for (int i = 0; i < vertices.Length; i++) movement = Mathf.Max(movement, Vector3.Distance(vertices[i], first[i]));
                poses.Add(new JObject { ["phase"] = phase / 8f, ["width"] = b.size.x, ["height"] = b.size.y, ["depth"] = b.size.z });
            }
            if (movement < .001f || bounds.size.magnitude > 100 || bounds.size.magnitude < .01f) throw new Exception("Animation is static or has invalid scale");
            var camera = new GameObject("Audit camera").AddComponent<Camera>();
            camera.backgroundColor = new Color(.12f,.16f,.13f); camera.clearFlags = CameraClearFlags.SolidColor;
            camera.aspect=1;camera.fieldOfView=40;
            camera.transform.position = bounds.center + new Vector3(-1.3f,.65f,1.5f).normalized * bounds.size.magnitude * 1.65f;
            camera.transform.LookAt(bounds.center); camera.nearClipPlane = .01f; camera.farClipPlane = 1000;
            var light = new GameObject("Audit light").AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 2; light.transform.rotation = Quaternion.Euler(40,-30,0);
            RenderSettings.ambientLight = Color.gray;
            var target = new RenderTexture(768,768,24); camera.targetTexture = target;
            var bakedViews = skins.Select(s => { var g = new GameObject("Baked audit pose"); g.transform.SetPositionAndRotation(s.transform.position,s.transform.rotation); g.transform.localScale=s.transform.lossyScale; g.AddComponent<MeshFilter>(); g.AddComponent<MeshRenderer>().sharedMaterials=s.sharedMaterials; return g; }).ToArray();
            for (int phase = 0; phase < 4; phase++) {
                clip.SampleAnimation(root,clip.length * phase / 4f);
                for (int i=0;i<skins.Length;i++) { var mesh=new Mesh(); skins[i].BakeMesh(mesh); var filter=bakedViews[i].GetComponent<MeshFilter>(); if(filter.sharedMesh) UnityEngine.Object.DestroyImmediate(filter.sharedMesh); filter.sharedMesh=mesh; skins[i].enabled=false; }
                camera.Render(); RenderTexture.active = target;
                var png = new Texture2D(768,768,TextureFormat.RGB24,false); png.ReadPixels(new Rect(0,0,768,768),0,0); png.Apply();
                File.WriteAllBytes(Path.Combine(output,"walk-"+phase+".png"),png.EncodeToPNG()); UnityEngine.Object.DestroyImmediate(png);
            }
            RenderTexture.active = null; camera.targetTexture = null; target.Release();
            var report = new JObject { ["passed"] = true, ["asset"] = path, ["unity"] = Application.unityVersion, ["bones"] = bones.Length, ["clips"] = new JArray(clips.Select(c => new JObject { ["name"] = c.name, ["duration"] = c.length })), ["maxVertexMovement"] = movement, ["poses"] = poses };
            File.WriteAllText(Path.Combine(output,"audit.json"),report.ToString());
            Debug.Log("Wildlife audit passed: " + report);
        }
    }
}
