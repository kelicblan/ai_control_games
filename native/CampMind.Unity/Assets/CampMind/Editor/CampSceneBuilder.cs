using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
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
        private static readonly Dictionary<string,Mesh[]> StaticDerivatives=new Dictionary<string,Mesh[]>();
        private static Vector3 V(JToken v)=>new Vector3((float)v[0],(float)v[1],(float)v[2]);
        private static GameObject Group(string name,Transform parent=null){var g=new GameObject(name);g.transform.SetParent(parent,false);return g;}
        [MenuItem("CampMind/Build native camp scene")]
        public static void BuildScene()
        {
            ConfigureUrp();
            StaticDerivatives.Clear();
            NativeMeshLod.Reset();
            var data=JObject.Parse(File.ReadAllText(Content+"/scene-blueprint.json"));
            if((int)data["terrainRevision"]!=5)throw new InvalidOperationException("Unexpected terrain blueprint revision");
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var root=Group("CampMind Native Presentation");
            var models=data["assets"].ToDictionary(a=>(string)a["id"],a=>(string)a["destination"]);
            foreach(var file in models.Values){if(AssetDatabase.LoadAssetAtPath<GameObject>(file)==null)throw new InvalidOperationException("GLB import missing: "+file);}
            var terrain=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(models["valley/terrain"]));terrain.name="AuthoredTerrain";
            terrain.transform.SetParent(root.transform,false);terrain.transform.position=new Vector3(50,0,50);terrain.transform.localScale=new Vector3(-1,1,1);
            var terrainFilters=terrain.GetComponentsInChildren<MeshFilter>();
            for(var i=0;i<terrainFilters.Length;i++){CreateTerrainColliders(terrainFilters[i]);CreateTerrainRenderCells(terrainFilters[i],i);}
            foreach(var renderer in terrain.GetComponentsInChildren<Renderer>())renderer.shadowCastingMode=ShadowCastingMode.Off;
            var forest=Group("Forest",root.transform);var settlement=Group("Settlement",root.transform);var roofs=Group("Collision",root.transform);
            foreach(var item in data["placements"]){
                var category=(string)item["category"];var p=Fit((string)item["id"],models[(string)item["asset"]],V(item["size"]),(float)item["yaw"],category=="forest"?forest.transform:settlement.transform);
                if(category=="home"||category=="facility")BakeStaticBuilding(p,item,data["rooms"].FirstOrDefault(r=>(string)r["id"]==(string)item["id"]));
                p.transform.position=V(item["position"]);
                p.transform.rotation=Quaternion.Euler(0,(float)item["heading"],0);
                if(new[]{"forest","planted","shrub","grass","rock"}.Contains(category)){
                    var kind=Path.GetFileName((string)item["asset"]);NativeMeshLod.Attach(p,kind);
                    if(category=="grass")foreach(var renderer in p.GetComponentsInChildren<Renderer>())renderer.shadowCastingMode=ShadowCastingMode.Off;
                }
            }
            foreach(var c in data["colliders"]){var box=Group((string)c["owner"]+" collision",roofs.transform);box.layer=8;var h=(float)c["height"];
                box.transform.position=new Vector3((float)c["x"],(float)c["base"]+h/2,(float)c["z"]);box.AddComponent<BoxCollider>().size=new Vector3((float)c["halfX"]*2,h,(float)c["halfZ"]*2);}
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
            var fill=Group("Sky fill").AddComponent<Light>();fill.type=LightType.Directional;fill.shadows=LightShadows.None;fill.color=new Color(201/255f,222/255f,240/255f);fill.intensity=.28f;fill.gameObject.AddComponent<UniversalAdditionalLightData>();
            light.gameObject.AddComponent<UniversalAdditionalLightData>();RenderSettings.sun=light;RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.00065f;
            var rain=Group("Storm rain").AddComponent<ParticleSystem>();var main=rain.main;main.loop=true;main.maxParticles=7000;main.startLifetime=1.3f;main.startSpeed=45;main.startSize=.08f;main.startColor=new Color(.7f,.8f,.9f,.6f);main.simulationSpace=ParticleSystemSimulationSpace.World;
            var shape=rain.shape;shape.shapeType=ParticleSystemShapeType.Box;shape.scale=new Vector3(130,1,130);rain.transform.rotation=Quaternion.Euler(90,0,0);var emission=rain.emission;emission.rateOverTime=0;
            var rainRenderer=rain.GetComponent<ParticleSystemRenderer>();rainRenderer.renderMode=ParticleSystemRenderMode.Stretch;rainRenderer.lengthScale=3;rainRenderer.velocityScale=.025f;
            var rainMaterial=AssetDatabase.LoadAssetAtPath<Material>(Content+"/Rain.mat");if(rainMaterial==null){rainMaterial=new Material(Shader.Find("CampMind/Rain"));AssetDatabase.CreateAsset(rainMaterial,Content+"/Rain.mat");}
            rainMaterial.shader=Shader.Find("CampMind/Rain");rainMaterial.SetColor("_BaseColor",new Color(.75f,.85f,.95f,.35f));rainRenderer.sharedMaterial=rainMaterial;
            var view=root.AddComponent<NativeCampView>();view.lord=lord;view.viewCamera=camera;view.sun=light;view.fill=fill;view.rain=rain;view.characters=actors.transform.Cast<Transform>().ToArray();
            CreateInteriors(data,root.transform,settlement.transform,view);
            CreateGate(data,root.transform,view);
            root.AddComponent<NativeQualityView>();
            NativeWildernessBuilder.Build((JObject)data["wilderness"],root.transform,view);
            var replayManifest=JObject.Parse(File.ReadAllText(Content+"/Replay/manifest.json"));var replay=root.AddComponent<NativeReplayContent>();
            replay.clearReplay=AssetDatabase.LoadAssetAtPath<TextAsset>(Content+"/Replay/clear.bytes");replay.stormReplay=AssetDatabase.LoadAssetAtPath<TextAsset>(Content+"/Replay/storm.bytes");
            replay.clearSha=(string)replayManifest["files"].First(f=>(string)f["file"]=="clear.bytes")["sha256"];replay.stormSha=(string)replayManifest["files"].First(f=>(string)f["file"]=="storm.bytes")["sha256"];
            if(replay.clearReplay==null||replay.stormReplay==null)throw new InvalidOperationException("Run the source render replay exporter before building Camp");
            var weather=root.AddComponent<NativeWeatherView>();weather.view=view;weather.rain=rain;weather.rainMaterial=rainMaterial;
            var roofRegions=data["placements"].Where(p=>new[]{"home","facility","gate","watchtower"}.Contains((string)p["category"])&&(string)p["id"]!="training-ground").Select(p=>{
                var point=V(p["position"]);var size=V(p["size"]);var projected=view.Space.ToUnity(new Vector2(point.x,point.z),point.y);return new RoofRegion(new Vector2(projected.x,projected.z),new Vector2(size.x*.5f,size.z*.5f),point.y+size.y);
            }).ToArray();weather.roofs=roofRegions;
            weather.foliage=data["placements"].Where(p=>new[]{"forest","planted","shrub","grass"}.Contains((string)p["category"])).Select(p=>{
                var parent=(string)p["category"]=="forest"?forest:settlement;return parent.transform.Find((string)p["id"]);
            }).ToArray();
            root.transform.position=new Vector3(view.logicalOrigin.x,0,-view.logicalOrigin.y);root.transform.localScale=new Vector3(-1,1,1);
            foreach(var room in root.GetComponent<NativeInteriorView>().rooms)room.center=view.Space.ToUnity(new Vector2(room.center.x,room.center.z),room.center.y);
            Physics.SyncTransforms();NativeCameraProfile.God(1920,1080,view.focus,view.yaw,view.pitch,view.zoom).Apply(camera);
            var settings=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            settings.FindProperty("activeInputHandler").intValue=1;settings.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(scene,"Assets/CampMind/Scenes/Camp.unity");
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/CampMind/Scenes/Camp.unity",true)};
            File.WriteAllText(Path.GetFullPath("../Artifacts/scene-import-report.json"),new JObject{
                ["version"]=1,["assets"]=models.Count,["placements"]=data["placements"].Count(),["characters"]=view.characters.Length,["terrainRevision"]=5,["status"]="editor-scene-generated-not-yet-visual-accepted"}.ToString());
        }
        private static GameObject Fit(string id,string path,Vector3 requested,float yaw,Transform parent)
        {
            var root=Group(id,parent);var basis=Group("Restore logical X",root.transform);var fit=Group("Asset fit",basis.transform);var model=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path),fit.transform);model.transform.localRotation=Quaternion.Euler(0,yaw,0);
            var renderers=model.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new InvalidOperationException("Empty model: "+path);
            var bounds=renderers[0].bounds;foreach(var r in renderers){bounds.Encapsulate(r.bounds);r.shadowCastingMode=ShadowCastingMode.On;r.receiveShadows=true;foreach(var m in r.sharedMaterials)if(m)m.enableInstancing=true;}
            if(bounds.size.y<=0)throw new InvalidOperationException("Invalid model bounds: "+path);
            var uniform=requested.y/bounds.size.y;var scale=new Vector3(requested.x>0?requested.x/bounds.size.x:uniform,uniform,requested.z>0?requested.z/bounds.size.z:uniform);
            fit.transform.localScale=scale;fit.transform.localPosition=new Vector3(-bounds.center.x*scale.x,-bounds.min.y*scale.y,-bounds.center.z*scale.z);basis.transform.localScale=new Vector3(-1,1,1);return root;
        }
        private static void BakeStaticBuilding(GameObject root,JToken placement,JToken room)
        {
            var basis=root.transform.Find("Restore logical X");var filters=root.GetComponentsInChildren<MeshFilter>();
            var matrices=filters.Select(f=>basis.worldToLocalMatrix*f.transform.localToWorldMatrix).ToArray();
            var size=V(placement["size"]);var wallHeight=room!=null?(float)room["height"]:0;var home=(string)placement["category"]=="home";
            var key=(string)placement["asset"]+"|"+size.ToString("R",CultureInfo.InvariantCulture)+"|"+wallHeight.ToString("R",CultureInfo.InvariantCulture)+"|"+(string)room?["doorWidth"]+"|"+(string)room?["doorHeight"]+"|"+(string)room?["doorClipMinZ"];
            string fingerprint;using(var hash=SHA256.Create())fingerprint=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(key))).Replace("-","").Substring(0,16).ToLowerInvariant();
            var cached=StaticDerivatives.TryGetValue(key,out var meshes);if(!cached)meshes=new Mesh[filters.Length];
            Directory.CreateDirectory(Content+"/Derived");
            for(var i=0;i<filters.Length;i++){
                if(!cached){var mesh=UnityEngine.Object.Instantiate(filters[i].sharedMesh);var vertices=mesh.vertices;
                    for(var n=0;n<vertices.Length;n++){var point=matrices[i].MultiplyPoint3x4(vertices[n]);
                        if(home){var eave=size.y*.3f;point.y=point.y<=eave?point.y/eave*wallHeight:wallHeight+(point.y-eave)/(size.y-eave)*(size.y-wallHeight);}
                        if((string)placement["id"]=="training-ground")point.y=point.y<=1.5f?point.y*.1f:point.y-1.35f;
                        vertices[n]=point;
                    }
                    mesh.vertices=vertices;mesh.RecalculateNormals();if(mesh.uv.Length>0)mesh.RecalculateTangents();mesh.RecalculateBounds();
                    if(room!=null){var minZ=(float)room["doorClipMinZ"];var top=(float)room["doorHeight"];var width=(float)room["doorWidth"];
                        var cut=new Bounds(new Vector3(0,(top+.05f)/2,(minZ+size.z/2+5)/2),new Vector3(width-.0001f,top-.0501f,size.z/2+5-minZ));
                        var clipped=StaticMeshClip.Subtract(mesh,new[]{cut});UnityEngine.Object.DestroyImmediate(mesh);mesh=clipped;
                    }
                    var path=Content+"/Derived/"+Path.GetFileNameWithoutExtension((string)placement["asset"])+"-"+fingerprint+"-"+i+".asset";SaveAsset(mesh,path);meshes[i]=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                }
                filters[i].transform.SetParent(basis,false);filters[i].transform.localPosition=Vector3.zero;filters[i].transform.localRotation=Quaternion.identity;filters[i].transform.localScale=Vector3.one;filters[i].sharedMesh=meshes[i];
            }
            if(!cached)StaticDerivatives[key]=meshes;
        }
        private static void SaveAsset(UnityEngine.Object asset,string path){var old=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);if(old==null)AssetDatabase.CreateAsset(asset,path);else{EditorUtility.CopySerialized(asset,old);UnityEngine.Object.DestroyImmediate(asset);}}
        private static void CreateGate(JObject data,Transform parent,NativeCampView view)
        {
            var placement=data["placements"].First(p=>(string)p["id"]=="gate");var root=Group("Hinged settlement gate",parent);root.transform.position=V(placement["position"]);root.layer=8;
            var gate=root.AddComponent<NativeGateView>();gate.view=view;gate.closedCollision=root.AddComponent<BoxCollider>();gate.closedCollision.center=new Vector3(0,5.7f,0);gate.closedCollision.size=new Vector3(18,11.2f,2.2f);
            var timber=Material("GateTimber",new Color(.41f,.27f,.17f),.08f);var iron=Material("GateIron",new Color(.19f,.18f,.15f),.27f);iron.SetFloat("_Metallic",.6f);
            for(var side=-1;side<=1;side+=2){var leaf=Group(side<0?"Left gate":"Right gate",root.transform);leaf.transform.localPosition=new Vector3(side*9,0,0);if(side<0)gate.left=leaf.transform;else gate.right=leaf.transform;
                void Block(string name,Material material,float x,float y,float z,float w,float h,float d){var block=GameObject.CreatePrimitive(PrimitiveType.Cube);block.name=name;block.transform.SetParent(leaf.transform,false);block.transform.localPosition=new Vector3(-side*x,y,z);block.transform.localScale=new Vector3(w,h,d);UnityEngine.Object.DestroyImmediate(block.GetComponent<BoxCollider>());block.GetComponent<MeshRenderer>().sharedMaterial=material;}
                for(var i=0;i<12;i++)Block("Timber plank",timber,(i+.5f)*9/12,5.7f,0,9f/12-.025f,11.2f,.6f);
                foreach(var y in new[]{1.6f,5.8f,9.6f}){Block("Timber crossbar",timber,4.5f,y,-.4f,8.85f,.48f,.4f);Block("Iron strap",iron,4.5f,y,.335f,8.8f,.18f,.1f);for(var i=0;i<6;i++)Block("Iron rivet",iron,(i+.5f)*9/6,y,.41f,.13f,.13f,.08f);}
            }
            gate.Apply(true,1);
        }
        private static void CreateInteriors(JObject data,Transform parent,Transform settlement,NativeCampView view)
        {
            var roomsRoot=Group("Interiors",parent);var rooms=new List<InteriorRoom>();
            var wood=Material("InteriorWood",new Color(.43f,.29f,.18f),.1f);var plaster=Material("InteriorPlaster",new Color(.78f,.69f,.53f),.1f);var sheet=Material("BedCloth",new Color(.59f,.47f,.32f),.1f);
            GameObject Block(string name,Transform owner,Vector3 position,Vector3 size,Material material){var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);cube.name=name;cube.transform.SetParent(owner,false);cube.transform.position=position;cube.transform.localScale=size;UnityEngine.Object.DestroyImmediate(cube.GetComponent<BoxCollider>());cube.GetComponent<MeshRenderer>().sharedMaterial=material;return cube;}
            foreach(var item in data["rooms"]){var id=(string)item["id"];var center=V(item["center"]);var half=new Vector2((float)item["half"][0],(float)item["half"][1]);var height=(float)item["height"];var inside=Group(id+" interior",roomsRoot.transform);
                Block("Wood floor",inside.transform,center-Vector3.up*.035f,new Vector3(half.x*2-.45f,.1f,half.y*2-.45f),wood);
                foreach(var wall in data["colliders"].Where(w=>(string)w["owner"]==id))Block("Shared wall "+id,inside.transform,new Vector3((float)wall["x"],(float)wall["base"]+height/2,(float)wall["z"]),new Vector3((float)wall["halfX"]*2,height,(float)wall["halfZ"]*2),plaster);
                foreach(var bed in item["beds"]){var point=V(bed);Block("Bed",inside.transform,point,new Vector3(2.4f,.5f,3.3f),wood);Block("Bed cloth",inside.transform,point+Vector3.up*.28f,new Vector3(2.2f,.08f,3),sheet);}
                var lamp=Group("Interior lamp",inside.transform).AddComponent<Light>();lamp.type=LightType.Point;lamp.color=new Color(1,.72f,.42f);lamp.intensity=1.2f;lamp.range=Mathf.Max(half.x,half.y)*2.2f;lamp.transform.position=center+Vector3.up*(height*.65f);lamp.shadows=LightShadows.None;
                inside.SetActive(false);rooms.Add(new InteriorRoom{id=id,center=center,half=half,height=height,exterior=settlement.Find(id).GetComponentsInChildren<Renderer>(),interior=inside});
            }
            var interiors=view.gameObject.AddComponent<NativeInteriorView>();interiors.view=view;interiors.rooms=rooms.ToArray();
        }
        private static void CreateTerrainRenderCells(MeshFilter filter,int index)
        {
            var source=filter.sharedMesh;var renderer=filter.GetComponent<MeshRenderer>();
            var folder=Content+"/TerrainCells";Directory.CreateDirectory(folder);
            var hash=AssetDatabase.GetAssetDependencyHash(AssetDatabase.GetAssetPath(source)).ToString();
            var cells=NativeTerrainCells.Partition(source,128);
            for(var i=0;i<cells.Length;i++){
                var path=$"{folder}/{hash}-{index}-{i}.asset";var name=cells[i].name;SaveAsset(cells[i],path);
                var child=Group(name,filter.transform);child.layer=filter.gameObject.layer;
                child.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                var output=child.AddComponent<MeshRenderer>();output.sharedMaterials=renderer.sharedMaterials;output.receiveShadows=renderer.receiveShadows;output.shadowCastingMode=ShadowCastingMode.Off;
            }
            // The independent exact collision strips retain their own meshes.
            // Remove only scene components, never the imported source asset.
            UnityEngine.Object.DestroyImmediate(renderer);UnityEngine.Object.DestroyImmediate(filter);
        }
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
            pipeline.shadowDistance=450;pipeline.mainLightShadowmapResolution=2048;pipeline.msaaSampleCount=2;pipeline.renderScale=1;pipeline.useSRPBatcher=true;
            GraphicsSettings.defaultRenderPipeline=pipeline;QualitySettings.renderPipeline=pipeline;QualitySettings.vSyncCount=0;
            if(PlayerSettings.colorSpace!=ColorSpace.Linear){
                PlayerSettings.colorSpace=ColorSpace.Linear;
                // glTFast tags base-color versus data textures using the active
                // color space. Reimport rather than reusing Gamma subassets.
                foreach(var file in Directory.GetFiles(Content+"/Models","*.glb",SearchOption.AllDirectories))AssetDatabase.ImportAsset(file.Replace('\\','/'),ImportAssetOptions.ForceUpdate|ImportAssetOptions.ForceSynchronousImport);
            }
        }
    }
}
