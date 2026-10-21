using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
namespace CampMind.Editor
{
    public static class NewWorldStairRepair
    {
        const string ScenePath="Assets/CampMind/NewWorldGame/Camp.unity";
        static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        static string Output=>Path.Combine(Repo,"native/Artifacts/main-hall-stairs");
        static JArray V(Vector3 v)=>new JArray(v.x,v.y,v.z);
        static readonly Vector3 Bottom=new Vector3(8,3.3f,24),Top=new Vector3(22,12.25f,40);
        static Vector3 Forward=>Vector3.ProjectOnPlane(Top-Bottom,Vector3.up).normalized;
        static Vector3 Side=>Vector3.Cross(Vector3.up,Forward);
        static float Run=>Vector3.ProjectOnPlane(Top-Bottom,Vector3.up).magnitude;
        const string Folder="Assets/CampMind/NewWorldGame/StairsRepair";
        public static void CorrectionInspect()=>NewWorldConnectionCorrection.Inspect();
        public static void CorrectionRepair()=>NewWorldConnectionCorrection.RepairConnections();
        public static void CorrectionRebuild()=>NewWorldConnectionCorrection.RebuildConnections();
        public static void CorrectionBuild()=>NewWorldConnectionCorrection.Build();
        public static void CorrectionOriginalOpening()=>NewWorldConnectionCorrection.FitOriginalOpening();
        public static void CorrectionFinishOpening()=>NewWorldConnectionCorrection.FinishOriginalOpening();
        public static void CorrectionApronBuild()=>NewWorldConnectionCorrection.FinishApronAndBuild();
        public static void CorrectionPolishBuild()=>NewWorldConnectionCorrection.PolishOpeningAndBuild();
        public static void CorrectionGroundBuild()=>NewWorldConnectionCorrection.RaiseFootAndBuild();
        public static void CorrectionLandingBuild()=>NewWorldConnectionCorrection.LandingAndBuild();
        public static void CorrectionOpenHeadBuild()=>NewWorldConnectionCorrection.ClearStairHeadAndBuild();
        public static void CorrectionExtendContactBuild()=>NewWorldConnectionCorrection.ExtendHallContactAndBuild();
        public static void CorrectionBridgeVisualBuild()=>NewWorldConnectionCorrection.FinishBridgeVisualAndBuild();
        public static void CorrectionRiverUvBuild()=>NewWorldConnectionCorrection.FinishRiverUvAndBuild();
        public static void CorrectionAudit(){NewWorldConnectionCorrection.AuditPassage();NewWorldConnectionCorrection.AuditStairSurface();NewWorldConnectionCorrection.AuditHallFloors();}
        public static void CorrectionSeam()=>NewWorldConnectionCorrection.ResolvePassage();
        public static void CorrectionGateTerrain()=>NewWorldConnectionCorrection.SmoothGateTerrain();
        public static void FinishPorch()
        {
            var scene=EditorSceneManager.OpenScene(ScenePath);if(scene.GetRootGameObjects().Any(g=>g.name=="主殿上平台石阶接合"))throw new InvalidOperationException("Upper steps already fitted");
            var old=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>()).First(f=>f.name=="main-stair-upper-porch-transition");float endHeight=old.sharedMesh.vertices[12*17+8].y;old.gameObject.SetActive(false);var root=new GameObject("主殿上平台石阶接合");var mat=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/porch-stone.mat");const int count=8;float begin=Run-.15f,end=Run+6.1f;
            for(int i=0;i<count;i++){float a=Mathf.Lerp(begin,end,i/(float)count),b=Mathf.Lerp(begin,end,(i+1)/(float)count),h=Mathf.Lerp(Top.y+.13f,endHeight,(i+1)/(float)count);var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);cube.name="main-stair-porch-tread-"+i;cube.layer=9;cube.transform.SetParent(root.transform);cube.transform.SetPositionAndRotation(Bottom+Forward*((a+b)*.5f)+Vector3.up*((Top.y-.2f+h)*.5f-Bottom.y),Quaternion.LookRotation(Forward));cube.transform.localScale=new Vector3(8.8f,h-(Top.y-.2f),b-a+.003f);cube.GetComponent<Renderer>().sharedMaterial=mat;}
            var hall=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>()).First(f=>f.transform.GetComponentsInParent<Transform>().Any(t=>t.name.StartsWith("Source-corrected H")));var hc=hall.gameObject.AddComponent<MeshCollider>();hc.sharedMesh=hall.sharedMesh;var vertices=new List<Vector3>();var triangles=new List<int>();float previous=endHeight;
            for(int z=0;z<=32;z++){float s=end+z*.25f;var center=Bottom+Forward*s;float height=previous;if(hc.Raycast(new Ray(new Vector3(center.x,17,center.z),Vector3.down),out var hit,20)&&hit.normal.y>.65f&&hit.point.y>11&&hit.point.y<16)height=Mathf.Clamp(hit.point.y+.025f,previous-.1f,previous+.1f);previous=height;foreach(float l in new[]{-3.9f,3.9f}){var p=center+Side*l;p.y=height;vertices.Add(p);}if(z>0){int n=z*2;triangles.AddRange(new[]{n-2,n,n-1,n-1,n,n+1});}}
            UnityEngine.Object.DestroyImmediate(hc);Create("main-stair-porch-entrance-walk",vertices.ToArray(),triangles.ToArray(),null,root.transform,false);AssetDatabase.SaveAssets();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);Physics.SyncTransforms();RefreshAuthority();var camera=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));camera.transform.position=Top-Forward*8+Vector3.up*6;camera.transform.LookAt(Top+Forward*3);camera.fieldOfView=60;Capture(camera,"porch-cleared.png");
        }
        public static void ClearPorch()
        {
            var scene=EditorSceneManager.OpenScene(ScenePath);var hall=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>()).First(f=>f.transform.GetComponentsInParent<Transform>().Any(t=>t.name.StartsWith("Source-corrected H")));
            if(AssetDatabase.GetAssetPath(hall.sharedMesh).StartsWith(Folder+"/hall-porch-cleared"))throw new InvalidOperationException("Porch already cleared");
            var world=UnityEngine.Object.Instantiate(hall.sharedMesh);world.vertices=world.vertices.Select(hall.transform.TransformPoint).ToArray();world.normals=world.normals.Select(hall.transform.TransformDirection).ToArray();world.RecalculateBounds();
            var outline=new[]{Bottom+Forward*(Run+.01f)-Side*4.35f,Bottom+Forward*(Run+.01f)+Side*4.35f,Bottom+Forward*(Run+5.98f)+Side*4.35f,Bottom+Forward*(Run+5.98f)-Side*4.35f};var cut=StaticMeshClip.SubtractAbovePolygons(world,new[]{outline},new[]{-20f},new[]{14.1f});var compact=NewWorldSourceModules.Compact(cut);UnityEngine.Object.DestroyImmediate(world);UnityEngine.Object.DestroyImmediate(cut);compact.vertices=compact.vertices.Select(hall.transform.InverseTransformPoint).ToArray();compact.RecalculateNormals();compact.RecalculateTangents();compact.RecalculateBounds();SaveMesh("hall-porch-cleared",compact);hall.sharedMesh=compact;
            var transition=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>()).First(f=>f.name=="main-stair-upper-porch-transition");var stone=new Material(AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewStairStone.mat"));stone.SetColor("_BaseColor",new Color(.62f,.62f,.56f));AssetDatabase.CreateAsset(stone,Folder+"/porch-stone.mat");transition.GetComponent<Renderer>().sharedMaterial=stone;
            AssetDatabase.SaveAssets();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);Physics.SyncTransforms();RefreshAuthority();var camera=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));camera.transform.position=Top-Forward*8+Vector3.up*6;camera.transform.LookAt(Top+Forward*3);camera.fieldOfView=60;Capture(camera,"porch-cleared.png");
        }
        public static void PolishAndBuild(){EditorSceneManager.OpenScene(ScenePath);var marker=Path.Combine(Output,"landing-polish.json");if(!File.Exists(marker)){var filter=UnityEngine.Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None).First(f=>f.name=="main-stair-upper-porch-transition");var mesh=filter.sharedMesh;mesh.vertices=mesh.vertices.Select(v=>new Vector3(v.x,Mathf.Max(Top.y+.13f,v.y+.12f),v.z)).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();EditorUtility.SetDirty(mesh);filter.GetComponent<MeshCollider>().sharedMesh=null;filter.GetComponent<MeshCollider>().sharedMesh=mesh;AssetDatabase.SaveAssets();File.WriteAllText(marker,new JObject{["minimumHeight"]=Top.y+.13f,["sourceFloorClearance"]=.135f,["reason"]="Prevent coincident generated landing and source porch triangles"}.ToString());}FinalizeAndBuild();}
        public static void FinalizeAndBuild(){var scene=EditorSceneManager.OpenScene(ScenePath);var material=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/apron.mat");material.SetFloat("_RockSlope",1);EditorUtility.SetDirty(material);AssetDatabase.SaveAssets();Physics.SyncTransforms();RefreshAuthority();AssetDatabase.Refresh();var camera=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));Capture(camera,"after-overview.png");camera.transform.position=Bottom-Forward*19+Vector3.up*10;camera.transform.LookAt(Top);camera.fieldOfView=60;Capture(camera,"after-close.png");NewWorldGameInstaller.BuildGame();}
        public static void ValidateInstalled(){var scene=EditorSceneManager.OpenScene(ScenePath);var filters=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>()).ToArray();var sf=filters.First(f=>f.name.StartsWith("主殿石阶"));var collider=sf.gameObject.AddComponent<MeshCollider>();collider.sharedMesh=sf.sharedMesh;var samples=new JArray();for(float s=-2;s<=Run+6;s+=1){var p=Bottom+Forward*s;var ray=new Ray(new Vector3(p.x,30,p.z),Vector3.down);var row=new JObject{["s"]=s};if(collider.Raycast(ray,out var h,60)){row["visible"]=h.point.y;row["normal"]=h.normal.y;}row["surfaces"]=new JArray(Physics.RaycastAll(ray,60).OrderByDescending(v=>v.point.y).Select(v=>new JObject{["name"]=v.collider.name,["y"]=v.point.y}));samples.Add(row);}File.WriteAllText(Path.Combine(Output,"installed-heights.json"),samples.ToString());}
        public static void RepairAndBuild(){Repair();NewWorldGameInstaller.BuildGame();}
        public static void Repair()
        {
            Directory.CreateDirectory(Output);Directory.CreateDirectory(Folder);AssetDatabase.Refresh();var scene=EditorSceneManager.OpenScene(ScenePath);
            if(scene.GetRootGameObjects().Any(g=>g.name=="主殿新石阶 — Tripo 342ec84b"))throw new InvalidOperationException("Repair already installed; review before rerunning");
            var all=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).ToArray();var protectedTransforms=all.Select(t=>(t,t.position,t.rotation,t.localScale)).ToArray();
            var stamp=DateTime.Now.ToString("yyyyMMdd-HHmmss");EditorSceneManager.SaveScene(scene,Folder+"/Before-"+stamp+".unity",true);File.Copy(Path.Combine(Repo,"native/ArtSource/new-world-runtime.json"),Path.Combine(Output,"authority-before-"+stamp+".json"));
            var filters=all.Where(t=>t.gameObject.activeInHierarchy).Select(t=>t.GetComponent<MeshFilter>()).Where(f=>f&&f.sharedMesh).ToArray();
            var ground=filters.First(f=>f.name=="Registered terrain section 0");var groundCollider=ground.GetComponent<Collider>();Physics.SyncTransforms();
            var source=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/CampMind/NewWorldCalibration/Models/stairs/main-hall-stairs.glb");if(!source)throw new IOException("Approved stair GLB missing");var sf=source.GetComponentInChildren<MeshFilter>();var sampler=new GameObject("temporary stair measurement");var sampleCollider=sampler.AddComponent<MeshCollider>();sampleCollider.sharedMesh=sf.sharedMesh;
            float StairHeight(float s){float sum=0;int count=0;foreach(float offset in new[]{-.35f,-.175f,0,.175f,.35f}){float x=(s+offset)/Run*.72f-.4f;if(sampleCollider.Raycast(new Ray(new Vector3(Mathf.Clamp(x,-.48f,.47f),1,0),Vector3.down),out var hit,2)){sum+=Bottom.y+(hit.point.y+.1805f)/.3236f*(Top.y-Bottom.y);count++;}}return count>0?sum/count:Mathf.Lerp(Bottom.y,Top.y,Mathf.Clamp01(s/Run));}
            float Ground(Vector3 p){if(groundCollider.Raycast(new Ray(p+Vector3.up*80,Vector3.down),out var hit,160))return hit.point.y;float total=0;int count=0;foreach(var d in new[]{Side,-Side,Forward,-Forward})for(float r=1;r<=8;r+=1)if(groundCollider.Raycast(new Ray(p+d*r+Vector3.up*80,Vector3.down),out hit,160)){total+=hit.point.y;count++;break;}return count>0?total/count:Mathf.Lerp(Bottom.y,Top.y,Mathf.Clamp01(Vector3.Dot(p-Bottom,Forward)/Run));}
            var root=new GameObject("主殿新石阶 — Tripo 342ec84b");
            // Capture the old surface before cutting. Replace the whole damaged corridor,
            // with a continuous apron whose outside boundary samples the existing ground.
            const float minS=-6,maxExtra=4,half=22;float maxS=Run+maxExtra;
            var pv=new List<Vector3>();var pt=new List<int>();const int across=88,along=72;
            for(int z=0;z<=along;z++)for(int x=0;x<=across;x++){float s=Mathf.Lerp(minS,maxS,(float)z/along),l=Mathf.Lerp(-half,half,(float)x/across);var p=Bottom+Forward*s+Side*l;float original=Ground(p);float floor=StairHeight(s);float sideBlend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(6,half,Mathf.Abs(l)));float endBlend=Mathf.Max(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(minS,-2,s)),Mathf.SmoothStep(0,1,Mathf.InverseLerp(Run+1,maxS,s)));p.y=Mathf.Lerp(floor-.6f,original,Mathf.Max(sideBlend,endBlend));pv.Add(p);}
            for(int z=0;z<along;z++)for(int x=0;x<across;x++){int i=z*(across+1)+x;pt.AddRange(new[]{i,i+across+1,i+1,i+1,i+across+1,i+across+2});}
            var outline=new[]{Bottom+Forward*minS-Side*half,Bottom+Forward*minS+Side*half,Bottom+Forward*maxS+Side*half,Bottom+Forward*maxS-Side*half};
            int clipped=0;foreach(var f in filters.Where(f=>f.name.StartsWith("Registered terrain section")||f.name.EndsWith("-relief")||f.name.StartsWith("observed-bank-rock-")||f.name.StartsWith("Source terrain boulder detail"))){var r=f.GetComponent<Renderer>();if(!r||!r.bounds.Intersects(BoundsOf(outline,-30,35)))continue;var local=outline.Select(f.transform.InverseTransformPoint).ToArray();var cut=StaticMeshClip.SubtractAbovePolygon(f.sharedMesh,local,-40);var compact=NewWorldSourceModules.Compact(cut);UnityEngine.Object.DestroyImmediate(cut);SaveMesh("ground-"+clipped,compact);f.sharedMesh=compact;var mc=f.GetComponent<MeshCollider>();if(mc)mc.sharedMesh=compact;clipped++;}
            var road=new Material(AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/RoadProxy.mat"));road.SetFloat("_UseVertexDirt",1);road.SetFloat("_Dirt",1);if(File.Exists(Folder+"/apron.mat"))AssetDatabase.DeleteAsset(Folder+"/apron.mat");AssetDatabase.CreateAsset(road,Folder+"/apron.mat");var apron=Create("主殿落地地形连续面",pv.ToArray(),pt.ToArray(),new[]{road},root.transform,true);apron.GetComponent<MeshFilter>().sharedMesh.colors=pv.Select(p=>new Color(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(4,8,Mathf.Abs(Vector3.Dot(p-Bottom,Side)))),0,0,1)).ToArray();
            foreach(var t in all.Where(t=>t.name.StartsWith("main-stair-")||t.name=="Observed long-stair stone side rail"||t.name.StartsWith("Long-stair stone guard")||t.name=="主殿长阶下端落地"))t.gameObject.SetActive(false);
            var sm=UnityEngine.Object.Instantiate(sf.sharedMesh);
            // Unity GLB import mirrors source X. The paid mesh climbs +X; its Z is width.
            sm.vertices=sm.vertices.Select(v=>Bottom+Forward*((v.x+.40f)/.72f*Run)-Side*(v.z/.63367f*11.4f)+Vector3.up*((v.y+.1805f)/.3236f*(Top.y-Bottom.y))).ToArray();sm.RecalculateNormals();sm.RecalculateTangents();sm.RecalculateBounds();SaveMesh("stair-visible",sm);
            var go=new GameObject("主殿石阶 — 已生成贴图与实体踏步");go.transform.SetParent(root.transform);go.AddComponent<MeshFilter>().sharedMesh=sm;go.AddComponent<MeshRenderer>().sharedMaterials=sf.GetComponent<Renderer>().sharedMaterials;
            // Continuous collision follows the tread nosings, keeping the authority grid
            // below the maximum 0.45m cell delta. Rendered steps remain horizontal.
            var cv=new List<Vector3>();var ct=new List<int>();for(int i=0;i<=160;i++){float s=Mathf.Lerp(-2.5f,Run+5.5f,i/160f);float h=StairHeight(s);foreach(float side in new[]{-4.7f,4.7f})cv.Add(Bottom+Forward*s+Side*side+Vector3.up*(h-Bottom.y));if(i>0){int n=i*2;ct.AddRange(new[]{n-2,n,n-1,n-1,n,n+1});}}UnityEngine.Object.DestroyImmediate(sampler);
            var walk=Create("main-stair-continuous-walk-surface",cv.ToArray(),ct.ToArray(),null,root.transform,false);
            // The source hall is tilted by the user's manual edit. Use its actual porch
            // surface for the short upper transition without changing that transform.
            var hall=filters.First(f=>f.transform.GetComponentsInParent<Transform>().Any(t=>t.name.StartsWith("Source-corrected H")));var hc=hall.gameObject.AddComponent<MeshCollider>();hc.sharedMesh=hall.sharedMesh;var lv=new List<Vector3>();var lt=new List<int>();
            for(int z=0;z<=12;z++)for(int x=0;x<=16;x++){float s=Run+z*.5f,l=(x-8)*.55f;var p=Bottom+Forward*s+Side*l;p.y=Top.y;if(hc.Raycast(new Ray(new Vector3(p.x,15,p.z),Vector3.down),out var h,20)&&h.normal.y>.7f&&Mathf.Abs(h.point.y-Top.y)<1.5f)p.y=Mathf.Lerp(Top.y,h.point.y+.015f,Mathf.Clamp01(z/3f));lv.Add(p);if(z>0&&x>0){int n=z*17+x;lt.AddRange(new[]{n-18,n-1,n-17,n-17,n-1,n});}}UnityEngine.Object.DestroyImmediate(hc);
            Create("main-stair-upper-porch-transition",lv.ToArray(),lt.ToArray(),new[]{AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/NewStairStone.mat")},root.transform,true);
            foreach(var t in all.Where(t=>t.name.StartsWith("Runtime footprint Source-corrected H")))foreach(var c in t.GetComponents<Collider>())c.enabled=false;
            Physics.SyncTransforms();RefreshAuthority();
            bool preserved=protectedTransforms.All(p=>p.t.position==p.position&&p.t.rotation==p.rotation&&p.t.localScale==p.localScale);if(!preserved)throw new InvalidOperationException("An existing transform changed");
            AssetDatabase.SaveAssets();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);
            var camera=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));Capture(camera,"after-overview.png");camera.transform.position=Bottom-Forward*19+Vector3.up*10;camera.transform.LookAt(Top);camera.fieldOfView=60;Capture(camera,"after-close.png");
            File.WriteAllText(Path.Combine(Output,"repair.json"),new JObject{["taskId"]="342ec84b-faee-4b0c-a1ec-5d8f03520d5b",["credits"]=60,["existingTransformsPreserved"]=preserved,["bottom"]=V(Bottom),["top"]=V(Top),["run"]=Run,["clippedMeshes"]=clipped,["scene"]=ScenePath,["runtimeVerified"]=false}.ToString());
        }
        static Bounds BoundsOf(Vector3[] p,float low,float high){var b=new Bounds(p[0],Vector3.zero);foreach(var v in p)b.Encapsulate(v);var min=b.min;var max=b.max;min.y=low;max.y=high;b.SetMinMax(min,max);return b;}
        static void SaveMesh(string name,Mesh m){m.name=name;var path=Folder+"/"+name+".asset";if(File.Exists(path))AssetDatabase.DeleteAsset(path);AssetDatabase.CreateAsset(m,path);}
        static GameObject Create(string name,Vector3[] v,int[] t,Material[] materials,Transform parent,bool visible){var m=new Mesh{indexFormat=UnityEngine.Rendering.IndexFormat.UInt32,vertices=v,triangles=t};m.uv=v.Select(p=>new Vector2(p.x*.1f,p.z*.1f)).ToArray();m.RecalculateNormals();m.RecalculateBounds();SaveMesh(name,m);var g=new GameObject(name);g.layer=9;g.transform.SetParent(parent);g.AddComponent<MeshFilter>().sharedMesh=m;if(visible)g.AddComponent<MeshRenderer>().sharedMaterials=materials;g.AddComponent<MeshCollider>().sharedMesh=m;return g;}
        static void RefreshAuthority()
        {
            var file=Path.Combine(Repo,"native/ArtSource/new-world-runtime.json");var data=JObject.Parse(File.ReadAllText(file));var heights=(JArray)data["heights"];var walk=(JArray)data["walkable"];int width=(int)data["width"],height=(int)data["height"];float step=(float)data["step"],minX=(float)data["minX"],minY=(float)data["minY"];
            int changed=0;for(int z=0;z<height;z++)for(int x=0;x<width;x++){var p=new Vector3(50-(minX+x*step),0,minY+z*step-50);var d=p-Bottom;float s=Vector3.Dot(d,Forward),l=Vector3.Dot(d,Side);if(s< -7||s>Run+15||Mathf.Abs(l)>23)continue;int i=z*width+x;walk[i]=0;if(!Physics.Raycast(p+Vector3.up*100,Vector3.down,out var h,200,1<<9,QueryTriggerInteraction.Ignore))continue;heights[i]=(float)Math.Round(h.point.y,3);if(h.normal.y>=.65f&&!Physics.CheckCapsule(h.point+Vector3.up*.36f,h.point+Vector3.up*1.5f,.28f,1<<8,QueryTriggerInteraction.Ignore))walk[i]=1;changed++;}
            var porch=Top+Forward*8f;data["exportedUtc"]=DateTime.UtcNow.ToString("O");data["stairRepair"]=new JObject{["bottom"]=new JObject{["x"]=50-Bottom.x,["y"]=Bottom.z+50},["top"]=new JObject{["x"]=50-Top.x,["y"]=Top.z+50},["porch"]=new JObject{["x"]=50-porch.x,["y"]=porch.z+50},["cellsRefreshed"]=changed};File.WriteAllText(file,data.ToString(Newtonsoft.Json.Formatting.None));
        }
        public static void Audit()
        {
            Directory.CreateDirectory(Output);var scene=EditorSceneManager.OpenScene(ScenePath);
            var filters=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>(true)).Where(f=>f.sharedMesh).ToArray();
            var items=new JArray();foreach(var f in filters){var r=f.GetComponent<Renderer>();if(!r)continue;var b=r.bounds;if(!f.name.Contains("stair")&&!f.name.Contains("落地")&&!f.name.Contains("platform")&&!f.name.Contains("Registered terrain")&&!f.transform.GetComponentsInParent<Transform>().Any(t=>t.name.StartsWith("Source-corrected H")))continue;
                var p=f.sharedMesh.vertices.Select(f.transform.TransformPoint).ToArray();float top=p.Max(v=>v.y);
                items.Add(new JObject{["name"]=f.name,["parent"]=f.transform.parent?f.transform.parent.name:"",["active"]=f.gameObject.activeInHierarchy,["mesh"]=AssetDatabase.GetAssetPath(f.sharedMesh),["min"]=V(b.min),["max"]=V(b.max),["position"]=V(f.transform.position),["rotation"]=V(f.transform.eulerAngles),["top"]=new JArray(p.Where(v=>v.y>top-.02f).Distinct().Take(30).Select(V))});}
            File.WriteAllText(Path.Combine(Output,"audit.json"),items.ToString());
            var samples=new JArray();var hall=filters.First(f=>f.transform.GetComponentsInParent<Transform>().Any(t=>t.name.StartsWith("Source-corrected H")));var hc=hall.gameObject.AddComponent<MeshCollider>();hc.sharedMesh=hall.sharedMesh;
            var ground=filters.First(f=>f.name=="Registered terrain section 0").GetComponent<Collider>();
            for(float z=16;z<=66;z+=1)for(float x=-4;x<=40;x+=1){var ray=new Ray(new Vector3(x,20,z),Vector3.down);var row=new JObject{["x"]=x,["z"]=z};if(hc.Raycast(ray,out var hh,40)){row["hall"]=hh.point.y;row["normal"]=hh.normal.y;}if(ground.Raycast(ray,out var gh,40))row["ground"]=gh.point.y;samples.Add(row);}UnityEngine.Object.DestroyImmediate(hc);File.WriteAllText(Path.Combine(Output,"surface-samples.json"),samples.ToString());
            var camera=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));
            Capture(camera,"before-overview.png");camera.transform.position=new Vector3(7,13,12);camera.transform.LookAt(new Vector3(7,6,44));camera.fieldOfView=65;Capture(camera,"before-close.png");
            camera.transform.position=new Vector3(20,85,36);camera.transform.LookAt(new Vector3(20,0,36),Vector3.forward);camera.orthographic=true;camera.orthographicSize=30;Capture(camera,"before-top.png");
            var source=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/CampMind/NewWorldCalibration/Models/stairs/main-hall-stairs.glb");if(source){var obj=UnityEngine.Object.Instantiate(source);obj.transform.position=new Vector3(400,0,0);obj.transform.localScale=Vector3.one*25;camera.orthographic=false;camera.fieldOfView=45;camera.transform.position=new Vector3(423,16,22);camera.transform.LookAt(new Vector3(400,0,0));Capture(camera,"source-stairs.png");var mf=obj.GetComponentInChildren<MeshFilter>();File.WriteAllText(Path.Combine(Output,"source-stairs-vertices.json"),new JArray(mf.sharedMesh.vertices.Select(V)).ToString());}
        }
        static void Capture(Camera camera,string name){var rt=new RenderTexture(1672,941,24);camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;var image=new Texture2D(1672,941,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1672,941),0,0);image.Apply();File.WriteAllBytes(Path.Combine(Output,name),image.EncodeToPNG());camera.targetTexture=null;RenderTexture.active=null;UnityEngine.Object.DestroyImmediate(image);UnityEngine.Object.DestroyImmediate(rt);}
    }
}

