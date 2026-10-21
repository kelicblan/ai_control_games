using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;
using CampMind.Presentation;
namespace CampMind.Editor
{
    public static class NewWorldGameInstaller
    {
        const string Destination="Assets/CampMind/NewWorldGame/Camp.unity";
        static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        static string Request=>Path.Combine(Repo,"native/Artifacts/new-world-install.request");
        static bool busy;static double next;
        [InitializeOnLoadMethod]static void Initialize(){EditorApplication.update+=Poll;}
        static void Poll(){if(busy||EditorApplication.timeSinceStartup<next||EditorApplication.isPlayingOrWillChangePlaymode||EditorApplication.isCompiling||EditorApplication.isUpdating)return;next=EditorApplication.timeSinceStartup+2;if(!File.Exists(Request)){if(File.Exists(Request+".build")&&File.Exists(Destination)){busy=true;try{BuildGame();File.Move(Request+".build",Request+".built-"+DateTime.Now.ToString("yyyyMMddHHmmss"));}catch(Exception e){File.WriteAllText(Request+".build.error",e.ToString());File.Move(Request+".build",Request+".build.failed-"+DateTime.Now.ToString("yyyyMMddHHmmss"));Debug.LogException(e);}finally{busy=false;}}return;}busy=true;try{Install();File.Move(Request,Request+".completed-"+DateTime.Now.ToString("yyyyMMddHHmmss"));}catch(Exception e){File.WriteAllText(Request+".error",e.ToString());File.Move(Request,Request+".failed-"+DateTime.Now.ToString("yyyyMMddHHmmss"));Debug.LogException(e);}finally{busy=false;}}
        public static void InstallSavedManualAndBuild()
        {
            var backup=Directory.GetFiles("Assets/CampMind/NewWorldGame/Backups","Manual-*.unity").OrderByDescending(p=>p,StringComparer.Ordinal).First();
            EditorSceneManager.OpenScene(backup);Install();if(File.Exists(Request+".build"))File.Delete(Request+".build");BuildGame();
        }
        [MenuItem("CampMind/新世界/构建已接入的新地图游戏")]
        public static void BuildGame()
        {
            if(!File.Exists(Destination)||!File.Exists(Path.Combine(Repo,"native/ArtSource/new-world-runtime.json")))throw new InvalidOperationException("Apply the manual map before building");
            var output=Path.GetFullPath(Path.Combine(Repo,Environment.GetEnvironmentVariable("CAMP_NEW_WORLD_BUILD_OUTPUT")??"native/Builds/NewWorld-IL2CPP/CampMind.exe"));var buildRoot=Path.GetFullPath(Path.Combine(Repo,"native/Builds"))+Path.DirectorySeparatorChar;if(!output.StartsWith(buildRoot,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(output)!="CampMind.exe")throw new InvalidOperationException("New world output must stay inside native/Builds");Directory.CreateDirectory(Path.GetDirectoryName(output));
            PlayerSettings.runInBackground=true;PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,Environment.GetEnvironmentVariable("CAMP_NEW_WORLD_BUILD_BACKEND")=="Mono"?ScriptingImplementation.Mono2x:ScriptingImplementation.IL2CPP);
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/CampMind/Scenes/Startup.unity",Destination},locationPathName=output,target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
            if(report.summary.result!=BuildResult.Succeeded)throw new InvalidOperationException("New map build failed: "+report.summary.result);
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(output),"world-layout.json"),new JObject{["layout"]=NewWorldGameProfile.LayoutId,["scene"]=Destination,["builtUtc"]=DateTime.UtcNow.ToString("O")}.ToString());
            File.WriteAllText(Path.Combine(Repo,"native/Artifacts/new-world-game-build.json"),new JObject{["success"]=true,["executable"]=output,["errors"]=report.summary.totalErrors,["warnings"]=report.summary.totalWarnings}.ToString());
            if(Environment.GetEnvironmentVariable("CAMP_NEW_WORLD_DEFER_PROMOTION")!="1")File.WriteAllText(Path.Combine(Repo,"native/Builds/new-world-current.json"),new JObject{["layout"]=NewWorldGameProfile.LayoutId,["executable"]=output,["builtUtc"]=DateTime.UtcNow.ToString("O")}.ToString());
        }
        [MenuItem("CampMind/新世界/将当前手调地图应用到游戏")]
        public static void Install()
        {
            var source=SceneManager.GetActiveScene();if(!source.GetRootGameObjects().Any(g=>g.GetComponentInChildren<NewWorldCalibrationView>(true)))throw new InvalidOperationException("Keep the manually edited NewWorld scene active before applying");
            var stamp=DateTime.Now.ToString("yyyyMMdd-HHmmss");var output=Path.Combine(Repo,"native/Artifacts/new-world-install-"+stamp);Directory.CreateDirectory(output);
            var folder="Assets/CampMind/NewWorldGame";Directory.CreateDirectory(folder);Directory.CreateDirectory(folder+"/Backups");AssetDatabase.Refresh();
            var backup=folder+"/Backups/Manual-"+stamp+".unity";if(!EditorSceneManager.SaveScene(source,backup,true))throw new IOException("Could not preserve in-memory manual scene");
            if(File.Exists(Destination))AssetDatabase.CopyAsset(Destination,folder+"/Backups/Game-"+stamp+".unity");
            if(!EditorSceneManager.SaveScene(source,Destination,true))throw new IOException("Could not derive game scene");
            var scene=EditorSceneManager.OpenScene(Destination,OpenSceneMode.Additive);SceneManager.SetActiveScene(scene);
            Scene legacy=default;var sourceRoots=source.GetRootGameObjects().Select(g=>(g,g.activeSelf)).ToArray();foreach(var item in sourceRoots)item.g.SetActive(false);
            try{
                var all=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).ToArray();
                var calibration=all.Select(t=>t.GetComponent<NewWorldCalibrationView>()).FirstOrDefault(c=>c);
                if(!calibration)throw new InvalidOperationException("Missing reference camera and construction actor");
                var camera=calibration.referenceCamera;var previewActor=calibration.actor;var gate=calibration.gate;
                if(calibration.studioObjects!=null)foreach(var item in calibration.studioObjects)if(item)item.SetActive(false);
                var spawn=previewActor.position;UnityEngine.Object.DestroyImmediate(previewActor.gameObject);UnityEngine.Object.DestroyImmediate(calibration);
                // Only clone the ten existing rigs and runtime rain, never the old environment.
                legacy=EditorSceneManager.OpenScene("Assets/CampMind/Scenes/Camp.unity",OpenSceneMode.Additive);
                var old=legacy.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<NativeCampView>(true)).First();
                SceneManager.SetActiveScene(scene);
                var root=new GameObject("正式世界 — 新地图 v1");var view=root.AddComponent<NativeCampView>();var profile=root.AddComponent<NewWorldGameProfile>();profile.view=view;profile.gate=gate;
                view.viewCamera=camera;view.sun=all.Select(t=>t.GetComponent<Light>()).First(l=>l&&l.type==LightType.Directional);
                var fill=new GameObject("New map fill").AddComponent<Light>();fill.type=LightType.Directional;fill.transform.rotation=Quaternion.Euler(60,140,0);fill.intensity=.18f;view.fill=fill;
                var rain=UnityEngine.Object.Instantiate(old.rain.gameObject);rain.name="正式天气";SceneManager.MoveGameObjectToScene(rain,scene);view.rain=rain.GetComponent<ParticleSystem>();
                var weather=root.AddComponent<NativeWeatherView>();weather.view=view;weather.rain=view.rain;var oldWeather=old.GetComponent<NativeWeatherView>();weather.rainMaterial=new Material(oldWeather.rainMaterial);AssetDatabase.CreateAsset(weather.rainMaterial,folder+"/Rain-"+stamp+".mat");rain.GetComponent<ParticleSystemRenderer>().sharedMaterial=weather.rainMaterial;weather.roofs=Array.Empty<RoofRegion>();weather.foliage=Array.Empty<Transform>();
                var actors=new List<Transform>();foreach(var original in old.characters){var actor=UnityEngine.Object.Instantiate(original.gameObject);actor.name=original.name;SceneManager.MoveGameObjectToScene(actor,scene);actor.transform.SetParent(root.transform,true);actor.transform.localScale*=1.85f/7.45f;foreach(var c in actor.GetComponentsInChildren<Collider>())c.enabled=false;actors.Add(actor.transform);}
                view.characters=actors.ToArray();view.lord=actors.First(a=>a.name=="lord");
                EditorSceneManager.CloseScene(legacy,true);legacy=default;
                all=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).ToArray();
                foreach(var c in all.SelectMany(t=>t.GetComponents<Collider>()).Where(c=>c.enabled)){
                    var n=c.name;bool ground=n.StartsWith("Registered terrain section",StringComparison.Ordinal)||n.EndsWith("-relief",StringComparison.Ordinal)||n.StartsWith("main-stair-",StringComparison.Ordinal)||n=="bridge-deck"||n.Contains("落地")||n=="main-hall-platform-observed-rim-and-foot"||n.Contains("platform-top")||n.Contains("terrace-top");c.gameObject.layer=ground?9:8;
                }
                // Visible source houses define solid footprints; the reference transforms stay untouched.
                foreach(var t in all.Where(t=>t.name.StartsWith("Source-corrected ",StringComparison.Ordinal)&&t.name.Contains("observed outer envelope"))){var rs=t.GetComponentsInChildren<Renderer>().Where(r=>r.enabled&&r.gameObject.activeInHierarchy).ToArray();if(rs.Length==0)continue;var b=rs[0].bounds;foreach(var rr in rs.Skip(1))b.Encapsulate(rr.bounds);var blocker=new GameObject("Runtime footprint "+t.name);blocker.layer=8;blocker.transform.position=new Vector3(b.center.x,b.min.y+1,b.center.z);var box=blocker.AddComponent<BoxCollider>();box.size=new Vector3(b.size.x*.62f,2,b.size.z*.62f);}
                Physics.SyncTransforms();
                if(gate){if(gate.leftLeaf)foreach(var c in gate.leftLeaf.GetComponentsInChildren<Collider>())c.enabled=false;if(gate.rightLeaf)foreach(var c in gate.rightLeaf.GetComponentsInChildren<Collider>())c.enabled=false;}
                var groundColliders=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Collider>()).Where(c=>c.enabled&&c.gameObject.layer==9).ToArray();if(groundColliders.Length<3)throw new InvalidOperationException("Missing traversable terrain surfaces");
                var bounds=groundColliders[0].bounds;foreach(var c in groundColliders.Skip(1))bounds.Encapsulate(c.bounds);
                float minUx=Mathf.Max(-150,Mathf.Floor(bounds.min.x)),maxUx=Mathf.Min(150,Mathf.Ceil(bounds.max.x)),minUz=Mathf.Max(-150,Mathf.Floor(bounds.min.z)),maxUz=Mathf.Min(160,Mathf.Ceil(bounds.max.z));const float step=.5f;
                var space=view.Space;var lo=space.ToLogical(new Vector3(maxUx,0,minUz));var hi=space.ToLogical(new Vector3(minUx,0,maxUz));int width=Mathf.RoundToInt((hi.x-lo.x)/step)+1,height=Mathf.RoundToInt((hi.y-lo.y)/step)+1;var heights=new float[width*height];var walk=new int[heights.Length];
                for(int y=0;y<height;y++)for(int x=0;x<width;x++){int i=y*width+x;var p=space.ToUnity(new Vector2(lo.x+x*step,lo.y+y*step),100);if(!Physics.Raycast(p,Vector3.down,out var hit,200,1<<9,QueryTriggerInteraction.Ignore)||hit.collider.gameObject.scene!=scene)continue;heights[i]=(float)Math.Round(hit.point.y,3);if(hit.normal.y<.65f)continue;var foot=hit.point+Vector3.up*.36f;walk[i]=Physics.CheckCapsule(foot,hit.point+Vector3.up*1.5f,.28f,1<<8,QueryTriggerInteraction.Ignore)?0:1;}
                Vector2 Logical(Vector3 p)=>space.ToLogical(p);
                Vector3 Nearest(Vector3 wanted){int best=-1;float cost=float.PositiveInfinity;for(int i=0;i<walk.Length;i++)if(walk[i]==1){var p=space.ToUnity(new Vector2(lo.x+i%width*step,lo.y+i/width*step),heights[i]);float d=(p-wanted).sqrMagnitude;if(d<cost){cost=d;best=i;}}if(best<0)throw new InvalidOperationException("Map has no walkable ground");return space.ToUnity(new Vector2(lo.x+best%width*step,lo.y+best/width*step),heights[best]);}
                JObject Point(Vector3 p){var v=Logical(p);return new JObject{["x"]=v.x,["y"]=v.y};}
                var safeSpawn=Nearest(spawn);var spawnLogical=Logical(safeSpawn);int startX=Mathf.RoundToInt((spawnLogical.x-lo.x)/step),startY=Mathf.RoundToInt((spawnLogical.y-lo.y)/step);var reachable=new bool[walk.Length];var queue=new Queue<int>();int startCell=startY*width+startX;reachable[startCell]=true;queue.Enqueue(startCell);while(queue.Count>0){int at=queue.Dequeue(),cx=at%width,cy=at/width;foreach(var delta in new[]{new Vector2Int(1,0),new Vector2Int(-1,0),new Vector2Int(0,1),new Vector2Int(0,-1)}){int nx=cx+delta.x,ny=cy+delta.y;if(nx<0||ny<0||nx>=width||ny>=height)continue;int ni=ny*width+nx;if(reachable[ni]||walk[ni]==0||Mathf.Abs(heights[ni]-heights[at])>.45f)continue;reachable[ni]=true;queue.Enqueue(ni);}}for(int i=0;i<walk.Length;i++)if(!reachable[i])walk[i]=0;
                var center=Nearest(new Vector3(0,0,-8));safeSpawn=Nearest(center+Vector3.back*3);view.lord.position=safeSpawn;var npcSpawns=new JArray();int index=0;foreach(var actor in actors.Where(a=>a!=view.lord)){actor.position=Nearest(center+new Vector3((index%3-1)*2,0,(index/3+1)*2));npcSpawns.Add(Point(actor.position));index++;}
                var gatePoint=gate?gate.center:safeSpawn;var locations=new JObject();foreach(var entry in new[]{("camp",center),("fire",center+Vector3.right*4),("storage",center+Vector3.left*7),("food",center+Vector3.forward*10),("wood",center+Vector3.left*15),("explore",safeSpawn),("rest",center+Vector3.right*10)})locations[entry.Item1]=Point(Nearest(entry.Item2));
                Vector3 HouseFoot(Transform t){var rs=t.GetComponentsInChildren<Renderer>().Where(r=>r.enabled&&r.gameObject.activeInHierarchy).ToArray();if(rs.Length==0)return t.position;var b=rs[0].bounds;foreach(var rr in rs.Skip(1))b.Encapsulate(rr.bounds);return new Vector3(b.center.x,b.min.y,b.center.z);}
                var homes=all.Where(t=>t.name.StartsWith("Source-corrected ",StringComparison.Ordinal)&&t.name.Contains("observed outer envelope")&&!t.name.StartsWith("Source-corrected H ",StringComparison.Ordinal)).ToArray();var rests=new JArray();for(int i=0;i<9;i++)rests.Add(Point(Nearest(homes.Length>0?HouseFoot(homes[i%homes.Length])+new Vector3(i/5*.6f,0,0):center)));
                var houses=new JArray();foreach(var home in all.Where(t=>t.name.StartsWith("Source-corrected ",StringComparison.Ordinal)&&t.name.Contains("observed outer envelope"))){var rs=home.GetComponentsInChildren<Renderer>().Where(r=>r.enabled&&r.gameObject.activeInHierarchy).ToArray();if(rs.Length==0)continue;var b=rs[0].bounds;foreach(var rr in rs.Skip(1))b.Encapsulate(rr.bounds);houses.Add(new JObject{["id"]=home.name.Substring("Source-corrected ".Length,1),["center"]=Point(b.center),["half"]=new JObject{["x"]=b.size.x*.31f,["y"]=b.size.z*.31f},["height"]=b.size.y,["rest"]=Point(Nearest(new Vector3(b.center.x,b.min.y,b.center.z)))});}
                var outline=new JArray();for(int i=0;i<48;i++){float a=i*Mathf.PI*2/48;outline.Add(Point(center+new Vector3(Mathf.Cos(a)*85,0,Mathf.Sin(a)*65)));}
                var data=new JObject{["version"]=1,["id"]=NewWorldGameProfile.LayoutId,["sourceScene"]=backup,["exportedUtc"]=DateTime.UtcNow.ToString("O"),["minX"]=lo.x,["minY"]=lo.y,["step"]=step,["width"]=width,["height"]=height,["heights"]=JArray.FromObject(heights),["walkable"]=JArray.FromObject(walk),["spawn"]=Point(safeSpawn),["center"]=Point(center),["gate"]=Point(gatePoint),["locations"]=locations,["npcSpawns"]=npcSpawns,["restPoints"]=rests,["houses"]=houses,["outline"]=outline};
                Directory.CreateDirectory(Path.Combine(Repo,"native/ArtSource"));File.WriteAllText(Path.Combine(Repo,"native/ArtSource/new-world-runtime.json"),data.ToString(Newtonsoft.Json.Formatting.None));
                profile.referencePosition=camera.transform.position;profile.referenceRotation=camera.transform.rotation;profile.referenceFocus=center+Vector3.up*1.5f;profile.referenceFov=camera.fieldOfView;profile.referenceYaw=view.yaw;profile.referencePitch=view.pitch;profile.referenceZoom=view.zoom;
                RenderSettings.sun=view.sun;EditorSceneManager.SaveScene(scene,Destination);AssetDatabase.SaveAssets();
                EditorSceneManager.CloseScene(scene,true);SceneManager.SetActiveScene(source);
                EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/CampMind/Scenes/Startup.unity",true),new EditorBuildSettingsScene(Destination,true)};
                File.WriteAllText(Path.Combine(output,"installed.json"),new JObject{["success"]=true,["scene"]=Destination,["preservedManualScene"]=backup,["characters"]=actors.Count,["walkableCells"]=walk.Count(v=>v==1),["visualAccepted"]=false,["runtimeVerified"]=false}.ToString());
                File.WriteAllText(Request+".build","build installed map");
                Debug.Log("新地图已应用到正式世界："+Destination+"。原手调场景保持加载，正式游戏场景已作为活动场景。");
            }finally{foreach(var item in sourceRoots)if(item.g)item.g.SetActive(item.activeSelf);if(legacy.IsValid()&&legacy.isLoaded)EditorSceneManager.CloseScene(legacy,true);}
        }
    }
}
