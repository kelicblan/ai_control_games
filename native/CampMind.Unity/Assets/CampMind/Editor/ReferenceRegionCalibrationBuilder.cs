using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using CampMind.Presentation;

namespace CampMind.Editor
{
    // Measurement scene only. Its fitted asset candidates are not accepted final art.
    public static class ReferenceRegionCalibrationBuilder
    {
        public const string Folder="Assets/CampMind/ReferenceRegionCalibration";
        public const string ScenePath="Assets/CampMind/Scenes/ReferenceRegionCalibration.unity";
        private const int Width=2048,Height=1303;
        private sealed class Candidate
        {
            public string id,path;public Vector2 foot;public Rect target;public Vector3[] vertices;
            public float yaw,scale,error,fitScore,ridgeTargetAngle,ridgeLength,ridgeActualAngle;public Vector3 position,sourceOrigin,roofAxis;
        }
        private static JObject data;
        private static Camera camera;
        private static float elevation;
        private static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        private static Vector2[] Points(string id)=>((JArray)data["features"]).First(f=>(string)f["id"]==id)["points"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
        public static Vector3 Unproject(Camera c,Vector2 pixel,float height=0)
        {
            // Construct the ray from the camera basis. Inverting Unity's finite-far-plane
            // projection matrix loses precision near the horizon (observed 0.088 px drift).
            var tan=Mathf.Tan(c.fieldOfView*Mathf.Deg2Rad*.5f);
            var direction=c.transform.forward+c.transform.right*((pixel.x/Width*2-1)*tan*c.aspect)+c.transform.up*((1-pixel.y/Height*2)*tan);
            if(Mathf.Abs(direction.y)<1e-7f)throw new InvalidOperationException("Reference ray parallel to declared height");
            var t=(height-c.transform.position.y)/direction.y;if(t<=0)throw new InvalidOperationException("Height lies behind reference ray");
            return c.transform.position+direction*t;
        }
        public static Vector2 Project(Camera c,Vector3 world){var p=c.WorldToViewportPoint(world);return new Vector2(p.x*Width,(1-p.y)*Height);}
        private static void CameraElevation(float angle)
        {
            elevation=angle;var c=data["camera"];var rotation=Quaternion.Euler(angle,(float)c["azimuth"],0);var t=c["target"].Select(v=>(float)v).ToArray();
            camera.transform.rotation=rotation;camera.transform.position=new Vector3(t[0],t[1],t[2])-rotation*Vector3.forward*(float)c["distance"];
        }
        private static Vector3[] ReadVertices(string path,out Vector3 sourceOrigin)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(!source)throw new FileNotFoundException("Missing newly generated candidate",path);
            var instance=UnityEngine.Object.Instantiate(source);var points=new List<Vector3>();
            try{
                foreach(var mf in instance.GetComponentsInChildren<MeshFilter>()){
                    var v=mf.sharedMesh.vertices;var step=Math.Max(1,v.Length/3000);for(var i=0;i<v.Length;i+=step)points.Add(mf.transform.TransformPoint(v[i]));
                    // Always include support points; sampling must not drop the true six axis extrema.
                    foreach(var axis in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back}){
                        var best=v[0];var max=float.NegativeInfinity;foreach(var p in v){var world=mf.transform.TransformPoint(p);var d=Vector3.Dot(world,axis);if(d>max){max=d;best=world;}}points.Add(best);
                    }
                }
                if(points.Count==0)throw new InvalidOperationException("No candidate geometry");
                var bounds=new Bounds(points[0],Vector3.zero);foreach(var p in points)bounds.Encapsulate(p);var origin=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);sourceOrigin=origin;
                return points.Select(p=>p-origin).ToArray();
            }finally{UnityEngine.Object.DestroyImmediate(instance);}
        }
        private static Rect Bounds(Candidate a,float yaw,float scale,Vector3 at)
        {
            var q=Quaternion.Euler(0,yaw,0);float minX=float.PositiveInfinity,minY=float.PositiveInfinity,maxX=float.NegativeInfinity,maxY=float.NegativeInfinity;
            foreach(var v in a.vertices){var p=Project(camera,at+q*(v*scale));minX=Mathf.Min(minX,p.x);maxX=Mathf.Max(maxX,p.x);minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);}
            return Rect.MinMaxRect(minX,minY,maxX,maxY);
        }
        private static void Fit(Candidate a)
        {
            a.fitScore=float.PositiveInfinity;
            // Same front-facing range for raw Tripo source orientation. The unresolved yaw ambiguity is reported.
            for(float yaw=-90;yaw<=-25;yaw+=5){
                var scale=80f;var at=Unproject(camera,a.foot);
                // A visible ground-foot anchor is on the front edge, not the hidden centre of the source AABB.
                // Fit image width, horizontal centre and lowest projected edge together; keep the mesh uniform.
                for(var i=0;i<6;i++){
                    var b=Bounds(a,yaw,scale,at);scale*=a.target.width/b.width;b=Bounds(a,yaw,scale,at);
                    var wanted=Unproject(camera,new Vector2(a.target.center.x,a.target.yMax));var actual=Unproject(camera,new Vector2(b.center.x,b.yMax));at+=wanted-actual;
                }
                var fitted=Bounds(a,yaw,scale,at);
                var error=Mathf.Sqrt((Mathf.Pow(fitted.xMin-a.target.xMin,2)+Mathf.Pow(fitted.xMax-a.target.xMax,2)+Mathf.Pow(fitted.yMin-a.target.yMin,2)+Mathf.Pow(fitted.yMax-a.target.yMax,2))/4);
                var angle=0f;var score=error;
                if(a.ridgeLength>0){
                    var q=Quaternion.Euler(0,yaw,0);var top=Vector3.up*a.vertices.Max(v=>v.y)*.8f;
                    var p=Project(camera,at+q*((top+a.roofAxis*.2f)*scale));var r=Project(camera,at+q*((top-a.roofAxis*.2f)*scale));
                    var delta=p-r;angle=Mathf.Atan2(delta.y,delta.x)*Mathf.Rad2Deg;while(angle>90)angle-=180;while(angle< -90)angle+=180;
                    var difference=Mathf.Abs(Mathf.DeltaAngle(angle,a.ridgeTargetAngle));if(difference>90)difference=180-difference;
                    var ridgePixelError=a.ridgeLength*Mathf.Sin(difference*Mathf.Deg2Rad);
                    score=Mathf.Sqrt(error*error+ridgePixelError*ridgePixelError*.5f);
                }
                if(score<a.fitScore){a.error=error;a.fitScore=score;a.yaw=yaw;a.scale=scale;a.position=at;a.ridgeActualAngle=angle;}
            }
        }
        private static Candidate CandidateFor(string id,string model)
        {
            var roof=Points(id+"-roof");var foot=Points(id+"-foot")[0];var path="Assets/CampMind/ReferenceSample/Models/"+model+".glb";
            var vertices=ReadVertices(path,out var sourceOrigin);
            var a=new Candidate{id=id,path=path,foot=foot,vertices=vertices,sourceOrigin=sourceOrigin,target=Rect.MinMaxRect(roof.Min(p=>p.x),roof.Min(p=>p.y),roof.Max(p=>p.x),foot.y)};
            var ridge=((JArray)data["features"]).First(f=>(string)f["id"]==id+"-roof")["ridge"];
            if(ridge!=null){
                var dx=(float)ridge[1][0]-(float)ridge[0][0];var dy=(float)ridge[1][1]-(float)ridge[0][1];a.ridgeLength=Mathf.Sqrt(dx*dx+dy*dy);a.ridgeTargetAngle=Mathf.Atan2(dy,dx)*Mathf.Rad2Deg;
                // Principal long axis of the authored roof geometry, excluding base apron and high flags.
                var h=vertices.Max(v=>v.y);var upper=vertices.Where(v=>v.y>h*.55f&&v.y<h*.88f).ToArray();if(upper.Length<3)throw new InvalidOperationException("Insufficient roof geometry");
                var mx=upper.Average(v=>v.x);var mz=upper.Average(v=>v.z);var xx=upper.Average(v=>(v.x-mx)*(v.x-mx));var zz=upper.Average(v=>(v.z-mz)*(v.z-mz));var xz=upper.Average(v=>(v.x-mx)*(v.z-mz));
                var axis=Mathf.Atan2(2*xz,xx-zz)*.5f;a.roofAxis=new Vector3(Mathf.Cos(axis),0,Mathf.Sin(axis));
            }return a;
        }
        public static void BuildScene()
        {BuildScene(false);}
        private static void BuildScene(bool withTerrain)
        {
            Directory.CreateDirectory(Folder);AssetDatabase.Refresh();
            var input=Path.Combine(Repo,"native/ArtSource/reference-initial-region/constraints.json");data=JObject.Parse(File.ReadAllText(input));
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            camera=new GameObject("Reference candidate fitting camera — not yet calibrated").AddComponent<Camera>();camera.tag="MainCamera";camera.fieldOfView=(float)data["camera"]["verticalFov"];camera.aspect=Width/(float)Height;camera.nearClipPlane=.1f;camera.farClipPlane=10000;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.23f,.26f,.28f);camera.gameObject.AddComponent<AudioListener>();camera.gameObject.AddComponent<UniversalAdditionalCameraData>();
            var candidates=new[]{CandidateFor("manor","manor"),CandidateFor("dwelling-west","dwelling"),CandidateFor("dwelling-front","dwelling"),CandidateFor("dwelling-east","dwelling"),CandidateFor("watchtower","watchtower")};
            var best=float.PositiveInfinity;var bestAngle=35f;
            for(float angle=27.5f;angle<=55;angle+=2.5f){CameraElevation(angle);foreach(var a in candidates)Fit(a);var error=candidates.Average(a=>a.fitScore);if(error<best){best=error;bestAngle=angle;}}
            CameraElevation(bestAngle);foreach(var a in candidates)Fit(a);
            var records=new JArray();foreach(var a in candidates){
                var owner=new GameObject(a.id+" — unaccepted Tripo candidate");owner.transform.position=a.position;owner.transform.rotation=Quaternion.Euler(0,a.yaw,0);
                var fit=new GameObject("Uniform source fit").transform;fit.SetParent(owner.transform,false);var model=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(a.path),fit);
                fit.localPosition=-a.sourceOrigin*a.scale;fit.localScale=Vector3.one*a.scale;
                var projected=Bounds(a,a.yaw,a.scale,a.position);
                records.Add(new JObject{["id"]=a.id,["source"]=a.path,["uniformScale"]=a.scale,["yawCandidate"]=a.yaw,["footPixel"]=new JArray(a.foot.x,a.foot.y),["worldPosition"]=new JArray(a.position.x,a.position.y,a.position.z),["targetBounds"]=new JArray(a.target.xMin,a.target.yMin,a.target.xMax,a.target.yMax),["projectedBounds"]=new JArray(projected.xMin,projected.yMin,projected.xMax,projected.yMax),["boundingBoxRmsPixels"]=a.error,["ridgeTargetAngle"]=a.ridgeTargetAngle,["ridgeCandidateAngle"]=a.ridgeActualAngle,["fitScore"]=a.fitScore,["accepted"]=false});
            }
            // A measured polygon is displayed as a flat construction plane, not claimed as final terrain.
            var plane=Points("palisade-footline").Select(p=>Unproject(camera,p)).ToArray();
            var line=new GameObject("Measured fence footprint — construction guide only").AddComponent<LineRenderer>();line.positionCount=plane.Length;line.SetPositions(plane.Select(p=>p+Vector3.up*.1f).ToArray());line.loop=true;line.widthMultiplier=.25f;line.sharedMaterial=Material("Fence guide",new Color(1,.65f,.15f),true);
            var terrace=Points("village-platform").Select(p=>Unproject(camera,p)).ToArray();PolygonPlane(terrace);
            var light=new GameObject("Candidate inspection light").AddComponent<Light>();light.type=LightType.Directional;light.transform.rotation=Quaternion.Euler(35,-55,0);light.intensity=1.6f;light.color=new Color(1,.85f,.66f);light.shadows=LightShadows.Soft;light.gameObject.AddComponent<UniversalAdditionalLightData>();RenderSettings.sun=light;RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.55f,.59f,.65f);RenderSettings.fog=false;RenderSettings.skybox=null;
            var view=camera.gameObject.AddComponent<ReferenceRegionCalibrationView>();view.referenceCamera=camera;
            var texturePath=Folder+"/Reference.png";File.Copy(Path.Combine(Repo,"native/ArtSource/reference-initial-region/layout-reference.png"),texturePath,true);AssetDatabase.ImportAsset(texturePath);view.reference=AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
            var report=new JObject{["status"]="candidate-fit-not-calibrated",["sourceSha256"]=(string)data["source"]["sha256"],["scene"]=ScenePath,["imageWidth"]=Width,["imageHeight"]=Height,["cameraElevationCandidate"]=elevation,["cameraFovFixedForFit"]=camera.fieldOfView,["meanBoundingBoxRmsPixels"]=candidates.Average(a=>a.error),["meanFitScore"]=best,["candidates"]=records,["unknowns"]=new JArray("World scale and terrain elevation are unresolved; y=0 is only a construction plane.","Bounding boxes and roof-axis estimates do not validate roof contours, doors, source detail or final camera pose.","Roof direction from PCA is a candidate; verify against authored ridge vertices before use.","No old environment models, procedural substitute mountains, river or gates were inserted."),["authorityConnected"]=false,["visualAccepted"]=false};
            if(withTerrain){report["terrain"]=ReferenceRegionTerrainBuilder.Build(camera,data);report["status"]="reference-region-terrain-blockout";report["unknowns"]=new JArray("Water elevation, back slopes and mass depths are explicitly inferred under user authorization.","Crest traces and building candidates still need actual-view refinement.","No old environmental meshes are used; this scene is not yet connected to the authoritative game world.");view.name="Reference terrain blockout camera";
                var skyPath=Folder+"/MorningSky.mat";var sky=AssetDatabase.LoadAssetAtPath<Material>(skyPath);if(!sky){sky=new Material(Shader.Find("CampMind/Reference Sample Sky"));AssetDatabase.CreateAsset(sky,skyPath);}sky.SetColor("_Top",new Color(.43f,.52f,.61f));sky.SetColor("_Horizon",new Color(.94f,.77f,.55f));RenderSettings.skybox=sky;camera.clearFlags=CameraClearFlags.Skybox;light.transform.rotation=Quaternion.Euler(24,-55,0);
            }
            var outDir=Path.Combine(Repo,"native/Artifacts/reference-region-calibration");Directory.CreateDirectory(outDir);File.WriteAllText(Path.Combine(outDir,"fit-report.json"),report.ToString());view.report=report.ToString();AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(scene,ScenePath);
        }
        private static void PolygonPlane(Vector3[] points)
        {
            var vertices=new List<Vector3>(points);var indices=new List<int>();var remaining=Enumerable.Range(0,points.Length).ToList();
            float Cross(Vector3 a,Vector3 b,Vector3 c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
            var area=points.Select((p,i)=>p.x*points[(i+1)%points.Length].z-p.z*points[(i+1)%points.Length].x).Sum();if(area<0)remaining.Reverse();
            while(remaining.Count>2){var found=false;for(var i=0;i<remaining.Count;i++){
                var a=remaining[(i+remaining.Count-1)%remaining.Count];var b=remaining[i];var c=remaining[(i+1)%remaining.Count];if(Cross(points[a],points[b],points[c])<=0)continue;
                if(remaining.Any(j=>j!=a&&j!=b&&j!=c&&Cross(points[a],points[b],points[j])>=0&&Cross(points[b],points[c],points[j])>=0&&Cross(points[c],points[a],points[j])>=0))continue;
                indices.Add(a);indices.Add(c);indices.Add(b);remaining.RemoveAt(i);found=true;break;
            }if(!found)throw new InvalidOperationException("Measured terrace polygon cannot be triangulated");}
            var mesh=new Mesh{name="Reference terrace construction plane"};mesh.SetVertices(vertices);mesh.SetTriangles(indices,0);mesh.RecalculateNormals();var path=Folder+"/ConstructionPlane.asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
            var go=new GameObject("Reference terrace construction plane — elevation unresolved");go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=Material("Construction plane",new Color(.36f,.33f,.25f),false);
        }
        private static Material Material(string name,Color color,bool unlit)
        {
            var path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find(unlit?"Universal Render Pipeline/Unlit":"Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",color);return m;
        }
        public static void BuildPlayer()
        {BuildPlayer(false);}
        public static void BuildTerrainPlayer()
        {BuildPlayer(true);}
        private static void BuildPlayer(bool withTerrain)
        {
            BuildScene(withTerrain);var output=Path.Combine(Repo,"native/Builds/ReferenceRegionCalibration");Directory.CreateDirectory(output);var old=PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone);var oldScenes=EditorBuildSettings.scenes;
            try{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,ScriptingImplementation.Mono2x);var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=Path.Combine(output,"ReferenceRegionCalibration.exe"),target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Reference region calibration build failed");}
            finally{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,old);EditorBuildSettings.scenes=oldScenes;AssetDatabase.SaveAssets();}
        }
    }
}
