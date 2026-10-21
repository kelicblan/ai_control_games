using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using CampMind.Presentation;

namespace CampMind.Editor
{
    [InitializeOnLoad]
    public static class BridgeRiverRepair
    {
        const string ScenePath="Assets/CampMind/NewWorldGame/Camp.unity";
        const string Folder="Assets/CampMind/NewWorldGame/BridgeRiverRepair";
        static string Repo=>Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        static string Request=>Path.Combine(BridgeRiverAudit.Output,"repair.request");
        static bool busy;
        static BridgeRiverRepair(){EditorApplication.update+=Poll;}
        static void Poll()
        {
            if(busy||!File.Exists(Request)||EditorApplication.isCompiling||EditorApplication.isUpdating)return;
            if(EditorApplication.isPlayingOrWillChangePlaymode){EditorApplication.isPlaying=false;return;}
            busy=true;var command=File.ReadAllText(Request).Trim();File.Delete(Request);
            try{if(command=="refine")RestoreOwnChanges();Repair();}catch(Exception e){File.WriteAllText(Path.Combine(BridgeRiverAudit.Output,"repair-failure.txt"),e.ToString());Debug.LogException(e);}finally{busy=false;}
        }
        static void RestoreOwnChanges()
        {
            var current=SceneManager.GetActiveScene();if(current.path!=ScenePath)throw new InvalidOperationException("Open the repaired camp scene first.");
            var original=EditorSceneManager.OpenScene(Folder+"/Before.unity",OpenSceneMode.Additive);var originallyActive=new HashSet<GameObject>(original.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).Where(t=>t.gameObject.activeSelf).Select(t=>t.gameObject));foreach(var g in original.GetRootGameObjects())g.SetActive(false);
            var prior=original.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>(true)).Where(f=>f.sharedMesh).ToArray();
            foreach(var f in current.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>(true)))
            {
                if(f.GetComponentInParent<Transform>()?.root.name=="桥头与自然河岸修复")continue;
                var old=prior.FirstOrDefault(p=>p.name==f.name);if(!old)continue;
                if(AssetDatabase.GetAssetPath(f.sharedMesh).StartsWith(Folder+"/")){f.sharedMesh=old.sharedMesh;var col=f.GetComponent<MeshCollider>();if(col)col.sharedMesh=f.sharedMesh;}
                if(f.name=="Bridge source-matched walk surface"||f.name=="river-new-flow-surface"||f.name=="river-new-bed"||f.name=="river-village-shore"||f.name=="river-outer-shore"||f.name=="Bridge local river continuity"){f.gameObject.SetActive(originallyActive.Contains(old.gameObject));var c=f.GetComponent<Collider>();if(c)c.enabled=old.GetComponent<Collider>()?.enabled==true;}
            }
            var owner=current.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).First(t=>t.name.StartsWith("Source bridge"));
            var oldOwner=original.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Transform>(true)).First(t=>t.name==owner.name);owner.SetPositionAndRotation(oldOwner.position,oldOwner.rotation);owner.localScale=oldOwner.localScale;
            UnityEngine.Object.DestroyImmediate(current.GetRootGameObjects().First(g=>g.name=="桥头与自然河岸修复"));
            EditorSceneManager.CloseScene(original,true);SceneManager.SetActiveScene(current);EditorSceneManager.MarkSceneDirty(current);EditorSceneManager.SaveScene(current);
        }
        static Mesh World(MeshFilter f)
        {
            var mesh=UnityEngine.Object.Instantiate(f.sharedMesh);mesh.vertices=mesh.vertices.Select(f.transform.TransformPoint).ToArray();
            mesh.normals=mesh.normals.Select(n=>f.transform.TransformDirection(n).normalized).ToArray();mesh.RecalculateBounds();return mesh;
        }
        static Mesh Persist(Mesh mesh,string name)
        {
            var path=Folder+"/"+name+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);return old;}
            AssetDatabase.CreateAsset(mesh,path);return mesh;
        }
        static void Assign(MeshFilter f,Mesh world,string name)
        {
            world.vertices=world.vertices.Select(f.transform.InverseTransformPoint).ToArray();world.RecalculateNormals();world.RecalculateBounds();
            f.sharedMesh=Persist(world,name);var collider=f.GetComponent<MeshCollider>();if(collider)collider.sharedMesh=f.sharedMesh;
        }
        static Mesh Mesh(List<Vector3> vertices,List<int> triangles)
        {
            var mesh=new Mesh{indexFormat=UnityEngine.Rendering.IndexFormat.UInt32};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.uv=vertices.Select(v=>new Vector2(v.x,v.z)*.15f).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        static void Quad(List<int> triangles,List<Vector3> vertices,int a,int b,int c,int d)
        {
            foreach(var tri in new[]{new[]{a,c,b},new[]{b,c,d}}){if(Vector3.Cross(vertices[tri[1]]-vertices[tri[0]],vertices[tri[2]]-vertices[tri[0]]).y<0)Array.Reverse(tri);triangles.AddRange(tri);}
        }
        static Material Material(string name,Color colour)
        {
            var path=Folder+"/"+name+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!material){material=new Material(Shader.Find("CampMind/River Ground"));AssetDatabase.CreateAsset(material,path);}material.SetColor("_BaseColor",colour);EditorUtility.SetDirty(material);return material;
        }
        static GameObject Make(Transform parent,string name,Mesh mesh,Material material,int layer,bool collision)
        {
            var go=new GameObject(name);go.transform.SetParent(parent,false);go.layer=layer;go.AddComponent<MeshFilter>().sharedMesh=Persist(mesh,name);
            if(material)go.AddComponent<MeshRenderer>().sharedMaterial=material;
            if(collision)go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            return go;
        }
        [MenuItem("CampMind/修复木桥接地和清澈河水")]
        public static void Repair()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play mode before repairing the scene.");
            var scene=SceneManager.GetActiveScene();if(scene.path!=ScenePath)scene=EditorSceneManager.OpenScene(ScenePath);
            if(scene.GetRootGameObjects().Any(g=>g.name=="桥头与自然河岸修复"))throw new InvalidOperationException("Repair already applied; inspect the saved result before reapplying.");
            Directory.CreateDirectory(Folder);Directory.CreateDirectory(BridgeRiverAudit.Output);AssetDatabase.Refresh();
            EditorSceneManager.SaveScene(scene,Folder+"/Before.unity",true);
            var runtime=Path.Combine(Repo,"native/ArtSource/new-world-runtime.json");File.Copy(runtime,Path.Combine(BridgeRiverAudit.Output,"authority-before.json"),true);
            var all=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<MeshFilter>(true)).Where(f=>f.sharedMesh&&f.gameObject.activeInHierarchy).ToArray();
            var bridge=all.First(f=>f.name=="bridge(Clone)"&&f.GetComponent<Renderer>()?.enabled==true);
            var inside=BridgeRiverAudit.Inside;var outside=BridgeRiverAudit.Outside;var axis=Vector3.ProjectOnPlane(outside-inside,Vector3.up).normalized;var side=Vector3.Cross(Vector3.up,axis);var length=Vector3.ProjectOnPlane(outside-inside,Vector3.up).magnitude;
            // Imported GLB child transforms can offset its deck from the reference
            // collision strip. Measure the visible deck, then align both systems.
            var bw=World(bridge);var vertices=bw.vertices;var normals=bw.normals;
            var deck=vertices.Where((v,i)=>normals[i].y>.75f&&v.y>-.2f&&v.y<.9f).ToArray();
            if(deck.Length<20)throw new InvalidOperationException("Cannot identify the source bridge deck.");
            var owner=bridge.GetComponentsInParent<Transform>().First(t=>t.name.StartsWith("Source bridge"));
            var mean=deck.Aggregate(Vector3.zero,(sum,p)=>sum+p)/deck.Length;float xx=0,xz=0,zz=0;
            foreach(var p in deck){var d=p-mean;xx+=d.x*d.x;xz+=d.x*d.z;zz+=d.z*d.z;}
            var principal=new Vector2(axis.x,axis.z);for(int i=0;i<16;i++)principal=new Vector2(xx*principal.x+xz*principal.y,xz*principal.x+zz*principal.y).normalized;
            var measured=new Vector3(principal.x,0,principal.y);if(Vector3.Dot(measured,axis)<0)measured=-measured;
            float rotation=Vector3.SignedAngle(measured,axis,Vector3.up);owner.RotateAround((inside+outside)*.5f,Vector3.up,rotation);
            UnityEngine.Object.DestroyImmediate(bw);bw=World(bridge);vertices=bw.vertices;normals=bw.normals;deck=vertices.Where((v,i)=>normals[i].y>.75f&&v.y>-.2f&&v.y<.9f).ToArray();
            float alongMin=deck.Min(p=>Vector3.Dot(p-inside,axis)),alongMax=deck.Max(p=>Vector3.Dot(p-inside,axis));
            float sideMin=deck.Min(p=>Vector3.Dot(p-inside,side)),sideMax=deck.Max(p=>Vector3.Dot(p-inside,side));
            var shift=axis*(length*.5f-(alongMin+alongMax)*.5f)-side*((sideMin+sideMax)*.5f);
            owner.position+=shift;
            UnityEngine.Object.DestroyImmediate(bw);bw=World(bridge);
            var measure=new GameObject("Bridge deck measurement");var sampler=measure.AddComponent<MeshCollider>();sampler.sharedMesh=bw;
            float DeckHeight(float s,float lateral=0)
            {
                for(int i=0;i<=20;i++)foreach(float direction in new[]{1f,-1f})
                {
                    var p=inside+axis*Mathf.Clamp(s+direction*i*.15f,.25f,length-.25f)+side*lateral;
                    if(sampler.Raycast(new Ray(p+Vector3.up*3,Vector3.down),out var hit,8)&&hit.normal.y>.65f&&hit.point.y>-.4f&&hit.point.y<1)return hit.point.y;
                }
                return .37f;
            }
            var terrain=all.Where(f=>f.name.StartsWith("Registered terrain section")||f.name.EndsWith("-relief")||f.name.StartsWith("Restored original bank")||f.name.StartsWith("Source terrain boulder detail")||f.name=="Gate rebuilt closed terrain"||f.name=="木桥外岸落地").ToArray();
            Physics.SyncTransforms();
            float RawGround(Vector3 p)
            {
                float y=float.NegativeInfinity;foreach(var f in terrain){var c=f.GetComponent<Collider>();if(c&&c.enabled&&c.Raycast(new Ray(p+Vector3.up*40,Vector3.down),out var h,80)&&h.normal.y>.55f)y=Mathf.Max(y,h.point.y);}return y;
            }
            float Ground(Vector3 p){var y=RawGround(p);return float.IsFinite(y)?y:0;}
            float innerLand=Ground(inside-axis*3),outerLand=Ground(outside+axis*3);
            var root=new GameObject("桥头与自然河岸修复");
            float visualHalfWidth=Mathf.Clamp((sideMax-sideMin)*.5f,2,3.5f);
            var outline=new[]{inside-axis*.35f-side*(visualHalfWidth+.2f),inside-axis*.35f+side*(visualHalfWidth+.2f),outside+axis*.35f+side*(visualHalfWidth+.2f),outside+axis*.35f-side*(visualHalfWidth+.2f)};
            int cut=0;
            foreach(var f in terrain.Where(f=>f.GetComponent<Renderer>()?.bounds.Intersects(new Bounds((inside+outside)*.5f,new Vector3(32,20,32)))==true))
            {var world=World(f);var clipped=StaticMeshClip.SubtractAbovePolygon(world,outline,-15);UnityEngine.Object.DestroyImmediate(world);Assign(f,NewWorldSourceModules.Compact(clipped),"bridge-clearance-"+cut++);UnityEngine.Object.DestroyImmediate(clipped);}
            var oldWalk=all.First(f=>f.name=="Bridge source-matched walk surface");oldWalk.gameObject.SetActive(false);
            var v=new List<Vector3>();var t=new List<int>();
            for(int i=0;i<=120;i++){float s=Mathf.Lerp(-3,length+3,i/120f);for(int j=0;j<2;j++){float lateral=j==0?-1.6f:1.6f;var p=inside+axis*s+side*lateral;p.y=s<0?Mathf.Lerp(innerLand,DeckHeight(0,lateral),Mathf.SmoothStep(0,1,(s+3)/3)):s>length?Mathf.Lerp(DeckHeight(length,lateral),outerLand,Mathf.SmoothStep(0,1,(s-length)/3)):DeckHeight(s,lateral);v.Add(p);}if(i>0)Quad(t,v,(i-1)*2,(i-1)*2+1,i*2,i*2+1);}
            Make(root.transform,"Bridge aligned continuous walk surface",Mesh(v,t),null,9,true);
            var ground=Material("Natural bank",new Color(.57f,.58f,.40f));
            foreach(bool inner in new[]{true,false})
            {
                var av=new List<Vector3>();var at=new List<int>();for(int i=0;i<=24;i++){float s=inner?Mathf.Lerp(-4,3,i/24f):Mathf.Lerp(length-3,length+4,i/24f);float h=inner?Mathf.Lerp(innerLand,DeckHeight(0),Mathf.SmoothStep(0,1,(s+3)/3)):Mathf.Lerp(DeckHeight(length),outerLand,Mathf.SmoothStep(0,1,(s-length)/3));for(int j=0;j<2;j++)av.Add(inside+axis*s+side*(j==0?-visualHalfWidth-.3f:visualHalfWidth+.3f)+Vector3.up*(h-.12f-inside.y));if(i>0)Quad(at,av,(i-1)*2,(i-1)*2+1,i*2,i*2+1);}
                Make(root.transform,inner?"Bridge village earth approach":"Bridge forest earth approach",Mesh(av,at),ground,9,true);
            }
            UnityEngine.Object.DestroyImmediate(measure);UnityEngine.Object.DestroyImmediate(bw);
            var flow=all.First(f=>f.name=="river-new-flow-surface");var waterWorld=World(flow);
            var reference=UnityEngine.Object.FindFirstObjectByType<NewWorldGameProfile>().referencePosition;
            // The original banks were traced on the land datum, but water was
            // projected several metres below it. That creates the fence-like walls.
            waterWorld.vertices=waterWorld.vertices.Select(p=>{var direction=p-reference;var q=reference+direction*((0-reference.y)/direction.y);return new Vector3(q.x,-.35f,q.z);}).ToArray();waterWorld.RecalculateNormals();waterWorld.RecalculateBounds();
            var waterVertices=waterWorld.vertices;
            var edges=new[]{new List<Vector3>(),new List<Vector3>()};var outwardNormals=new[]{new List<Vector3>(),new List<Vector3>()};var offsets=new List<float>();
            for(int row=0;row<waterVertices.Length/7;row++)
            {
                var a=waterVertices[row*7];var b=waterVertices[row*7+6];var across=Vector3.ProjectOnPlane(b-a,Vector3.up).normalized;
                for(int bank=0;bank<2;bank++)
                {
                    var wanted=bank==0?a:b;var outward=bank==0?-across:across;
                    var found=wanted;float best=float.PositiveInfinity;bool previous=false;
                    // Find the rendered terrain's actual edge. A missing ray hit is
                    // a hole, not a zero-height point suitable for joining a bank.
                    for(float s=-8;s<=20;s+=.25f){var p=wanted+outward*s;var h=RawGround(p);bool valid=float.IsFinite(h)&&h>=-.1f;if(valid&&!previous&&Mathf.Abs(s)<best){best=Mathf.Abs(s);found=p;found.y=h;offsets.Add(s);}previous=valid;}
                    if(!float.IsFinite(best))found.y=Mathf.Max(0,Ground(wanted));
                    edges[bank].Add(found);outwardNormals[bank].Add(outward);
                }
                var left=edges[0][row]-outwardNormals[0][row];var right=edges[1][row]-outwardNormals[1][row];
                float waterHeight=Mathf.Min(edges[0][row].y,edges[1][row].y)-.35f;
                for(int col=0;col<7;col++){var p=Vector3.Lerp(left,right,col/6f);p.y=waterHeight;waterVertices[row*7+col]=p;}
            }
            waterWorld.vertices=waterVertices;waterWorld.RecalculateNormals();waterWorld.RecalculateBounds();
            Make(root.transform,"Clear shallow river surface",UnityEngine.Object.Instantiate(waterWorld),flow.GetComponent<Renderer>().sharedMaterial,4,false);flow.gameObject.SetActive(false);
            var bedMaterial=Material("Visible sand and pebbles",new Color(.78f,.84f,.87f));
            var bed=UnityEngine.Object.Instantiate(waterWorld);bed.vertices=bed.vertices.Select(p=>p-Vector3.up*.85f).ToArray();bed.RecalculateBounds();
            all.First(f=>f.name=="river-new-bed").gameObject.SetActive(false);Make(root.transform,"Clear river bed",bed,bedMaterial,8,false);
            // One continuous basin also backs the old terrain's open cut edges.
            // It sits below the visible bed and never enters the walkable layer.
            var basin=UnityEngine.Object.Instantiate(waterWorld);var basinVertices=basin.vertices;
            for(int row=0;row<basinVertices.Length/7;row++){var a=waterVertices[row*7];var b=waterVertices[row*7+6];var across=Vector3.ProjectOnPlane(b-a,Vector3.up).normalized;for(int col=0;col<7;col++){var p=Vector3.Lerp(a-across*8,b+across*8,col/6f);p.y=waterVertices[row*7].y-.9f;basinVertices[row*7+col]=p;}}
            basin.vertices=basinVertices;basin.RecalculateNormals();basin.RecalculateBounds();Make(root.transform,"Continuous river basin under terrain seams",basin,bedMaterial,8,false);
            int bankIndex=0;foreach(var shore in all.Where(f=>f.name=="river-village-shore"||f.name=="river-outer-shore").OrderBy(f=>f.name=="river-village-shore"?0:1))
            {
                var sv=new List<Vector3>();var st=new List<int>();
                for(int row=0;row<edges[bankIndex].Count;row++)
                {
                    var edge=edges[bankIndex][row];var outward=outwardNormals[bankIndex][row];float waterHeight=waterVertices[row*7].y;
                    var distances=new[]{4f,1f,.15f,-.5f,-1f,-2f};
                    for(int col=0;col<distances.Length;col++){var p=edge+outward*distances[col];p.y=col<2?Mathf.Max(edge.y-.05f,Ground(p))-.025f:col==2?edge.y-.025f:col==3?Mathf.Lerp(edge.y,waterHeight,.55f):col==4?waterHeight-.025f:waterHeight-.85f;sv.Add(p);}if(row>0)for(int col=0;col<5;col++)Quad(st,sv,(row-1)*6+col,(row-1)*6+col+1,row*6+col,row*6+col+1);
                }
                var slope=Mesh(sv,st);var clipped=StaticMeshClip.SubtractAbovePolygon(slope,outline,-15);UnityEngine.Object.DestroyImmediate(slope);shore.gameObject.SetActive(false);
                Make(root.transform,shore.name+" natural slope",NewWorldSourceModules.Compact(clipped),ground,8,true);UnityEngine.Object.DestroyImmediate(clipped);
                bankIndex++;
            }
            var patch=all.FirstOrDefault(f=>f.name=="Bridge local river continuity");if(patch)patch.gameObject.SetActive(false);
            UnityEngine.Object.DestroyImmediate(waterWorld);
            var water=flow.GetComponent<Renderer>().sharedMaterial;water.SetColor("_BaseColor",new Color(.39f,.76f,.91f,.25f));water.renderQueue=3000;EditorUtility.SetDirty(water);
            Physics.SyncTransforms();RefreshAuthority(runtime,scene);
            AssetDatabase.SaveAssets();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);
            var source=scene.GetRootGameObjects().SelectMany(g=>g.GetComponentsInChildren<Camera>()).First(c=>c.CompareTag("MainCamera"));
            BridgeRiverAudit.Capture(source,(inside+outside)*.5f+side*18+Vector3.up*24,(inside+outside)*.5f,"bridge-after.png");
            BridgeRiverAudit.Capture(source,(inside+outside)*.5f+Vector3.up*32,(inside+outside)*.5f,"bridge-top-after.png");
            File.Delete(Path.Combine(BridgeRiverAudit.Output,"repair-failure.txt"));
            File.WriteAllText(Path.Combine(BridgeRiverAudit.Output,"repair.json"),new JObject{["sceneSaved"]=true,["sourceBridgeTranslation"]=new JArray(shift.x,shift.y,shift.z),["sourceBridgeYawCorrection"]=rotation,["visualHalfWidth"]=visualHalfWidth,["terrainMeshesCleared"]=cut,["waterAlpha"]=.25f,["terrainEdgeOffsets"]=JArray.FromObject(offsets),["authorityRefreshed"]=true}.ToString());
        }
        static void RefreshAuthority(string file,Scene scene)
        {
            var data=JObject.Parse(File.ReadAllText(file));int width=(int)data["width"],height=(int)data["height"];float step=(float)data["step"],minX=(float)data["minX"],minY=(float)data["minY"];var heights=(JArray)data["heights"];var walk=(JArray)data["walkable"];
            for(int y=0;y<height;y++)for(int x=0;x<width;x++){var p=new Vector3(50-(minX+x*step),0,minY+y*step-50);if(p.x< -46||p.x> -13||p.z< -83||p.z> -49)continue;int i=y*width+x;walk[i]=0;if(!Physics.Raycast(p+Vector3.up*60,Vector3.down,out var h,120,1<<9)||h.collider.gameObject.scene!=scene)continue;heights[i]=Math.Round(h.point.y,3);if(h.normal.y>=.65f&&!Physics.CheckCapsule(h.point+Vector3.up*.36f,h.point+Vector3.up*1.5f,.28f,1<<8))walk[i]=1;}
            data["exportedUtc"]=DateTime.UtcNow.ToString("O");File.WriteAllText(file,data.ToString(Newtonsoft.Json.Formatting.None));
        }
    }
}
