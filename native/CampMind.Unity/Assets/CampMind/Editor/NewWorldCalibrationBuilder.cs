using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using CampMind.Presentation;

namespace CampMind.Editor
{
    public static class NewWorldCalibrationBuilder
    {
        public const int Width=1672, Height=941;
        public const string ScenePath="Assets/CampMind/Scenes/NewWorldCalibration.unity";
        public const string Folder="Assets/CampMind/NewWorldCalibration";
        private static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        private static Camera camera;
        private static JObject layout;
        private static Material ground,stone,wood,roof,water,road;
        private static JObject detailedMountainReport;
        private static readonly List<string> generated=new List<string>();

        public static Vector2 Project(Camera c,Vector3 point)
        {var p=c.WorldToViewportPoint(point);return new Vector2(p.x*Width,(1-p.y)*Height);}
        public static Vector3 Unproject(Camera c,Vector2 pixel,float height)
        {
            var x=pixel.x/Width*2-1;var y=1-pixel.y/Height*2;
            Vector3 origin,direction;
            if(c.orthographic){origin=c.transform.position+c.transform.right*x*c.orthographicSize*c.aspect+c.transform.up*y*c.orthographicSize;direction=c.transform.forward;}
            else{var t=Mathf.Tan(c.fieldOfView*Mathf.Deg2Rad*.5f);origin=c.transform.position;direction=c.transform.forward+c.transform.right*x*t*c.aspect+c.transform.up*y*t;}
            if(Mathf.Abs(direction.y)<1e-7f)throw new InvalidOperationException("Reference ray parallel to height plane");
            var distance=(height-origin.y)/direction.y;
            if(distance<=0)throw new InvalidOperationException("Reference pixel does not intersect the forward height plane");
            return origin+direction*distance;
        }
        private static Vector2 Pixel(JToken p)=>new Vector2((float)p[0],(float)p[1]);
        private static Vector3 At(JToken p,float h=0)=>Unproject(camera,Pixel(p),h);
        private static Vector3[] AtAll(JToken points,float h=0)=>points.Select(p=>At(p,h)).ToArray();
        private static Material Mat(string name,Color color)
        {
            var path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!m){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}
            m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",.12f);m.SetFloat("_Cull",0);return m;
        }
        private static GameObject MeshObject(string id,Vector3[] vertices,int[] triangles,Material material,bool collision=true)
        {
            var mesh=new Mesh{name=id};mesh.indexFormat=vertices.Length>65535?IndexFormat.UInt32:IndexFormat.UInt16;mesh.vertices=vertices;mesh.triangles=triangles;mesh.RecalculateNormals();mesh.RecalculateBounds();
            var path=Folder+"/"+id+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(existing){EditorUtility.CopySerialized(mesh,existing);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject(id);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;
            if(collision)go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            generated.Add(id);return go;
        }
        private static float Cross(Vector3 a,Vector3 b,Vector3 c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
        public static int[] Triangulate(Vector3[] points)
        {
            var remaining=Enumerable.Range(0,points.Length).ToList();var indices=new List<int>();
            var area=points.Select((p,i)=>p.x*points[(i+1)%points.Length].z-p.z*points[(i+1)%points.Length].x).Sum();if(area<0)remaining.Reverse();
            while(remaining.Count>2){var found=false;
                for(var i=0;i<remaining.Count;i++){
                    var a=remaining[(i+remaining.Count-1)%remaining.Count];var b=remaining[i];var c=remaining[(i+1)%remaining.Count];if(Cross(points[a],points[b],points[c])<=.00001f)continue;
                    if(remaining.Any(j=>j!=a&&j!=b&&j!=c&&Cross(points[a],points[b],points[j])>=-.00001f&&Cross(points[b],points[c],points[j])>=-.00001f&&Cross(points[c],points[a],points[j])>=-.00001f))continue;
                    indices.Add(a);indices.Add(c);indices.Add(b);remaining.RemoveAt(i);found=true;break;
                }
                if(!found)throw new InvalidOperationException("Invalid or self-intersecting traced polygon");
            }
            return indices.ToArray();
        }
        private static GameObject Extrude(string id,Vector3[] bottom,float height,Material material)
        {
            int n=bottom.Length;var vertices=bottom.Concat(bottom.Select(p=>p+Vector3.up*height)).ToArray();var indices=new List<int>(Triangulate(bottom).Select(i=>i+n));
            indices.AddRange(Triangulate(bottom).Reverse());
            for(int i=0;i<n;i++){var j=(i+1)%n;indices.AddRange(new[]{i,j,j+n,i,j+n,i+n});}
            return MeshObject(id,vertices,indices.ToArray(),material);
        }
        private static void Beam(string name,Vector3 a,Vector3 b,float width,float thickness,Material material)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.position=(a+b)*.5f;go.transform.rotation=Quaternion.LookRotation(b-a,Vector3.up);go.transform.localScale=new Vector3(width,thickness,Vector3.Distance(a,b));go.GetComponent<Renderer>().sharedMaterial=material;
        }
        private static void Line(string id,JToken pixels,float height,float width,Material material)
        {
            var p=AtAll(pixels,height);for(int i=1;i<p.Length;i++)Beam(id+"-"+i,p[i-1],p[i],width,.035f,material);
        }
        private static void Buildings()
        {
            foreach(var b in layout["buildings"]){
                var id=(string)b["id"];var baseH=(float)b["inferredBaseHeightMeters"];var height=(float)b["inferredHeightMeters"];
                var footprint=AtAll(b["footprint"],baseH);Extrude("building-"+id+"-body-proxy",footprint,height*.62f,wood);
                // Source roof contours determine visible edges; vertical depth is still an inference.
                var eaves=AtAll(b["roofBounds"],baseH+height*.72f);var ridge=AtAll(b["roofRidge"],baseH+height);
                var vertices=eaves.Concat(new[]{(ridge[0]+ridge[1])*.5f}).ToArray();var indices=new List<int>();
                for(var i=0;i<eaves.Length;i++)indices.AddRange(new[]{i,(i+1)%eaves.Length,eaves.Length});
                MeshObject("building-"+id+"-roof-contour-proxy",vertices,indices.ToArray(),roof);
            }
        }
        private static void Palisade()
        {
            var p=AtAll(layout["wall"]["footline"]);float height=(float)layout["wall"]["inferredHeightMeters"];
            var tipVertices=new List<Vector3>{Vector3.up*1.2f};var tipIndices=new List<int>();
            for(int i=0;i<8;i++){float angle=i*Mathf.PI*.25f;tipVertices.Add(new Vector3(Mathf.Cos(angle)*.475f,0,Mathf.Sin(angle)*.475f));}
            for(int i=0;i<8;i++)tipIndices.AddRange(new[]{0,1+(i+1)%8,1+i});
            var tipTemplate=MeshObject("palisade-tip-template",tipVertices.ToArray(),tipIndices.ToArray(),wood,false);var tipMesh=tipTemplate.GetComponent<MeshFilter>().sharedMesh;UnityEngine.Object.DestroyImmediate(tipTemplate);
            // Ends deliberately remain open at the measured gate interval.
            for(int i=1;i<p.Length;i++){
                var a=p[i-1];var b=p[i];int count=Mathf.CeilToInt(Vector3.Distance(a,b)/1.25f);
                for(int j=0;j<count;j++){
                    float t=(j+.5f)/count;var center=Vector3.Lerp(a,b,t);
                    var observedTops=layout["wall"]["observedTopY"];
                    float targetY=Mathf.Lerp((float)observedTops[i-1],(float)observedTops[i],t),lo=0,hi=40;
                    for(int k=0;k<24;k++){float mid=(lo+hi)*.5f;if(Project(camera,center+Vector3.up*mid).y>targetY)lo=mid;else hi=mid;}
                    height=Mathf.Max(.5f,(lo+hi)*.5f-1.2f);
                    var log=GameObject.CreatePrimitive(PrimitiveType.Cylinder);log.name="palisade-log";log.transform.position=center+Vector3.up*height*.5f;log.transform.localScale=new Vector3(.95f,height*.5f,.95f);log.GetComponent<Renderer>().sharedMaterial=wood;
                    var tip=new GameObject("palisade-point");tip.transform.position=center+Vector3.up*height;tip.AddComponent<MeshFilter>().sharedMesh=tipMesh;tip.AddComponent<MeshRenderer>().sharedMaterial=wood;
                }
                Beam("wall-stone-base",a+Vector3.up*.4f,b+Vector3.up*.4f,1.5f,.8f,stone);
            }
            var g=layout["gate"];var left=At(g["left"]);var right=At(g["right"]);var top=(float)g["inferredHeightMeters"];
            foreach(var end in new[]{left,right})Beam("gate-post",end,end+Vector3.up*top,1.5f,1.5f,wood);
            Beam("gate-top-beam",left+Vector3.up*top,right+Vector3.up*top,1.7f,1.7f,wood);
        }
        private static void BridgeAndStairs()
        {
            var bridge=layout["bridge"];var h=(float)bridge["inferredDeckHeightMeters"];var a=At(bridge["outerEnd"],h);var b=At(bridge["villageEnd"],h);var width=(float)bridge["inferredWidthMeters"];
            Beam("bridge-deck",a,b,width,.5f,wood);var side=Vector3.Cross(Vector3.up,(b-a).normalized)*width*.48f;
            foreach(var offset in new[]{side,-side}){
                Beam("bridge-rail",a+offset+Vector3.up*1.2f,b+offset+Vector3.up*1.2f,.18f,.18f,wood);
                for(int i=0;i<=10;i++){var p=Vector3.Lerp(a,b,i/10f)+offset;Beam("bridge-post",p-Vector3.up*3,p+Vector3.up*1.25f,.22f,.22f,wood);}
            }
            var s=layout["stairs"];var tl=At(s["topLeft"],(float)s["inferredTopHeightMeters"]);var tr=At(s["topRight"],(float)s["inferredTopHeightMeters"]);var bl=At(s["bottomLeft"]);var br=At(s["bottomRight"]);var steps=(int)s["stepCount"];
            var stairStone=Mat("NewStairStone",new Color(.90f,.88f,.80f));stairStone.shader=Shader.Find("CampMind/New World Stone");
            // Separate step meshes preserve actual horizontal treads; not a painted ramp.
            for(int i=0;i<steps;i++){
                float t0=i/(float)steps,t1=(i+1)/(float)steps;var l0=Vector3.Lerp(bl,tl,t0);var r0=Vector3.Lerp(br,tr,t0);var l1=Vector3.Lerp(bl,tl,t1);var r1=Vector3.Lerp(br,tr,t1);var y=l1.y;
                Extrude("main-stair-"+i,new[]{new Vector3(l0.x,0,l0.z),new Vector3(r0.x,0,r0.z),new Vector3(r1.x,0,r1.z),new Vector3(l1.x,0,l1.z)},Mathf.Max(.05f,y),stairStone);
            }
        }
        private static void Mountains()
        {
            NewWorldMountainBuilder.Build(camera,layout);
            detailedMountainReport=NewWorldDetailedMountainBuilder.Build(camera,layout);
        }
        public static void BuildScene(){BuildScene(false);}
        private static void BuildScene(bool withSample,bool withStage2=false,bool withStage3=false)
        {
            Directory.CreateDirectory(Folder);AssetDatabase.Refresh();generated.Clear();
            var layoutBytes=File.ReadAllBytes(Path.Combine(Repo,"docs/new-world/layout.json"));layout=JObject.Parse(System.Text.Encoding.UTF8.GetString(layoutBytes));
            string layoutHash;using(var sha=SHA256.Create())layoutHash=BitConverter.ToString(sha.ComputeHash(layoutBytes)).Replace("-","").ToLowerInvariant();
            var source=Path.Combine(Repo,"native/ArtSource/new-world-20261017/selected-world-map.png");
            using(var sha=SHA256.Create()){var hash=BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(source))).Replace("-","").ToLowerInvariant();if(hash!=(string)layout["referenceSha256"])throw new InvalidOperationException("Wrong new-map reference binding");}
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var cameraFit=layout["activeCameraInference"];float pitch=(float)cameraFit["pitch"],distance=(float)cameraFit["distance"],fov=(float)cameraFit["verticalFov"];
            camera=new GameObject("New world reference camera — candidate").AddComponent<Camera>();camera.tag="MainCamera";camera.aspect=Width/(float)Height;camera.nearClipPlane=.1f;camera.farClipPlane=3000;camera.fieldOfView=fov;camera.orthographicSize=Height*.14f*.5f;camera.transform.rotation=Quaternion.Euler(pitch,0,0);camera.transform.position=-camera.transform.forward*distance;
            camera.backgroundColor=new Color(.78f,.84f,.84f);camera.clearFlags=CameraClearFlags.SolidColor;camera.gameObject.AddComponent<AudioListener>();camera.gameObject.AddComponent<UniversalAdditionalCameraData>();
            ground=Mat("GroundProxy",new Color(.53f,.58f,.36f));stone=Mat("StoneProxy",new Color(.52f,.55f,.52f));wood=Mat("WoodProxy",new Color(.48f,.33f,.19f));roof=Mat("RoofProxy",new Color(.25f,.33f,.38f));water=Mat("WaterProxy",new Color(.37f,.67f,.70f));road=Mat("RoadProxy",new Color(.73f,.66f,.47f));
            ground.shader=Shader.Find("CampMind/New World Ground");ground.SetFloat("_Dirt",0);road.shader=ground.shader;road.SetFloat("_Dirt",1);
            var terrainReport=NewWorldTerrainBuilder.Build(camera,layout,ground);
            var riverReport=NewWorldRiverBuilder.Build(camera,layout["river"],layout["bankRockObservations"]);
            Buildings();Palisade();BridgeAndStairs();Mountains();
            var platformReport=NewWorldPlatformBuilder.Build(camera,layout,ground);
            var observedRocks=NewWorldObservedRockBuilder.Build(camera,layout["bankRockObservations"],layout["river"]);
            JObject sourceTerrainReport=null;
            if(withStage3&&layout["terrainRegistrationInferences"]!=null)sourceTerrainReport=NewWorldTerrainSourceBuilder.Build(camera,layout);
            MeshObject("central-plaza",AtAll(layout["plaza"]["outline"],.035f),Triangulate(AtAll(layout["plaza"]["outline"],.035f)),stone);
            var foot=At(layout["plaza"]["stoneFoot"]);var tip=At(layout["plaza"]["stoneTop"],9);Beam("central-standing-stone-proxy",foot,tip,2,2,stone);
            if(sourceTerrainReport==null)foreach(var r in layout["roads"])Line("road",r,.065f,1.8f,road);
            var light=new GameObject("New world inspection daylight").AddComponent<Light>();light.type=LightType.Directional;light.transform.rotation=Quaternion.Euler(45,-35,0);light.color=new Color(1,.95f,.83f);light.intensity=1.4f;light.shadows=LightShadows.Soft;light.gameObject.AddComponent<UniversalAdditionalLightData>();RenderSettings.sun=light;RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.65f,.70f,.72f);RenderSettings.fog=false;RenderSettings.skybox=null;
            light.intensity=1.05f;light.color=new Color(1,.98f,.91f);RenderSettings.ambientLight=new Color(.57f,.62f,.61f);RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogColor=new Color(.78f,.84f,.83f);RenderSettings.fogStartDistance=300;RenderSettings.fogEndDistance=650;
            var view=camera.gameObject.AddComponent<NewWorldCalibrationView>();view.referenceCamera=camera;
            camera.gameObject.AddComponent<NewWorldAtmosphereRuntime>().target=camera;
            CreateExistingActor(view);
            File.Copy(source,Folder+"/SelectedReference.png",true);AssetDatabase.ImportAsset(Folder+"/SelectedReference.png");
            var importer=(TextureImporter)AssetImporter.GetAtPath(Folder+"/SelectedReference.png");importer.npotScale=TextureImporterNPOTScale.None;importer.maxTextureSize=2048;importer.SaveAndReimport();view.reference=AssetDatabase.LoadAssetAtPath<Texture2D>(Folder+"/SelectedReference.png");
            var report=new JObject{["status"]="new-world-inferred-greybox",["referenceSha256"]=layout["referenceSha256"].DeepClone(),["width"]=Width,["height"]=Height,["cameraProjectionCandidate"]="perspective",["cameraPitchCandidate"]=pitch,["cameraFovCandidate"]=fov,["cameraDistanceCandidate"]=distance,["cameraInference"]=cameraFit.DeepClone(),["orthographicSizeCandidate"]=camera.orthographicSize,["inferences"]=layout["inferences"].DeepClone(),["generatedMeshes"]=new JArray(generated),["visualAccepted"]=false,["authorityConnected"]=false,["newPaidTasks"]=0};
            if(withSample){report["sampleAssets"]=AddSampleAssets();report["status"]="new-world-three-asset-sample-not-accepted";report["sourceAssetPaidTasks"]=3;report["sourceAssetCredits"]=180;}
            report["layoutSha256"]=layoutHash;
            report["mountainSourceCorrections"]=detailedMountainReport;
            report["platform"]=platformReport;
            if(withStage2){report["stage2Placement"]=PlaceStage2Architecture();report["observedVegetation"]=PlaceObservedVegetation();report["settlementDetails"]=NewWorldSettlementDetailBuilder.Build(camera,layout,view);report["stage2Studio"]=NewWorldAssetStudioBuilder.Build(view,withStage3);report["status"]="new-world-source-architecture-placement-under-review";report["sourceAssetPaidTasks"]=withStage3?13:9;report["sourceAssetCredits"]=withStage3?780:540;}
            if(withStage3){
                var r=layout["stage3PlacementInferences"]["gateBounds"];var fit=FitSample("placed-source-gate","stage3/gate",Rect.MinMaxRect((float)r[0],(float)r[1],(float)r[2],(float)r[3]),(float)layout["stage3PlacementInferences"]["gateYaw"]);
                var gateOwner=GameObject.Find("placed-source-gate — new Tripo candidate, not accepted");
                report["stage3Placement"]=new JObject{["gateFit"]=fit,["gateLeaves"]=NewWorldSourceModules.AttachGateLeaves(gateOwner,view),["palisade"]=NewWorldSourceModules.ReplacePalisade(camera,layout),["bridge"]=NewWorldSourceModules.PlaceBridge(camera,layout),["yardFences"]=NewWorldSourceModules.PlaceYardFences(camera,layout)};
                report["plazaDetails"]=NewWorldPlazaBuilder.Build(camera,layout);
                report["standingStoneSource"]=NewWorldStandingStoneBuilder.Build(camera,layout);
                report["observedArchitecturalDetails"]=NewWorldDetailBuilder.Build(camera,layout);
                report["sourceGeometryCorrections"]=NewWorldSourceFitBuilder.Build(camera,layout);
                foreach(var rows in new[]{report["sampleAssets"],report["stage2Placement"]})if(rows!=null)foreach(var row in rows.Where(row=>((string)row["id"]??"").StartsWith("controlled-",StringComparison.Ordinal))){row["rendered"]=false;row["replacement"]="UV-preserving derived source geometry; see sourceGeometryCorrections";}
                report["atmosphere"]=NewWorldAtmosphereBuilder.Build(camera,layout);
                if(sourceTerrainReport!=null){report["sourceTerrain"]=sourceTerrainReport;report["sourceAssetPaidTasks"]=14;report["sourceAssetCredits"]=840;
                    Physics.SyncTransforms();
                    var surfaces=UnityEngine.Object.FindObjectsByType<MeshCollider>(FindObjectsSortMode.None).Where(c=>c.name.StartsWith("Registered terrain section",StringComparison.Ordinal)||c.name.StartsWith("main-stair-",StringComparison.Ordinal)||c.name.EndsWith("-relief",StringComparison.Ordinal)).ToArray();
                    Vector3 Grounded(Vector3 p){var hits=surfaces.Select(c=>{bool hit=c.Raycast(new Ray(new Vector3(p.x,100,p.z),Vector3.down),out var info,200);return (hit,info);}).Where(h=>h.hit).ToArray();if(hits.Length>0)p.y=hits.Max(h=>h.info.point.y);return p;}
                    view.walkTargets=view.walkTargets.Select(Grounded).ToArray();foreach(var route in view.yardRoutes)route.points=route.points.Select(Grounded).ToArray();
                    report["routeHeightPolicy"]="Probe target heights sampled from actual registered ground and stairs, not assumed flat zero; this does not bypass collision movement";
                }
                report["bankSourceDetails"]=NewWorldBankDetailBuilder.Build(camera,layout);
            }
            report["terrain"]=terrainReport;report["river"]=riverReport;report["observedRocks"]=observedRocks;view.report=report.ToString();var output=Path.Combine(Repo,"native/Artifacts/new-world-calibration");Directory.CreateDirectory(output);File.WriteAllText(Path.Combine(output,"scene-report.json"),view.report);
            AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(scene,ScenePath);
        }
        private static void CreateExistingActor(NewWorldCalibrationView view)
        {
            const string path="Assets/CampMind/Content/Models/lord.glb";
            var owner=new GameObject("Existing lord — reused rig and locomotion");var visual=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path),owner.transform);
            var renderers=visual.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new InvalidOperationException("Existing lord model has no renderer");
            var bounds=renderers[0].bounds;foreach(var renderer in renderers)bounds.Encapsulate(renderer.bounds);
            float scale=1.85f/bounds.size.y;visual.transform.localScale=Vector3.one*scale;visual.transform.localPosition=new Vector3(-bounds.center.x,-bounds.min.y,-bounds.center.z)*scale;
            var motor=owner.AddComponent<CharacterController>();motor.height=1.85f;motor.radius=.28f;motor.center=new Vector3(0,.94f,0);motor.stepOffset=.4f;motor.slopeLimit=50;motor.skinWidth=.035f;
            owner.transform.position=At(layout["bridge"]["outerEnd"])+Vector3.up*.4f;
            var animator=visual.GetComponentInChildren<Animator>();if(!animator)throw new InvalidOperationException("Existing lord rig missing");animator.applyRootMotion=false;animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
            var clips=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c=>c.name=="Idle"||c.name=="Walk").ToArray();if(clips.Length!=2)throw new InvalidOperationException("Existing lord Idle/Walk missing");
            var controllerPath=Folder+"/ExistingLord.controller";var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if(!controller){controller=AnimatorController.CreateAnimatorControllerAtPath(controllerPath);foreach(var clip in clips){var state=controller.layers[0].stateMachine.AddState(clip.name);state.motion=clip;if(clip.name=="Idle")controller.layers[0].stateMachine.defaultState=state;}}
            animator.runtimeAnimatorController=controller;view.actor=owner.transform;
            var gate=(At(layout["gate"]["left"])+At(layout["gate"]["right"]))* .5f;
            var stairBottom=(At(layout["stairs"]["bottomLeft"])+At(layout["stairs"]["bottomRight"]))* .5f;
            var stairTop=(At(layout["stairs"]["topLeft"],10)+At(layout["stairs"]["topRight"],10))* .5f;
            view.walkTargets=new[]{At(layout["bridge"]["outerEnd"]),At(layout["bridge"]["villageEnd"]),gate,At(new JArray(886,459)),stairBottom,stairTop};
            view.yardRoutes=layout["yardWalkRouteInferences"].Select(r=>new NewWorldWalkRoute{id=(string)r["id"],points=r["pixels"].Select(p=>At(p,NewWorldTerrainBuilder.HeightAt(Pixel(p),layout))).ToArray()}).ToArray();
        }
        private static JObject FitSample(string id,string model,Rect target,float yaw,float baseHeight=0,bool fitHeight=false)
        {
            var path=Folder+"/Models/"+model+".glb";var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(!source)throw new FileNotFoundException("New sample missing",path);
            var owner=new GameObject(id+" — new Tripo candidate, not accepted");var instance=UnityEngine.Object.Instantiate(source,owner.transform);var points=new List<Vector3>();
            foreach(var filter in instance.GetComponentsInChildren<MeshFilter>())foreach(var v in filter.sharedMesh.vertices)points.Add(filter.transform.TransformPoint(v));
            if(points.Count==0)throw new InvalidOperationException("No new sample vertices");var bounds=new Bounds(points[0],Vector3.zero);foreach(var p in points)bounds.Encapsulate(p);
            var origin=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);var vertices=points.Select(p=>p-origin).ToArray();var rotation=Quaternion.Euler(0,yaw,0);float scale=1;var at=Unproject(camera,new Vector2(target.center.x,target.yMax),baseHeight);
            Rect Measure(){float x0=float.PositiveInfinity,y0=float.PositiveInfinity,x1=float.NegativeInfinity,y1=float.NegativeInfinity;foreach(var v in vertices){var p=Project(camera,at+rotation*(v*scale));x0=Mathf.Min(x0,p.x);y0=Mathf.Min(y0,p.y);x1=Mathf.Max(x1,p.x);y1=Mathf.Max(y1,p.y);}return Rect.MinMaxRect(x0,y0,x1,y1);}
            for(int i=0;i<6;i++){var b=Measure();scale*=fitHeight?target.height/b.height:target.width/b.width;b=Measure();at+=Unproject(camera,new Vector2(target.center.x,target.yMax),baseHeight)-Unproject(camera,new Vector2(b.center.x,b.yMax),baseHeight);}
            // One uniform scale: never stretch a source to fake the supplied proportions.
            owner.transform.SetPositionAndRotation(at,rotation);instance.transform.localPosition=-origin*scale;instance.transform.localScale=Vector3.one*scale;
            var projected=Measure();return new JObject{["id"]=id,["model"]=model,["source"]=path,["uniformScale"]=scale,["yawCandidate"]=yaw,["targetBounds"]=new JArray(target.xMin,target.yMin,target.xMax,target.yMax),["projectedBounds"]=new JArray(projected.xMin,projected.yMin,projected.xMax,projected.yMax),["worldPosition"]=new JArray(at.x,at.y,at.z),["heightDifferencePixels"]=projected.height-target.height,["accepted"]=false};
        }
        private static JArray PlaceStage2Architecture()
        {
            var rows=new JArray();
            foreach(var item in new[]{("H","hall",80f,10f),("T","watchtower",0f,0f)}){
                var b=layout["buildings"].First(row=>(string)row["id"]==item.Item1);
                var pixels=b["roofBounds"].Select(Pixel).Concat(b["footprint"].Select(Pixel)).ToArray();
                var target=Rect.MinMaxRect(pixels.Min(p=>p.x),pixels.Min(p=>p.y),pixels.Max(p=>p.x),pixels.Max(p=>p.y));
                var id="placed-source-"+item.Item1;
                var row=FitSample(id,"stage2/"+item.Item2,target,item.Item3,item.Item4,item.Item1=="T");
                row["referenceBuilding"]=item.Item1;row["baseHeightInferredMeters"]=item.Item4;
                row["rendered"]=true;row["collisionPolicy"]="Source renderer replaces proxy; reference footprint collider retained pending art correction";
                rows.Add(row);
                if(item.Item1=="H"){
                    // The new source is 135px too tall at the observed width. Retain
                    // it unchanged for inspection; reconstruct the separate roof tiers.
                    GameObject.Find(id+" — new Tripo candidate, not accepted").SetActive(false);
                    row["rendered"]=false;
                    rows.Add(NewWorldArchitectureBuilder.BuildHall(camera,b,layout["controlledHall"]));
                }
                foreach(var suffix in new[]{"body-proxy","roof-contour-proxy"}){
                    var proxy=GameObject.Find("building-"+item.Item1+"-"+suffix);
                    if(proxy)proxy.GetComponent<MeshRenderer>().enabled=false;
                }
            }
            return rows;
        }
        private static JArray PlaceObservedVegetation()
        {
            var path=Path.Combine(Repo,"docs/new-world/vegetation-observations.json");
            var data=JObject.Parse(File.ReadAllText(path));
            if((string)data["referenceSha256"]!=(string)layout["referenceSha256"])throw new InvalidOperationException("Vegetation reference mismatch");
            var old=GameObject.Find("sample-conifer-foreground — new Tripo candidate, not accepted");if(old)old.SetActive(false);
            var rows=new JArray();
            foreach(var observation in data["observations"]){
                var r=observation["bounds"];var rect=Rect.MinMaxRect((float)r[0],(float)r[1],(float)r[2],(float)r[3]);
                var model=(string)observation["model"];
                var baseHeight=(float?)observation["inferredGroundHeightMeters"]??NewWorldTerrainBuilder.HeightAt(new Vector2(rect.center.x,rect.yMax),layout);
                var footPixel=new Vector2(rect.center.x,rect.yMax);var groundPoint=Unproject(camera,footPixel,0);var ray=new Ray(camera.transform.position,(groundPoint-camera.transform.position).normalized);
                var hits=UnityEngine.Object.FindObjectsByType<MeshCollider>(FindObjectsSortMode.None).Where(c=>c.name.StartsWith("mountain-",StringComparison.Ordinal)||c.name.StartsWith("Registered terrain section",StringComparison.Ordinal)||c.name.EndsWith("-relief",StringComparison.Ordinal)).Select(c=>{var hit=c.Raycast(ray,out var info,2000);return (hit,info);}).Where(h=>h.hit).OrderBy(h=>h.info.distance).ToArray();if(hits.Length>0)baseHeight=hits[0].info.point.y;
                var row=FitSample("observed-tree-"+(string)observation["id"],model,rect,0,baseHeight,true);
                var tree=GameObject.Find("observed-tree-"+(string)observation["id"]+" — new Tripo candidate, not accepted");
                float previousWidth=(float)row["projectedBounds"][2]-(float)row["projectedBounds"][0];
                tree.transform.localScale=new Vector3(rect.width/previousWidth,1,1);
                if((bool?)observation["foregroundShade"]==true){int part=0;foreach(var renderer in tree.GetComponentsInChildren<Renderer>())renderer.sharedMaterials=renderer.sharedMaterials.Select(original=>{var tintPath=Folder+"/foreground-leaves-"+(string)observation["id"]+"-"+part+++".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(tintPath);if(!material){material=new Material(original);AssetDatabase.CreateAsset(material,tintPath);}foreach(var property in new[]{"baseColorFactor","_BaseColor","_Color"})if(material.HasProperty(property))material.SetColor(property,new Color(.24f,.5f,1.35f));return material;}).ToArray();}
                var fitted=tree.GetComponentsInChildren<MeshFilter>().SelectMany(f=>f.sharedMesh.vertices.Select(v=>Project(camera,f.transform.TransformPoint(v)))).ToArray();
                row["uncorrectedWidthDifferencePixels"]=previousWidth-rect.width;
                row["projectedBounds"]=new JArray(fitted.Min(p=>p.x),fitted.Min(p=>p.y),fitted.Max(p=>p.x),fitted.Max(p=>p.y));
                row["inferredGroundHeightMeters"]=baseHeight;
                row["observation"]=observation.DeepClone();row["widthDifferencePixels"]=(float)row["projectedBounds"][2]-(float)row["projectedBounds"][0]-rect.width;
                row["rendered"]=true;row["fitPolicy"]="Observed crown height and width correction; source GLB immutable, hidden depth unchanged/inferred; no random scatter, crown shape not accepted";rows.Add(row);
            }
            return rows;
        }
        private static JArray AddSampleAssets()
        {
            // Other houses remain explicit proxies. One approved house is not a licence
            // to duplicate or stretch it into all five distinct footprints.
            foreach(var name in new[]{"A","B","C","D","E"}.SelectMany(id=>new[]{"building-"+id+"-body-proxy","building-"+id+"-roof-contour-proxy"})){
                var go=GameObject.Find(name);if(!go)throw new InvalidOperationException("Missing proxy "+name);go.GetComponent<MeshRenderer>().enabled=false;
            }
            var rows=new JArray{FitSample("sample-house-B","house",Rect.MinMaxRect(350,348,530,452),80),FitSample("sample-rock-rear-west","rock",Rect.MinMaxRect(532,20,727,244),0),FitSample("sample-conifer-foreground","conifer",Rect.MinMaxRect(174,670,280,916),0)};
            // Keep the unaccepted paid candidate intact for comparison; its width-fit
            // height error cannot be resolved by stretching. Rebuild this one house
            // directly from the source footprint, eaves and ridge instead.
            GameObject.Find("sample-house-B — new Tripo candidate, not accepted").SetActive(false);rows[0]["rendered"]=false;
            GameObject.Find("sample-rock-rear-west — new Tripo candidate, not accepted").SetActive(false);rows[1]["rendered"]=false;
            foreach(var id in new[]{"A","B","C","D","E"}){
                foreach(var name in new[]{"building-"+id+"-body-proxy","building-"+id+"-roof-contour-proxy"}){var oldCollider=GameObject.Find(name).GetComponent<MeshCollider>();if(oldCollider)UnityEngine.Object.DestroyImmediate(oldCollider);}
                rows.Add(NewWorldArchitectureBuilder.BuildHouse(camera,layout["buildings"].First(b=>(string)b["id"]==id),layout["controlledHouses"][id]));
            }
            foreach(var chain in layout["sampleYardB"]){var points=AtAll(chain);
                for(int i=1;i<points.Length;i++){
                    var a=points[i-1];var b=points[i];int count=Mathf.CeilToInt(Vector3.Distance(a,b)/2.3f);
                    foreach(var height in new[]{.55f,1.1f})Beam("new-yard-B-rail",a+Vector3.up*height,b+Vector3.up*height,.14f,.14f,wood);
                    for(int j=0;j<=count;j++){var p=Vector3.Lerp(a,b,j/(float)count);Beam("new-yard-B-post",p,p+Vector3.up*1.45f,.2f,.2f,wood);}
                }
            }
            var manifest=JObject.Parse(File.ReadAllText(Folder+"/Models/sources.json"));rows.Add(new JObject{["sourceManifest"]=manifest,["collisionPolicy"]="Existing greybox colliders retained during art assessment; raw generated geometry is not yet accepted collision."});return rows;
        }
        public static void BuildPlayer(){BuildPlayer(false);}
        public static void BuildSamplePlayer(){BuildPlayer(true);}
        public static void BuildStage2Player(){BuildPlayer(true,true);}
        public static void BuildStage3Player(){BuildPlayer(true,true,true);}
        private static void BuildPlayer(bool withSample,bool withStage2=false,bool withStage3=false)
        {
            BuildScene(withSample,withStage2,withStage3);var output=Path.Combine(Repo,"native/Builds/NewWorldCalibration");Directory.CreateDirectory(output);var backend=PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone);var scenes=EditorBuildSettings.scenes;
            try{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,ScriptingImplementation.Mono2x);var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=Path.Combine(output,"NewWorldCalibration.exe"),target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});if(report.summary.result!=BuildResult.Succeeded)throw new Exception("New world calibration build failed");}
            finally{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,backend);EditorBuildSettings.scenes=scenes;AssetDatabase.SaveAssets();}
        }
    }
}
