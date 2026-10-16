using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CampMind.Editor
{
    public static class CampSceneBuilder
    {
        private const string Content="Assets/CampMind/Content";
        private static Vector3 V(JToken v)=>new Vector3((float)v[0],(float)v[1],(float)v[2]);
        private static GameObject Group(string name,Transform parent=null){var g=new GameObject(name);g.transform.SetParent(parent,false);return g;}
        [MenuItem("CampMind/Build native camp scene")]
        public static void BuildScene()
        {
            ConfigureUrp();
            var data=JObject.Parse(File.ReadAllText(Content+"/scene-blueprint.json"));
            if((int)data["terrainRevision"]!=5)throw new InvalidOperationException("Unexpected terrain blueprint revision");
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var root=Group("CampMind Native Presentation");
            var models=data["assets"].ToDictionary(a=>(string)a["id"],a=>(string)a["destination"]);
            foreach(var file in models.Values){if(AssetDatabase.LoadAssetAtPath<GameObject>(file)==null)throw new InvalidOperationException("GLB import missing: "+file);}
            var terrain=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(models["valley/terrain"]));terrain.name="AuthoredTerrain";
            terrain.transform.SetParent(root.transform,false);terrain.transform.position=new Vector3(50,0,50);terrain.transform.localScale=new Vector3(-1,1,1);
            foreach(var filter in terrain.GetComponentsInChildren<MeshFilter>())CreateTerrainColliders(filter);
            var forest=Group("Forest",root.transform);var settlement=Group("Settlement",root.transform);var roofs=Group("Collision",root.transform);
            foreach(var item in data["placements"]){
                var category=(string)item["category"];var p=Fit((string)item["id"],models[(string)item["asset"]],V(item["size"]),(float)item["yaw"],category=="forest"?forest.transform:settlement.transform);
                p.transform.position=V(item["position"]);
                if(category=="forest"||category=="planted"){
                    var lod=p.AddComponent<LODGroup>();lod.SetLODs(new[]{new LOD(.025f,p.GetComponentsInChildren<Renderer>())});lod.RecalculateBounds();
                }
            }
            foreach(var c in data["colliders"]){var box=Group((string)c["owner"]+" collision",roofs.transform);box.layer=8;var h=(float)c["height"];
                box.transform.position=new Vector3((float)c["x"],h/2,(float)c["z"]);box.AddComponent<BoxCollider>().size=new Vector3((float)c["halfX"]*2,h,(float)c["halfZ"]*2);}
            var water=Group("River",root.transform);var mesh=new Mesh {name="Authored river surface",indexFormat=IndexFormat.UInt32};mesh.vertices=data["river"]["vertices"].Select(V).ToArray();mesh.triangles=data["river"]["triangles"].Select(t=>(int)t).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();
            SaveAsset(mesh,Content+"/river.asset");water.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Content+"/river.asset");water.AddComponent<MeshRenderer>().sharedMaterial=Material("Water",new Color(.17f,.38f,.42f),.75f);
            var bridgeMaterial=Material("Bridge",new Color(.45f,.32f,.19f),.1f);
            foreach(var b in data["bridges"]){var bridge=GameObject.CreatePrimitive(PrimitiveType.Cube);bridge.name="Bridge deck";bridge.transform.SetParent(root.transform,false);bridge.transform.position=V(b["position"]);bridge.transform.localScale=V(b["size"]);bridge.layer=9;bridge.GetComponent<MeshRenderer>().sharedMaterial=bridgeMaterial;}
            var actors=Group("Characters",root.transform);Transform lord=null;
            foreach(var c in data["characters"]){var actor=Fit((string)c["id"],models[(string)c["asset"]],new Vector3(0,(float)c["height"],0),90,actors.transform);actor.transform.position=V(c["position"]);
                var animator=actor.GetComponentInChildren<Animator>();if(animator==null)throw new InvalidOperationException("Missing skinned animation: "+actor.name);
                animator.applyRootMotion=false;animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
                var avatarPath=Content+"/"+actor.name+"-avatar.asset";
                var avatar=AvatarBuilder.BuildGenericAvatar(animator.gameObject,"");avatar.name=actor.name+" generic rig";
                SaveAsset(avatar,avatarPath);animator.avatar=AssetDatabase.LoadAssetAtPath<Avatar>(avatarPath);
                var clips=AssetDatabase.LoadAllAssetsAtPath(models[(string)c["asset"]]).OfType<AnimationClip>().Where(a=>!a.name.StartsWith("__")).ToArray();
                if(!clips.Any(a=>a.name.Contains("Idle"))||!clips.Any(a=>a.name.Contains("Walk")))throw new InvalidOperationException("Missing animation clips: "+actor.name);
                var path=Content+"/"+actor.name+".controller";var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
                if(controller==null){controller=AnimatorController.CreateAnimatorControllerAtPath(path);var stateMachine=controller.layers[0].stateMachine;
                    foreach(var clip in clips){var state=stateMachine.AddState(clip.name);state.motion=clip;if(clip.name=="Idle")stateMachine.defaultState=state;}}
                animator.runtimeAnimatorController=controller;if((string)c["id"]=="lord")lord=actor.transform;
            }
            var camera=Group("Main Camera").AddComponent<Camera>();camera.tag="MainCamera";camera.nearClipPlane=.3f;camera.farClipPlane=2600;camera.fieldOfView=50;camera.clearFlags=CameraClearFlags.SolidColor;camera.gameObject.AddComponent<AudioListener>();
            var cameraData=camera.gameObject.AddComponent<UniversalAdditionalCameraData>();cameraData.renderPostProcessing=false;
            var light=Group("Sun").AddComponent<Light>();light.type=LightType.Directional;light.shadows=LightShadows.Soft;light.intensity=1.2f;light.transform.rotation=Quaternion.Euler(45,140,0);
            light.gameObject.AddComponent<UniversalAdditionalLightData>();RenderSettings.sun=light;RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.00065f;
            var rain=Group("Storm rain").AddComponent<ParticleSystem>();var main=rain.main;main.loop=true;main.maxParticles=7000;main.startLifetime=1.3f;main.startSpeed=45;main.startSize=.08f;main.startColor=new Color(.7f,.8f,.9f,.6f);main.simulationSpace=ParticleSystemSimulationSpace.World;
            var shape=rain.shape;shape.shapeType=ParticleSystemShapeType.Box;shape.scale=new Vector3(130,1,130);rain.transform.rotation=Quaternion.Euler(90,0,0);var emission=rain.emission;emission.rateOverTime=0;
            var rainRenderer=rain.GetComponent<ParticleSystemRenderer>();rainRenderer.renderMode=ParticleSystemRenderMode.Stretch;rainRenderer.lengthScale=5;rainRenderer.velocityScale=.03f;rainRenderer.sharedMaterial=Material("Rain",new Color(.65f,.78f,.9f),.1f);
            var view=root.AddComponent<NativeCampView>();view.lord=lord;view.viewCamera=camera;view.sun=light;view.rain=rain;view.characters=actors.transform.Cast<Transform>().ToArray();
            camera.transform.position=new Vector3(50,245,-130);camera.transform.LookAt(new Vector3(50,0,65));
            var settings=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            settings.FindProperty("activeInputHandler").intValue=1;settings.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(scene,"Assets/CampMind/Scenes/Camp.unity");
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/CampMind/Scenes/Camp.unity",true)};
            File.WriteAllText(Path.GetFullPath("../Artifacts/scene-import-report.json"),new JObject{
                ["version"]=1,["assets"]=models.Count,["placements"]=data["placements"].Count(),["characters"]=view.characters.Length,["terrainRevision"]=5,["status"]="editor-scene-generated-not-yet-visual-accepted"}.ToString());
        }
        private static GameObject Fit(string id,string path,Vector3 requested,float yaw,Transform parent)
        {
            var root=Group(id,parent);var fit=Group("Asset fit",root.transform);var model=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path),fit.transform);model.transform.localRotation=Quaternion.Euler(0,yaw,0);
            var renderers=model.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new InvalidOperationException("Empty model: "+path);
            var bounds=renderers[0].bounds;foreach(var r in renderers){bounds.Encapsulate(r.bounds);r.shadowCastingMode=ShadowCastingMode.On;r.receiveShadows=true;foreach(var m in r.sharedMaterials)if(m)m.enableInstancing=true;}
            if(bounds.size.y<=0)throw new InvalidOperationException("Invalid model bounds: "+path);
            var uniform=requested.y/bounds.size.y;var scale=new Vector3(requested.x>0?requested.x/bounds.size.x:uniform,uniform,requested.z>0?requested.z/bounds.size.z:uniform);
            fit.transform.localScale=scale;fit.transform.localPosition=new Vector3(-bounds.center.x*scale.x,-bounds.min.y*scale.y,-bounds.center.z*scale.z);return root;
        }
        private static void SaveAsset(UnityEngine.Object asset,string path){var old=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);if(old==null)AssetDatabase.CreateAsset(asset,path);else{EditorUtility.CopySerialized(asset,old);UnityEngine.Object.DestroyImmediate(asset);}}
        private static void CreateTerrainColliders(MeshFilter filter)
        {
            // Exact source triangles in small strips. No height approximation or
            // giant-mesh FastMidphase limitation at runtime.
            var source=filter.sharedMesh;var vertices=source.vertices;var triangles=source.triangles;
            Directory.CreateDirectory(Content+"/Collision");
            for(var begin=0;begin<triangles.Length;begin+=180000){
                var end=Math.Min(begin+180000,triangles.Length);var map=new Dictionary<int,int>();var points=new List<Vector3>();var indices=new int[end-begin];
                for(var i=begin;i<end;i++){var original=triangles[i];if(!map.TryGetValue(original,out var index)){index=points.Count;map.Add(original,index);points.Add(vertices[original]);}indices[i-begin]=index;}
                var mesh=new Mesh{name="Terrain collision strip "+begin,indexFormat=IndexFormat.UInt32};mesh.SetVertices(points);mesh.triangles=indices;mesh.RecalculateBounds();
                var path=Content+"/Collision/terrain-"+begin+".asset";SaveAsset(mesh,path);
                var child=Group("Terrain collision "+begin,filter.transform);child.layer=9;var collider=child.AddComponent<MeshCollider>();collider.cookingOptions=MeshColliderCookingOptions.CookForFasterSimulation|MeshColliderCookingOptions.EnableMeshCleaning|MeshColliderCookingOptions.WeldColocatedVertices;collider.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            }
        }
        private static Material Material(string name,Color color,float smoothness){var path=Content+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(m==null){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",smoothness);return m;}
        private static void ConfigureUrp()
        {
            var path=Content+"/CampURP.asset";var pipeline=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if(pipeline==null){Directory.CreateDirectory(Content);var renderer=ScriptableObject.CreateInstance<UniversalRendererData>();AssetDatabase.CreateAsset(renderer,Content+"/CampRenderer.asset");pipeline=UniversalRenderPipelineAsset.Create(renderer);AssetDatabase.CreateAsset(pipeline,path);}
            var serialized=new SerializedObject(pipeline);serialized.FindProperty("m_MainLightShadowsSupported").boolValue=true;serialized.ApplyModifiedPropertiesWithoutUndo();
            pipeline.shadowDistance=160;pipeline.mainLightShadowmapResolution=2048;pipeline.msaaSampleCount=2;pipeline.renderScale=1;pipeline.useSRPBatcher=true;
            GraphicsSettings.defaultRenderPipeline=pipeline;QualitySettings.renderPipeline=pipeline;QualitySettings.vSyncCount=0;
        }
    }
}
