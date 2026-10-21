using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace CampMind.Editor
{
    // Applies only to the currently loaded hand-edited scene. Never calls a builder.
    public static class NewWorldLocalJoinRepair
    {
        private const string RootName="局部接地修补 v1 — 不改变建筑方向";
        private static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        private static string Request=>Path.Combine(Repo,"native/Artifacts/local-join-repair.request.json");
        private sealed class Approach
        {
            public string id;public Vector3 start,forward,side;public float width,length,endHeight;public Mesh mesh;
            public float Grade(float t)=>Mathf.Lerp(start.y,endHeight,Mathf.SmoothStep(0,1,t));
            public float Influence(Vector3 p,out float t){var d=p-start;t=Vector3.Dot(d,forward)/length;float lateral=Mathf.Abs(Vector3.Dot(d,side));return t<0||t>1?0:1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(width*.5f,width*.5f+1.4f,lateral));}
        }
        private static double nextCheck;
        private static bool running;
        [InitializeOnLoadMethod] private static void ResumeRequestedRepair(){if(File.Exists(Request+".pending")&&!File.Exists(Request))File.Move(Request+".pending",Request);EditorApplication.update+=WatchRequestedRepair;}
        private static void WatchRequestedRepair(){if(running||EditorApplication.timeSinceStartup<nextCheck)return;nextCheck=EditorApplication.timeSinceStartup+2;if(!EditorApplication.isCompiling&&!EditorApplication.isUpdating)TryRequestedRepair();}
        private static void TryRequestedRepair()
        {
            if(!File.Exists(Request)||EditorApplication.isPlayingOrWillChangePlaymode)return;
            var scene=SceneManager.GetActiveScene();if(!scene.IsValid()||!scene.isLoaded||!scene.name.StartsWith("NewWorld",StringComparison.Ordinal))return;
            running=true;
            try{Repair();File.Move(Request,Request+".completed-"+DateTime.Now.ToString("yyyyMMddHHmmss"));}
            catch(Exception error){Debug.LogException(error);var failed=Request+".failed-"+DateTime.Now.ToString("yyyyMMddHHmmss");File.WriteAllText(failed+".error.txt",error.ToString());if(File.Exists(Request))File.Move(Request,failed);}
            finally{running=false;}
        }
        [MenuItem("CampMind/新世界/修补当前场景的楼梯和桥头接地")]
        public static void Repair()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play mode before changing the scene");
            var scene=SceneManager.GetActiveScene();if(!scene.name.StartsWith("NewWorld",StringComparison.Ordinal))throw new InvalidOperationException("Open the hand-edited NewWorld scene");
            var all=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).ToArray();
            if(all.Any(t=>t.name==RootName)){Debug.Log("局部接地修补已存在，没有重复处理。");return;}
            var protectedTransforms=all.Select(t=>(t,t.position,t.rotation,t.localScale)).ToArray();
            var filters=all.Where(t=>t.gameObject.activeInHierarchy).Select(t=>t.GetComponent<MeshFilter>()).Where(f=>f&&f.sharedMesh).ToArray();
            bool Ground(string n)=>n.StartsWith("Registered terrain section",StringComparison.Ordinal)||n.EndsWith("-relief",StringComparison.Ordinal)||n.StartsWith("observed-bank-rock-",StringComparison.Ordinal)||n.StartsWith("Source terrain boulder detail",StringComparison.Ordinal);
            var terrain=filters.Where(f=>Ground(f.name)).ToArray();
            var stairs=filters.Where(f=>f.name.StartsWith("main-stair-",StringComparison.Ordinal)).OrderBy(f=>int.Parse(f.name.Substring("main-stair-".Length))).ToArray();
            var deck=all.FirstOrDefault(t=>t.name=="bridge-deck");var bridge=all.FirstOrDefault(t=>t.name.StartsWith("Source bridge —",StringComparison.Ordinal));
            if(terrain.Length==0||stairs.Length<2||!deck||!bridge)throw new InvalidOperationException("Expected existing ground, main stairs and source bridge; scene was not changed");
            VerifyBulkClip();
            var stamp=DateTime.Now.ToString("yyyyMMdd-HHmmss");var folder="Assets/CampMind/NewWorldManualRepairs/"+stamp;Directory.CreateDirectory(folder);AssetDatabase.Refresh();
            // saveAsCopy captures even unsaved manual rotations without replacing the active scene.
            if(!EditorSceneManager.SaveScene(scene,folder+"/before-local-joins.unity",true))throw new IOException("Could not preserve the current manual scene");
            var groundColliders=terrain.Select(f=>f.GetComponent<MeshCollider>()).Where(c=>c&&c.enabled).ToArray();var support=stairs.Select(f=>f.GetComponent<Collider>()).Where(c=>c&&c.enabled).Concat(new[]{deck.GetComponent<Collider>()}).ToArray();var bed=all.FirstOrDefault(t=>t.name=="river-new-bed")?.GetComponent<MeshCollider>();Physics.SyncTransforms();
            float? HitHeight(Vector3 p,IEnumerable<Collider> colliders){var ray=new Ray(new Vector3(p.x,80,p.z),Vector3.down);var hits=colliders.Where(c=>c).Select(c=>{bool found=c.Raycast(ray,out var hit,160);return(found,hit);}).Where(h=>h.found).ToArray();return hits.Length>0?(float?)hits.Max(h=>h.hit.point.y):null;}
            float GroundHeight(Vector3 p){var height=HitHeight(p,groundColliders)??HitHeight(p,support);if(height.HasValue)return height.Value;var ray=new Ray(new Vector3(p.x,80,p.z),Vector3.down);if(bed&&bed.Raycast(ray,out var riverbed,160))return riverbed.point.y;foreach(float radius in new[]{.4f,.8f,1.6f}){var nearby=new[]{Vector3.left,Vector3.right,Vector3.forward,Vector3.back}.Select(d=>HitHeight(p+d*radius,groundColliders)??HitHeight(p+d*radius,support)).Where(h=>h.HasValue).Select(h=>h.Value).OrderBy(h=>h).ToArray();if(nearby.Length>0)return nearby[(nearby.Length-1)/2];}throw new InvalidOperationException("No actual land or structural support near approach at "+p);}
            Vector3[] Top(MeshFilter filter){var p=filter.sharedMesh.vertices.Select(filter.transform.TransformPoint).ToArray();float y=p.Max(v=>v.y);return Hull(p.Where(v=>v.y>y-.015f).ToArray());}
            var low=Top(stairs.First());var high=Top(stairs.Last());var lowCenter=Average(low);var highCenter=Average(high);var up=Vector3.ProjectOnPlane(highCenter-lowCenter,Vector3.up).normalized;
            var side=Vector3.Cross(Vector3.up,up);float stairWidth=low.Max(v=>Vector3.Dot(v,side))-low.Min(v=>Vector3.Dot(v,side));
            Vector3 Edge(Vector3[] p,Vector3 axis,bool end){float s=end?p.Max(v=>Vector3.Dot(v,axis)):p.Min(v=>Vector3.Dot(v,axis));return Average(p.Where(v=>Mathf.Abs(Vector3.Dot(v,axis)-s)<.04f).ToArray());}
            var approaches=new List<Approach>();
            void ApproachAt(string id,Vector3 edge,Vector3 outward,float width,float length){var forward=Vector3.ProjectOnPlane(outward,Vector3.up).normalized;float endHeight=GroundHeight(edge+forward*length);float maximum=Mathf.Max(length,16);while(Mathf.Abs(endHeight-edge.y)>length*.28f&&length<maximum){length=Mathf.Min(maximum,length+2);endHeight=GroundHeight(edge+forward*length);}var approach=new Approach{id=id,start=edge-forward*.06f,forward=forward,side=Vector3.Cross(Vector3.up,forward),width=width,length=length+.06f,endHeight=endHeight};if(Mathf.Abs(approach.endHeight-edge.y)>length*.38f)throw new InvalidOperationException($"{id} excessive height gap: edge={edge}, endHeight={endHeight}, length={length}; scene left unchanged");approach.mesh=CreateApproach(approach,GroundHeight);approaches.Add(approach);}
            ApproachAt("主殿长阶下端落地",Edge(low,up,false),-up,stairWidth,4);
            var axis=Vector3.ProjectOnPlane(deck.forward,Vector3.up).normalized;var across=Vector3.Cross(Vector3.up,axis);var box=deck.GetComponent<BoxCollider>();float halfWidth=deck.lossyScale.x*box.size.x*.5f;float deckHeight=deck.position.y;
            var walk=new List<Vector3>();foreach(var f in bridge.GetComponentsInChildren<MeshFilter>()){var v=f.sharedMesh.vertices;var n=f.sharedMesh.normals;for(int i=0;i<v.Length;i++){var p=f.transform.TransformPoint(v[i]);if(n.Length==v.Length&&f.transform.TransformDirection(n[i]).y>.65f&&p.y>deckHeight-1.2f&&p.y<deckHeight+.65f&&Mathf.Abs(Vector3.Dot(p-deck.position,across))<halfWidth*1.05f)walk.Add(p);}}
            if(walk.Count<8)throw new InvalidOperationException("Cannot identify the actual source bridge walk surface");
            foreach(int sign in new[]{-1,1}){var outward=axis*sign;float extent=walk.Max(p=>Vector3.Dot(p-deck.position,outward));var end=walk.Where(p=>extent-Vector3.Dot(p-deck.position,outward)<.32f).ToArray();var edge=deck.position+outward*extent;edge.y=end.Select(p=>p.y).OrderBy(y=>y).ElementAt(end.Length/2);float length=4.5f;if(sign>0){var posts=all.Where(t=>t.name=="gate-post").Select(t=>t.position).ToArray();if(posts.Length==2){var delta=Vector3.ProjectOnPlane(Average(posts)-edge,Vector3.up);outward=delta.normalized;length=delta.magnitude+.8f;}}ApproachAt(sign<0?"木桥外岸落地":"木桥寨门侧落地",edge,outward,halfWidth*2,length);}
            var outlines=new List<Vector3[]>();var heights=new List<float>();
            foreach(var step in stairs){var top=Top(step);outlines.Add(top);heights.Add(top[0].y-.035f);}
            foreach(var approach in approaches){for(int row=0;row<16;row++){// Only the walking core is cut; draped shoulders retain the natural bank.
                var a=approach.start+approach.forward*(approach.length*row/16f);var b=approach.start+approach.forward*(approach.length*(row+1)/16f);var offset=approach.side*(approach.width*.5f+.04f);outlines.Add(new[]{a-offset,a+offset,b+offset,b-offset});heights.Add(Mathf.Min(approach.Grade(row/16f),approach.Grade((row+1)/16f))-.035f);
            }}
            Undo.IncrementCurrentGroup();int undo=Undo.GetCurrentGroup();Undo.SetCurrentGroupName("修补楼梯与桥头接地（保留手调方向）");var root=new GameObject(RootName);Undo.RegisterCreatedObjectUndo(root,"局部接地修补");
            try{
            int changed=0;foreach(var filter in terrain){var worldBounds=filter.GetComponent<Renderer>()?filter.GetComponent<Renderer>().bounds:filter.GetComponent<MeshCollider>().bounds;if(!outlines.Any(o=>OverlapsXZ(worldBounds,o)))continue;
                var mesh=UnityEngine.Object.Instantiate(filter.sharedMesh);var points=mesh.vertices.Select(filter.transform.TransformPoint).ToArray();for(int i=0;i<points.Length;i++)foreach(var approach in approaches){float influence=approach.Influence(points[i],out float t);float grade=approach.Grade(t)-.04f;if(influence>0&&Mathf.Abs(points[i].y-grade)<1.6f)points[i].y=Mathf.Lerp(points[i].y,grade,influence);}
                mesh.vertices=points;mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();var cut=StaticMeshClip.SubtractAbovePolygons(mesh,outlines,heights);UnityEngine.Object.DestroyImmediate(mesh);var compact=NewWorldSourceModules.Compact(cut);UnityEngine.Object.DestroyImmediate(cut);compact.vertices=compact.vertices.Select(filter.transform.InverseTransformPoint).ToArray();compact.RecalculateNormals();compact.RecalculateTangents();compact.RecalculateBounds();AssetDatabase.CreateAsset(compact,folder+"/ground-join-"+changed+++".asset");Undo.RecordObject(filter,"局部地形派生副本");filter.sharedMesh=compact;var collider=filter.GetComponent<MeshCollider>();if(collider){Undo.RecordObject(collider,"局部接地碰撞");collider.sharedMesh=compact;}
            }
            var road=new Material(AssetDatabase.LoadAssetAtPath<Material>(NewWorldCalibrationBuilder.Folder+"/RoadProxy.mat"));road.name="局部落地土路与草肩渐变";road.SetFloat("_UseVertexDirt",1);road.SetFloat("_Dirt",1);AssetDatabase.CreateAsset(road,folder+"/join-ground.mat");foreach(var approach in approaches){AssetDatabase.CreateAsset(approach.mesh,folder+"/"+approach.id+".asset");var go=new GameObject(approach.id);go.transform.SetParent(root.transform,false);go.AddComponent<MeshFilter>().sharedMesh=approach.mesh;go.AddComponent<MeshRenderer>().sharedMaterial=road;go.AddComponent<MeshCollider>().sharedMesh=approach.mesh;}
            // Remove the previous isolated narrow strip, retaining it for Undo.
            foreach(var t in all.Where(t=>t.name=="Registered terrain section gate approach")){var renderer=t.GetComponent<Renderer>();if(renderer){Undo.RecordObject(renderer,"替换突兀的旧门外坡条");renderer.enabled=false;}var collider=t.GetComponent<Collider>();if(collider){Undo.RecordObject(collider,"替换旧坡条碰撞");collider.enabled=false;}}
            Undo.RecordObject(box,"木桥可见桥面与碰撞面重合");var center=box.center;center.y=-box.size.y*.5f;box.center=center;
            foreach(var entry in protectedTransforms)if(entry.t.position!=entry.position||Quaternion.Angle(entry.t.rotation,entry.rotation)>.001f||entry.t.localScale!=entry.localScale)throw new InvalidOperationException("A pre-existing transform changed: "+entry.t.name);
            Physics.SyncTransforms();EditorSceneManager.MarkSceneDirty(scene);AssetDatabase.SaveAssets();Undo.CollapseUndoOperations(undo);
            var output=Path.Combine(Repo,"native/Artifacts/local-joins-"+stamp);Directory.CreateDirectory(output);
            var report=new JObject{["scene"]=scene.path,["backup"]=folder+"/before-local-joins.unity",["changedGroundMeshes"]=changed,["existingTransformsPreserved"]=true,["savedActiveScene"]=false,["paidTasks"]=0,["approaches"]=new JArray(approaches.Select(a=>new JObject{["id"]=a.id,["start"]=JArray.FromObject(new[]{a.start.x,a.start.y,a.start.z}),["endHeight"]=a.endHeight,["width"]=a.width,["length"]=a.length})),["visualAccepted"]=false,["walkingVerified"]=false};
            File.WriteAllText(Path.Combine(output,"repair-report.json"),report.ToString());
            try{var camera=all.Select(t=>t.GetComponent<Camera>()).FirstOrDefault(c=>c&&c.CompareTag("MainCamera"));if(camera){Capture(camera,Path.Combine(output,"overview.png"));foreach(var a in approaches){var look=a.start+a.forward*a.length*.4f;Capture(camera,Path.Combine(output,a.id+".png"),look+Vector3.up*5-a.forward*8+a.side*6,look);}}}catch(Exception error){File.WriteAllText(Path.Combine(output,"capture-error.txt"),error.ToString());Debug.LogWarning("接地修补已应用，但自动截图失败；请在Scene窗口查看。");}
            SceneView.RepaintAll();Debug.Log("局部接地修补已应用；主殿、箭塔及所有原对象Transform保持不变。请检查后Ctrl+S保存，可Ctrl+Z撤销。报告："+output);
            }catch{Undo.RevertAllDownToGroup(undo);throw;}
        }
        private static void VerifyBulkClip()
        {
            var source=new Mesh();source.vertices=new[]{new Vector3(-3,2,-3),new Vector3(3,2,-3),new Vector3(3,2,3),new Vector3(-3,2,3)};source.uv=source.vertices.Select(v=>new Vector2(v.x,v.z)).ToArray();source.triangles=new[]{0,2,1,0,3,2};Mesh result=null;
            try{var left=new[]{new Vector3(-2,0,-1),new Vector3(0,0,-1),new Vector3(0,0,1),new Vector3(-2,0,1)};var right=left.Select(v=>v+Vector3.right*3).ToArray();result=StaticMeshClip.SubtractAbovePolygons(source,new[]{left,right},new[]{1f,3f});var v=result.vertices;var indices=result.triangles;float area=0;for(int i=0;i<indices.Length;i+=3)area+=Vector3.Cross(v[indices[i+1]]-v[indices[i]],v[indices[i+2]]-v[indices[i]]).magnitude*.5f;if(Mathf.Abs(area-32)>.001f||source.vertexCount!=4||v.Where((p,i)=>Vector2.Distance(result.uv[i],new Vector2(p.x,p.z))>.001f).Any())throw new InvalidOperationException("Bulk ground clip preflight failed: area/UV/source preservation");}
            finally{if(result)UnityEngine.Object.DestroyImmediate(result);UnityEngine.Object.DestroyImmediate(source);}
        }
        private static Vector3 Average(Vector3[] points){if(points.Length==0)throw new ArgumentException("Empty surface edge");return points.Aggregate(Vector3.zero,(a,b)=>a+b)/points.Length;}
        private static bool OverlapsXZ(Bounds b,Vector3[] polygon)=>polygon.Max(v=>v.x)>=b.min.x&&polygon.Min(v=>v.x)<=b.max.x&&polygon.Max(v=>v.z)>=b.min.z&&polygon.Min(v=>v.z)<=b.max.z;
        private static Vector3[] Hull(Vector3[] points)
        {
            float Cross(Vector3 a,Vector3 b,Vector3 c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);var sorted=points.Distinct().OrderBy(p=>p.x).ThenBy(p=>p.z).ToArray();var hull=new List<Vector3>();foreach(var p in sorted){while(hull.Count>1&&Cross(hull[hull.Count-2],hull.Last(),p)<=0)hull.RemoveAt(hull.Count-1);hull.Add(p);}int count=hull.Count;foreach(var p in sorted.Reverse().Skip(1)){while(hull.Count>count&&Cross(hull[hull.Count-2],hull.Last(),p)<=0)hull.RemoveAt(hull.Count-1);hull.Add(p);}hull.RemoveAt(hull.Count-1);return hull.ToArray();
        }
        private static Mesh CreateApproach(Approach a,Func<Vector3,float> ground)
        {
            const int rows=16,cross=12;var vertices=new List<Vector3>();var colours=new List<Color>();var indices=new List<int>();for(int r=0;r<=rows;r++){float t=r/(float)rows;for(int c=0;c<=cross;c++){float x=(c/(float)cross*2-1)*(a.width*.5f+1.4f);var p=a.start+a.forward*(a.length*t)+a.side*x;float h=ground(p);float core=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(a.width*.5f,a.width*.5f+1.4f,Mathf.Abs(x)));float taper=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.72f,1,t));p.y=Mathf.Lerp(h,a.Grade(t),core*taper)+.012f;vertices.Add(p);colours.Add(new Color(core*taper,0,0,1));if(r==0||c==0)continue;int i=(r-1)*(cross+1)+c-1,j=i+cross+1;foreach(var tri in new[]{new[]{i,j,j+1},new[]{i,j+1,i+1}}){if(Vector3.Cross(vertices[tri[1]]-vertices[tri[0]],vertices[tri[2]]-vertices[tri[0]]).y<0)Array.Reverse(tri);indices.AddRange(tri);}}}
            var mesh=new Mesh{name=a.id+" — graded walking core and draped land shoulders"};mesh.SetVertices(vertices);mesh.SetColors(colours);mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static void Capture(Camera source,string path,Vector3? position=null,Vector3? look=null)
        {
            var go=new GameObject("Local repair diagnostic camera");var camera=go.AddComponent<Camera>();camera.CopyFrom(source);camera.transform.SetPositionAndRotation(position??source.transform.position,position.HasValue?Quaternion.LookRotation(look.Value-position.Value):source.transform.rotation);camera.aspect=1672f/941;camera.fieldOfView=position.HasValue?48:source.fieldOfView;var texture=new RenderTexture(1672,941,24);var previous=RenderTexture.active;Texture2D image=null;
            try{camera.targetTexture=texture;camera.Render();RenderTexture.active=texture;image=new Texture2D(1672,941,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1672,941),0,0);image.Apply();File.WriteAllBytes(path,image.EncodeToPNG());}finally{RenderTexture.active=previous;camera.targetTexture=null;if(image)UnityEngine.Object.DestroyImmediate(image);texture.Release();UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(go);}
        }
    }
}
