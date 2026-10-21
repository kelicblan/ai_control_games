using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using CampMind.Presentation;

namespace CampMind.Editor
{
    [InitializeOnLoad] public static class ForestExpansionBuilder
    {
        const string ScenePath="Assets/CampMind/NewWorldGame/Camp.unity";
        const string Folder="Assets/CampMind/NewWorldGame/ForestExpansion";
        const string RootName="寨外森林扩展 v1";
        static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        static string Output=>Path.Combine(Repo,"native/Artifacts/forest-expansion");
        static JObject data;static Transform root;static Material soil,wood,leaf,berry,herb;
        static readonly Dictionary<Material,Material> instanceMaterials=new Dictionary<Material,Material>();
        static bool busy;
        static ForestExpansionBuilder(){EditorApplication.update+=Poll;}
        static void Poll(){if(busy||Application.isBatchMode||BuildPipeline.isBuildingPlayer||EditorApplication.isCompiling||EditorApplication.isUpdating||EditorApplication.isPlaying||EditorApplication.isPlayingOrWillChangePlaymode)return;string boundary=Path.Combine(Output,"boundary.request");if(File.Exists(boundary)){File.Delete(boundary);ExportRiverBoundary();}string request=Path.Combine(Output,"refine.request");if(!File.Exists(request))return;File.Delete(request);busy=true;try{Refine();File.Delete(Path.Combine(Output,"refine-error.txt"));}catch(Exception e){File.WriteAllText(Path.Combine(Output,"refine-error.txt"),e.ToString());Debug.LogException(e);}finally{busy=false;}}
        public static void ExportRiverBoundary(){if(UnityEngine.SceneManagement.SceneManager.GetActiveScene().path!=ScenePath)EditorSceneManager.OpenScene(ScenePath);var triangles=new JArray();foreach(var f in UnityEngine.Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None).Where(f=>f.name=="Clear shallow river surface")){var v=f.sharedMesh.vertices;var t=f.sharedMesh.triangles;for(int i=0;i<t.Length;i+=3){var row=new JArray();for(int k=0;k<3;k++){var p=f.transform.TransformPoint(v[t[i+k]]);row.Add(new JArray(p.x,p.z));}triangles.Add(row);}}if(triangles.Count==0)throw new InvalidOperationException("Original river surface was not found");File.WriteAllText(Path.Combine(Repo,"native/ArtSource/forest-expansion/original-river.json"),triangles.ToString(Newtonsoft.Json.Formatting.None));}
        static Vector3 Point(float u,float v,float y){var p=data["origin"];var s=data["side"];var f=data["forward"];return new Vector3((float)p[0]+(float)s[0]*u+(float)f[0]*v,y,(float)p[2]+(float)s[1]*u+(float)f[1]*v);}
        static Vector3 Point(JToken t)=>Point((float)t["u"],(float)t["v"],Height((float)t["u"],(float)t["v"]));
        static float Height(float u,float v)
        {
            // Exactly the generated mesh interpolation used by collision, rather than a second height function.
            var limits=data["limits"];float step=(float)limits["step"],gx=(u-(float)limits["minU"])/step,gz=(v-(float)limits["minV"])/step;int width=Mathf.RoundToInt(((float)limits["maxU"]-(float)limits["minU"])/step)+1,height=Mathf.RoundToInt(((float)limits["maxV"]-(float)limits["minV"])/step)+1;
            int x=Mathf.Clamp(Mathf.FloorToInt(gx),0,width-2),z=Mathf.Clamp(Mathf.FloorToInt(gz),0,height-2);float tx=Mathf.Clamp01(gx-x),tz=Mathf.Clamp01(gz-z);
            var p=(JArray)data["terrain"]["positions"];float H(int xx,int zz)=>(float)p[(zz*width+xx)*3+1];
            return tx+tz<=1?H(x,z)+(H(x+1,z)-H(x,z))*tx+(H(x,z+1)-H(x,z))*tz:H(x+1,z+1)+(H(x,z+1)-H(x+1,z+1))*(1-tx)+(H(x+1,z)-H(x+1,z+1))*(1-tz);
        }
        static Mesh Mesh(JToken value)
        {
            var a=value["positions"].Values<float>().ToArray();var n=value["normals"].Values<float>().ToArray();var c=value["colors"].Values<float>().ToArray();var uv=value["uv"].Values<float>().ToArray();
            var mesh=new Mesh{name=(string)value["name"],indexFormat=IndexFormat.UInt32};
            mesh.vertices=Enumerable.Range(0,a.Length/3).Select(i=>new Vector3(a[i*3],a[i*3+1],a[i*3+2])).ToArray();
            mesh.normals=Enumerable.Range(0,n.Length/3).Select(i=>new Vector3(n[i*3],n[i*3+1],n[i*3+2])).ToArray();
            mesh.colors=Enumerable.Range(0,c.Length/4).Select(i=>new Color(c[i*4],c[i*4+1],c[i*4+2],c[i*4+3])).ToArray();
            mesh.uv=Enumerable.Range(0,uv.Length/2).Select(i=>new Vector2(uv[i*2],uv[i*2+1])).ToArray();
            mesh.triangles=value["indices"].Values<int>().ToArray();mesh.RecalculateBounds();
            string path=Folder+"/"+((string)value["name"]).Replace(' ','-')+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(existing){EditorUtility.CopySerialized(mesh,existing);UnityEngine.Object.DestroyImmediate(mesh);return existing;}AssetDatabase.CreateAsset(mesh,path);return mesh;
        }
        static Material Mat(string name,Color colour,string shader="Universal Render Pipeline/Lit")
        {
            string path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find(shader)){name=name};AssetDatabase.CreateAsset(m,path);}m.enableInstancing=true;m.SetColor("_BaseColor",colour);m.SetFloat("_Smoothness",.12f);return m;
        }
        static GameObject Ground(string name,Mesh mesh,Material material,bool collision)
        {
            var go=new GameObject(name);go.transform.SetParent(root,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=material;go.isStatic=true;
            if(collision){go.layer=9;go.AddComponent<MeshCollider>().sharedMesh=mesh;}return go;
        }
        static Bounds Bounds(GameObject go){var rs=go.GetComponentsInChildren<Renderer>();if(rs.Length==0)throw new InvalidOperationException("Empty source model");var b=rs[0].bounds;foreach(var r in rs.Skip(1))b.Encapsulate(r.bounds);return b;}
        static GameObject Model(string path,string name,Vector3 foot,float height,float yaw)
        {
            var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(!asset)throw new InvalidOperationException("Missing source "+path);
            var go=UnityEngine.Object.Instantiate(asset,root);go.name=name;go.transform.SetPositionAndRotation(Vector3.zero,Quaternion.Euler(0,yaw,0));var b=Bounds(go);go.transform.localScale*=height/Mathf.Max(.01f,b.size.y);b=Bounds(go);go.transform.position+=foot-new Vector3(b.center.x,b.min.y,b.center.z);
            foreach(var c in go.GetComponentsInChildren<Collider>())UnityEngine.Object.DestroyImmediate(c);
            foreach(var r in go.GetComponentsInChildren<Renderer>()){r.gameObject.isStatic=true;r.sharedMaterials=r.sharedMaterials.Select(Instanced).ToArray();}
            return go;
        }
        static Material Instanced(Material original)
        {
            if(!original)return null;if(instanceMaterials.TryGetValue(original,out var cached))return cached;
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(original,out string guid,out long id);string path=Folder+"/Instanced-"+guid+"-"+id+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!m){m=new Material(original);AssetDatabase.CreateAsset(m,path);}m.enableInstancing=true;EditorUtility.SetDirty(m);instanceMaterials[original]=m;return m;
        }
        static GameObject Primitive(string name,PrimitiveType type,Vector3 position,Vector3 scale,Material material,Transform parent=null)
        {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(parent?parent:root,true);go.transform.position=position;go.transform.localScale=scale;go.GetComponent<Renderer>().sharedMaterial=material;UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());go.isStatic=true;return go;
        }
        [MenuItem("CampMind/新世界/生成并接入寨外森林")]
        public static void Build()=>BuildInternal(false);
        public static void Refine()=>BuildInternal(true);
        static void BuildInternal(bool refine)
        {
            if(EditorApplication.isPlaying)throw new InvalidOperationException("Exit Play before building forest");
            instanceMaterials.Clear();
            Directory.CreateDirectory(Output);data=JObject.Parse(File.ReadAllText(Path.Combine(Repo,"native/ArtSource/forest-expansion/forest-expansion.json")));
            if((float)data["areaRatio"]<2)throw new InvalidOperationException("Forest is smaller than two villages");
            var scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            if(scene.path!=ScenePath){if(scene.isDirty)throw new InvalidOperationException("Save the current unrelated scene before opening the forest map");scene=EditorSceneManager.OpenScene(ScenePath);}
            var previous=scene.GetRootGameObjects().FirstOrDefault(g=>g.name==RootName);if(previous&&!refine)throw new InvalidOperationException("Forest already installed; preserve manual changes instead of rebuilding");
            Directory.CreateDirectory(Folder);AssetDatabase.Refresh();
            string backup=Folder+"/Before-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".unity";EditorSceneManager.SaveScene(scene,backup,true);
            if(previous)UnityEngine.Object.DestroyImmediate(previous);
            if(!File.Exists(Path.Combine(Output,"runtime-before.json")))File.Copy(Path.Combine(Repo,"native/ArtSource/new-world-runtime.json"),Path.Combine(Output,"runtime-before.json"),false);
            root=new GameObject(RootName).transform;soil=Mat("Forest-ground",Color.white,"CampMind/Forest Terrain");
            Ground("Continuous forest terrain",Mesh(data["terrain"]),soil,true);
            var water=Mat("Forest-clear-water",new Color(.39f,.76f,.91f,.25f),"CampMind/New World River");water.renderQueue=3000;
            var stream=Ground("Clear forest stream",Mesh(data["water"]),water,false);var waterMesh=stream.GetComponent<MeshFilter>().sharedMesh;waterMesh.uv2=waterMesh.uv.Select(v=>new Vector2(5.4f,0)).ToArray();
            wood=Mat("Forest-fallen-wood",new Color(.27f,.17f,.085f));leaf=Mat("Forest-bush-leaves",new Color(.26f,.38f,.12f));berry=Mat("Forest-berry-fruit",new Color(.55f,.075f,.08f));herb=Mat("Forest-herbs",new Color(.38f,.5f,.19f));
            foreach(var t in data["trees"]){var p=Point(t);bool broad=(string)t["kind"]=="broadleaf";float h=(float)t["height"];var go=Model("Assets/CampMind/NewWorldCalibration/Models/"+(broad?"stage2/broadleaf.glb":"conifer.glb"),(string)t["id"],p,h,(float)t["yaw"]);
                var trunk=new GameObject("Forest trunk collision");trunk.transform.SetParent(root,true);trunk.transform.position=p+Vector3.up*h*.2f;trunk.layer=8;var cap=trunk.AddComponent<CapsuleCollider>();cap.radius=.34f;cap.height=h*.4f;
                var full=go.GetComponentsInChildren<Renderer>();string lowPath=Folder+"/Models/"+(broad?"broadleaf":"conifer")+"-lod1.glb";var lod=go.AddComponent<LODGroup>();
                if(AssetDatabase.LoadAssetAtPath<GameObject>(lowPath)){var low=Model(lowPath,"Forest tree reduced detail",p,h,(float)t["yaw"]);low.transform.SetParent(go.transform,true);lod.SetLODs(new[]{new LOD(.085f,full),new LOD(.012f,low.GetComponentsInChildren<Renderer>())});}
                else lod.SetLODs(new[]{new LOD(.012f,full)});lod.RecalculateBounds();
            }
            foreach(var t in data["rocks"]){var p=Point(t);var go=Model("Assets/CampMind/NewWorldCalibration/Models/rock.glb","Forest natural rock",p,(float)t["height"],(float)t["yaw"]);var b=Bounds(go);var collider=new GameObject("Forest rock collision");collider.transform.SetParent(root,true);collider.transform.position=b.center;collider.layer=8;collider.AddComponent<BoxCollider>().size=new Vector3(Mathf.Min(b.size.x*.6f,3),b.size.y,Mathf.Min(b.size.z*.6f,3));}
            foreach(var t in data["logs"]){var p=Point(t);var log=Primitive("Fallen forest log",PrimitiveType.Cylinder,p+Vector3.up*.32f,new Vector3(.5f,(float)t["length"]*.5f,.5f),wood);log.transform.rotation=Quaternion.Euler(90,(float)t["yaw"],0);}
            for(int u=-120;u<=120;u+=7){float v=107+8*Mathf.Sin(u/37f)+3*Mathf.Sin(u/16f);foreach(int side in new[]{-1,1})Model("Assets/CampMind/NewWorldCalibration/Models/rock.glb","Stream bank pebble",Point(u,v+side*4.5f,Height(u,v+side*4.5f)-.12f),.35f+Mathf.Abs(Mathf.Sin(u))*.4f,u*17);}
            foreach(var t in data["resources"]){var p=Point(t);var kind=(string)t["kind"];var holder=new GameObject((string)t["id"]);holder.transform.SetParent(root,true);holder.transform.position=p;holder.AddComponent<ForestHarvestVisual>().siteId=(string)t["id"];if(kind=="wood"){var log=Primitive((string)t["id"],PrimitiveType.Cylinder,p+Vector3.up*.3f,new Vector3(.45f,1.7f,.45f),wood,holder.transform);log.transform.rotation=Quaternion.Euler(90,37,0);}
                else {int leaves=kind=="berries"?5:3;for(int i=0;i<leaves;i++){float a=i*Mathf.PI*2/leaves;var at=p+new Vector3(Mathf.Cos(a)*.32f,.3f,Mathf.Sin(a)*.32f);Primitive((string)t["id"]+" foliage",PrimitiveType.Sphere,at,new Vector3(.65f,kind=="berries"?.8f:.35f,.65f),kind=="berries"?leaf:herb,holder.transform);if(kind=="berries")Primitive("Berry fruit cluster",PrimitiveType.Sphere,at+Vector3.up*.38f,Vector3.one*.14f,berry,holder.transform);}}
                foreach(var part in holder.GetComponentsInChildren<Transform>())part.gameObject.isStatic=false;}
            Physics.SyncTransforms();BuildBackdrop();ExportAuthority();
            var profile=UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>();profile.view.viewCamera.farClipPlane=Mathf.Max(1800,profile.view.viewCamera.farClipPlane);
            AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(scene,Folder+"/Camp-Forest.unity",true);
            // Commit the authored scene only after physical reachability/area checks succeed.
            EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene,ScenePath);
            var source=profile.view.viewCamera;Shader.SetGlobalFloat("_NewWorldDaylight",1);float previousFog=RenderSettings.fogDensity;RenderSettings.fogDensity=Mathf.Min(previousFog,.0007f);
            var focus=Point(0,65,3);Capture(source,focus+new Vector3(-175,195,-165),focus,"panorama.png");
            Capture(source,Point(-30,80,7)+new Vector3(32,40,35),Point(-30,80,2),"forest-detail.png");
            Capture(source,focus+Vector3.up*340,focus,"terrain-top.png");
            RenderSettings.fogDensity=previousFog;
            Debug.Log("Forest expansion integrated and verified: "+Output);
        }
        static void BuildBackdrop()
        {
            // Visible peripheral land is scenery. Only the tested forest mesh enters walkable authority.
            const int count=121;const float step=6,min=-480;var heights=new float[count*count];var distance=new int[heights.Length];var seen=new bool[heights.Length];var covered=new bool[heights.Length];var queue=new Queue<int>();
            var water=new List<GameObject>();foreach(var f in UnityEngine.Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None).Where(f=>f.name=="Clear shallow river surface"||f.name=="Clear forest stream")){
                var go=new GameObject("Temporary water bed probe");go.layer=10;go.transform.SetPositionAndRotation(f.transform.position,f.transform.rotation);go.transform.localScale=f.transform.lossyScale;go.AddComponent<MeshCollider>().sharedMesh=f.sharedMesh;water.Add(go);
            }
            Physics.SyncTransforms();
            for(int z=0;z<count;z++)for(int x=0;x<count;x++){int i=z*count+x;var p=new Vector3(min+x*step,100,min+z*step);if(!Physics.Raycast(p,Vector3.down,out var h,200,1<<9))continue;heights[i]=h.point.y-.07f;seen[i]=covered[i]=true;queue.Enqueue(i);}
            while(queue.Count>0){int i=queue.Dequeue(),x=i%count,y=i/count;foreach(int d in new[]{-1,1,-count,count}){int n=i+d;if(n<0||n>=seen.Length||Mathf.Abs(n%count-x)+Mathf.Abs(n/count-y)!=1||seen[n])continue;seen[n]=true;distance[n]=distance[i]+1;heights[n]=heights[i];queue.Enqueue(n);}}
            var vertices=new Vector3[heights.Length];var colors=new Color[heights.Length];var indices=new List<int>();
            for(int z=0;z<count;z++)for(int x=0;x<count;x++){int i=z*count+x;float wx=min+x*step,wz=min+z*step;float blend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(15,110,distance[i]*step));float ridge=18+14*Mathf.Sin(wx*.019f)*Mathf.Sin(wz*.017f);float y=heights[i]+ridge*blend;
                if(Physics.Raycast(new Vector3(wx,100,wz),Vector3.down,out var river,200,1<<10))y=Mathf.Min(y,river.point.y-1.1f);
                vertices[i]=new Vector3(wx,y,wz);colors[i]=Color.Lerp(new Color(.4f,.46f,.29f),new Color(.39f,.42f,.32f),blend);if(x<count-1&&z<count-1){int a=i,b=a+1,c=a+count,d=c+1;if(!(covered[a]&&covered[c]&&covered[b]))indices.AddRange(new[]{a,c,b});if(!(covered[b]&&covered[c]&&covered[d]))indices.AddRange(new[]{b,c,d});}}
            foreach(var go in water)UnityEngine.Object.DestroyImmediate(go);
            var mesh=new Mesh{name="Continuous peripheral valley scenery",indexFormat=IndexFormat.UInt32};mesh.vertices=vertices;mesh.colors=colors;mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateBounds();string asset=Folder+"/Peripheral-valley.asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(asset);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);mesh=old;}else AssetDatabase.CreateAsset(mesh,asset);
            Ground("Peripheral valley scenery",mesh,soil,false);
        }
        static void Capture(Camera source,Vector3 position,Vector3 target,string filename)
        {
            var go=new GameObject("Forest review camera");var c=go.AddComponent<Camera>();c.CopyFrom(source);c.enabled=false;c.farClipPlane=2000;c.fieldOfView=52;c.aspect=16f/9;c.transform.position=position;c.transform.LookAt(target,Mathf.Abs((target-position).normalized.y)>.99f?Vector3.forward:Vector3.up);
            var rt=new RenderTexture(1600,900,24);var pixels=new Texture2D(1600,900,TextureFormat.RGB24,false);var previous=RenderTexture.active;
            try{rt.Create();c.targetTexture=rt;RenderPipeline.SubmitRenderRequest(c,new RenderPipeline.StandardRequest{destination=rt});RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1600,900),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(Output,filename),pixels.EncodeToPNG());}
            finally{RenderTexture.active=previous;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(pixels);UnityEngine.Object.DestroyImmediate(go);}
        }
        static void ExportAuthority()
        {
            string file=Path.Combine(Repo,"native/ArtSource/new-world-runtime.json");var old=JObject.Parse(File.ReadAllText(file));float step=(float)old["step"],ox=(float)old["minX"],oy=(float)old["minY"];int ow=(int)old["width"],oh=(int)old["height"];
            var bounds=root.GetComponentInChildren<MeshCollider>().bounds;float x0=Mathf.Min(ox,Mathf.Floor(50-bounds.max.x)),y0=Mathf.Min(oy,Mathf.Floor(50+bounds.min.z)),x1=Mathf.Max(ox+(ow-1)*step,Mathf.Ceil(50-bounds.min.x)),y1=Mathf.Max(oy+(oh-1)*step,Mathf.Ceil(50+bounds.max.z));
            int width=Mathf.RoundToInt((x1-x0)/step)+1,height=Mathf.RoundToInt((y1-y0)/step)+1;var heights=new float[width*height];var walk=new int[heights.Length];var oldH=old["heights"].Values<float>().ToArray();var oldW=old["walkable"].Values<int>().ToArray();
            for(int y=0;y<height;y++)for(int x=0;x<width;x++){
                float lx=x0+x*step,ly=y0+y*step;int i=y*width+x,cx=Mathf.RoundToInt((lx-ox)/step),cy=Mathf.RoundToInt((ly-oy)/step);bool existed=cx>=0&&cy>=0&&cx<ow&&cy<oh;
                if(existed){heights[i]=oldH[cy*ow+cx];walk[i]=oldW[cy*ow+cx];}
                var p=new Vector3(50-lx,80,ly-50);var origin=data["origin"];float dx=p.x-(float)origin[0],dz=p.z-(float)origin[2],u=dx*(float)data["side"][0]+dz*(float)data["side"][1],v=dx*(float)data["forward"][0]+dz*(float)data["forward"][1];
                // Re-query every physical surface: old forest cells whose mesh was removed must not survive as invisible walkways.
                walk[i]=0;if(!Physics.Raycast(p,Vector3.down,out var h,160,1<<9))continue;
                heights[i]=(float)Math.Round(h.point.y,3);float creek=107+8*Mathf.Sin(u/37f)+3*Mathf.Sin(u/16f);bool submerged=h.collider.transform.IsChildOf(root)&&Mathf.Abs(v-creek)<2.7f&&1.9f+.003f*u-h.point.y>.22f;
                walk[i]=!submerged&&h.normal.y>=.65f&&!Physics.CheckCapsule(h.point+Vector3.up*.36f,h.point+Vector3.up*1.5f,.28f,1<<8)?1:0;
            }
            int Index(JToken p)=>Mathf.RoundToInt(((float)p["y"]-y0)/step)*width+Mathf.RoundToInt(((float)p["x"]-x0)/step);
            var reachable=new bool[walk.Length];var queue=new Queue<int>();int start=Index(old["spawn"]);reachable[start]=true;queue.Enqueue(start);
            while(queue.Count>0){int i=queue.Dequeue(),x=i%width,y=i/width;foreach(var d in new[]{-1,1,-width,width}){int ni=i+d;if(ni<0||ni>=walk.Length||Mathf.Abs(ni%width-x)+Mathf.Abs(ni/width-y)!=1||reachable[ni]||walk[ni]!=1||Mathf.Abs(heights[ni]-heights[i])>.45f)continue;reachable[ni]=true;queue.Enqueue(ni);}}
            foreach(var clearing in data["clearings"])if(!reachable[Index(clearing["position"])])throw new InvalidOperationException("Unreachable clearing: "+clearing["id"]);
            bool Inside(float x,float y){bool yes=false;var poly=(JArray)old["outline"];for(int i=0,j=poly.Count-1;i<poly.Count;j=i++)if(((float)poly[i]["y"]>y)!=((float)poly[j]["y"]>y)&&x<((float)poly[j]["x"]-(float)poly[i]["x"])*(y-(float)poly[i]["y"])/((float)poly[j]["y"]-(float)poly[i]["y"])+(float)poly[i]["x"])yes=!yes;return yes;}
            int newArea=0;for(int i=0;i<walk.Length;i++){if(!reachable[i])walk[i]=0;if(walk[i]==1&&!Inside(x0+i%width*step,y0+i/width*step)){var p=new Vector3(50-(x0+i%width*step),0,y0+i/width*step-50);var o=data["origin"];float dx=p.x-(float)o[0],dz=p.z-(float)o[2],v=dx*(float)data["forward"][0]+dz*(float)data["forward"][1];if(v>0)newArea++;}}
            float area=newArea*step*step;if(area<(float)data["villageArea"]*2)throw new InvalidOperationException("Reachable exterior too small: "+area);
            var sites=(JArray)data["resources"].DeepClone();foreach(var s in sites){int at=Index(s["stand"]);if(reachable[at])continue;int best=-1;float gap=2;for(int dy=-4;dy<=4;dy++)for(int dx=-4;dx<=4;dx++){int ni=at+dy*width+dx;float d=Mathf.Sqrt(dx*dx+dy*dy)*step;if(ni>=0&&ni<walk.Length&&reachable[ni]&&d<gap){best=ni;gap=d;}}if(best<0)throw new InvalidOperationException("Resource stand obstructed: "+s["id"]);s["stand"]=new JObject{["x"]=x0+best%width*step,["y"]=y0+best/width*step};}
            old["minX"]=x0;old["minY"]=y0;old["width"]=width;old["height"]=height;old["heights"]=JArray.FromObject(heights);old["walkable"]=JArray.FromObject(walk);old["exportedUtc"]=DateTime.UtcNow.ToString("O");
            var before=JObject.Parse(File.ReadAllText(Path.Combine(Output,"runtime-before.json")));var resourceGrid=new JObject();foreach(var k in new[]{"minX","minY","step","width","height","walkable"})resourceGrid[k]=before[k].DeepClone();
            var habitats=(JObject)data["habitats"].DeepClone();foreach(var group in habitats.Properties())foreach(var p in (JArray)group.Value){int at=Index(p);if(reachable[at])continue;int best=-1;float gap=5;for(int dy=-10;dy<=10;dy++)for(int dx=-10;dx<=10;dx++){int ni=at+dy*width+dx;float d=Mathf.Sqrt(dx*dx+dy*dy)*step;if(ni>=0&&ni<walk.Length&&reachable[ni]&&d<gap){best=ni;gap=d;}}if(best<0)throw new InvalidOperationException("No accessible "+group.Name+" habitat");p["x"]=x0+best%width*step;p["y"]=y0+best/width*step;}
            var drinking=(JArray)data["drinkingWater"].DeepClone();foreach(var p in drinking)if(!reachable[Index(p)])throw new InvalidOperationException("Forest drinking shoreline obstructed");
            old["forestExpansion"]=new JObject{["id"]="forest-expansion-v1",["clearings"]=data["clearings"].DeepClone(),["resources"]=sites,["habitats"]=habitats,["drinkingWater"]=drinking,["reachableArea"]=area,["resourceGrid"]=resourceGrid};
            File.WriteAllText(file+".forest.tmp",old.ToString(Newtonsoft.Json.Formatting.None));File.Copy(file+".forest.tmp",file,true);File.Delete(file+".forest.tmp");
            File.WriteAllText(Path.Combine(Output,"validation.json"),new JObject{["clearingsReachable"]=5,["resourceStandsReachable"]=sites.Count,["reachableExteriorArea"]=area,["villageArea"]=data["villageArea"],["areaRatio"]=area/(float)data["villageArea"],["trees"]=data["trees"].Count(),["gridCells"]=walk.Length,["scene"]=ScenePath}.ToString());
        }
    }
}
