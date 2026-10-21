using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CampMind.Editor
{
    public static class ReferenceSampleBuilder
    {
        public const string Folder="Assets/CampMind/ReferenceSample";
        public const string ScenePath="Assets/CampMind/Scenes/ReferenceSample.unity";
        private const string Existing="Assets/CampMind/Content";
        private static Transform root;
        private static int derivative;
        [MenuItem("CampMind/Reference sample/Build scene")]
        public static void BuildScene()
        {
            Directory.CreateDirectory(Folder+"/Derived");AssetDatabase.Refresh();derivative=0;
            var oldScene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            root=new GameObject("Reference art sample — isolated presentation").transform;
            var ground=Terrain();River();
            var manor=Fit("Lord residence",Folder+"/Models/manor.glb",new Vector3(28,13,22),new Vector3(0,3,12),-90,true);
            var dwelling=Fit("Dwelling",Folder+"/Models/dwelling.glb",new Vector3(14,8,13),new Vector3(-18,3,-8),-90,true);
            Fit("Dwelling east",Folder+"/Models/dwelling.glb",new Vector3(13,7.6f,12),new Vector3(21,3,-9),-90,true);
            Fit("Dwelling west rear",Folder+"/Models/dwelling.glb",new Vector3(12,7.1f,11),new Vector3(-23,3,19),-90,true);
            Fit("Dwelling rear",Folder+"/Models/dwelling.glb",new Vector3(11,7,10),new Vector3(23,3,28),-90,true);
            var tower=Fit("Watchtower",Folder+"/Models/watchtower.glb",new Vector3(8,21,8),new Vector3(30,3,13),-90,true);
            var gate=Fit("Gate",Folder+"/Models/gate.glb",new Vector3(23,10,4.5f),new Vector3(12,3,-40),-90,false);
            Fit("Gate roof left",Folder+"/Models/watchtower.glb",new Vector3(8,3,6),new Vector3(5,12.5f,-40),-90,false);
            Fit("Gate roof right",Folder+"/Models/watchtower.glb",new Vector3(8,3,6),new Vector3(19,12.5f,-40),-90,false);
            // Clip an exact central passage in a derivative, preserving paid GLB and materials.
            ClipGate(gate,new Bounds(new Vector3(0,3.1f,0),new Vector3(5.8f,6.3f,20)));
            var view=root.gameObject.AddComponent<ReferenceSampleView>();view.subjects=new[]{manor.transform,dwelling.transform,gate.transform,tower.transform};
            CreateGateLeaves(view);Palisade();Scenery();Bridge();
            var actor=Fit("Existing lord",Existing+"/Models/lord.glb",new Vector3(0,1.85f,0),new Vector3(12,3.1f,-52),90,false);
            var motor=actor.AddComponent<CharacterController>();motor.height=1.85f;motor.radius=.28f;motor.center=new Vector3(0,.94f,0);motor.stepOffset=.32f;motor.slopeLimit=45;motor.skinWidth=.035f;
            var animator=actor.GetComponentInChildren<Animator>();if(!animator)throw new InvalidOperationException("Existing lord requires a real rig");
            animator.applyRootMotion=false;animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
            var clips=AssetDatabase.LoadAllAssetsAtPath(Existing+"/Models/lord.glb").OfType<AnimationClip>().Where(c=>c.name=="Idle"||c.name=="Walk").ToArray();
            if(clips.Length!=2)throw new InvalidOperationException("Existing Idle/Walk missing");
            var controllerPath=Folder+"/Lord.controller";var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if(!controller){controller=AnimatorController.CreateAnimatorControllerAtPath(controllerPath);foreach(var c in clips){var state=controller.layers[0].stateMachine.AddState(c.name);state.motion=c;if(c.name=="Idle")controller.layers[0].stateMachine.defaultState=state;}}
            animator.runtimeAnimatorController=controller;view.actor=actor.transform;
            var camera=new GameObject("Reference camera").AddComponent<Camera>();camera.transform.SetParent(root);camera.tag="MainCamera";camera.nearClipPlane=.1f;camera.farClipPlane=1800;camera.backgroundColor=new Color(.72f,.8f,.83f);camera.clearFlags=CameraClearFlags.Skybox;camera.allowHDR=true;camera.gameObject.AddComponent<AudioListener>();camera.gameObject.AddComponent<UniversalAdditionalCameraData>();view.viewCamera=camera;
            var sunlight=new GameObject("Morning sun").AddComponent<Light>();sunlight.transform.SetParent(root);sunlight.type=LightType.Directional;sunlight.transform.rotation=Quaternion.Euler(24,-55,0);sunlight.color=new Color(1,.82f,.58f);sunlight.intensity=1.6f;sunlight.shadows=LightShadows.Soft;sunlight.shadowBias=.035f;sunlight.gameObject.AddComponent<UniversalAdditionalLightData>();RenderSettings.sun=sunlight;
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.43f,.5f,.58f);RenderSettings.ambientEquatorColor=new Color(.32f,.35f,.32f);RenderSettings.ambientGroundColor=new Color(.2f,.17f,.13f);
            RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogColor=new Color(.73f,.78f,.75f);RenderSettings.fogStartDistance=170;RenderSettings.fogEndDistance=850;
            var sky=Mat("Sky",Color.white,"CampMind/Reference Sample Sky");sky.SetColor("_Top",new Color(.3f,.48f,.65f));sky.SetColor("_Horizon",new Color(.84f,.77f,.64f));RenderSettings.skybox=sky;
            Physics.SyncTransforms();view.SetShot(0);AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(oldScene,ScenePath);
            Directory.CreateDirectory("../Artifacts/reference-sample");File.WriteAllText("../Artifacts/reference-sample/scene.json",new JObject{["scene"]=ScenePath,["sourceAssets"]=4,["characterSource"]=Existing+"/Models/lord.glb",["authorityConnected"]=false,["visualAccepted"]=false}.ToString());
        }
        private static GameObject Fit(string name,string path,Vector3 requested,Vector3 position,float yaw,bool collision)
        {
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(!source)throw new FileNotFoundException("Model not imported",path);
            var owner=new GameObject(name);owner.transform.SetParent(root,false);var fit=new GameObject("Fit").transform;fit.SetParent(owner.transform,false);
            var model=UnityEngine.Object.Instantiate(source,fit);
            if(name=="Gate")ExtractGateSource(model);
            if(name.StartsWith("Gate roof"))ExtractTowerRoof(model,name);
            model.transform.localRotation=Quaternion.Euler(0,yaw,0);
            var rs=model.GetComponentsInChildren<Renderer>();if(rs.Length==0)throw new InvalidOperationException("Empty model "+path);
            var b=rs[0].bounds;foreach(var r in rs){b.Encapsulate(r.bounds);foreach(var m in r.sharedMaterials)if(m)m.enableInstancing=true;}
            var sy=requested.y/b.size.y;var scale=new Vector3(requested.x>0?requested.x/b.size.x:sy,sy,requested.z>0?requested.z/b.size.z:sy);
            fit.localScale=scale;fit.localPosition=new Vector3(-b.center.x*scale.x,-b.min.y*scale.y,-b.center.z*scale.z);owner.transform.position=position;
            if(collision)foreach(var f in owner.GetComponentsInChildren<MeshFilter>()){f.gameObject.layer=8;f.gameObject.AddComponent<MeshCollider>().sharedMesh=f.sharedMesh;}
            return owner;
        }
        private static void ExtractGateSource(GameObject source)
        {
            // Crop normalized source coordinates: remove background buildings/tower
            // and most of the generated foreground slab before fitting the gate.
            var keep=new Bounds(new Vector3(.025f,-.085f,.01f),new Vector3(.31f,.27f,.68f));
            var cuts=new List<Bounds>();
            for(var axis=0;axis<3;axis++)foreach(var side in new[]{-1,1}){var center=Vector3.zero;var size=Vector3.one*20;center[axis]=side<0?keep.min[axis]-5:keep.max[axis]+5;size[axis]=10;cuts.Add(new Bounds(center,size));}
            var index=0;
            foreach(var f in source.GetComponentsInChildren<MeshFilter>()){
                var raw=StaticMeshClip.Subtract(f.sharedMesh,cuts);var clipped=Compact(raw);UnityEngine.Object.DestroyImmediate(raw);var file=Folder+"/Derived/gate-source-cropped-"+(index++)+".asset";Save(clipped,file);f.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(file);
            }
        }
        private static void ExtractTowerRoof(GameObject source,string name)
        {
            var index=0;
            foreach(var f in source.GetComponentsInChildren<MeshFilter>()){
                var bounds=f.sharedMesh.bounds;var min=bounds.min.y+bounds.size.y*.78f;var cut=new Bounds(new Vector3(0,min-5,0),new Vector3(20,10,20));
                var raw=StaticMeshClip.Subtract(f.sharedMesh,new[]{cut});var mesh=Compact(raw);UnityEngine.Object.DestroyImmediate(raw);var file=Folder+"/Derived/"+name.Replace(' ','-')+"-"+(index++)+".asset";Save(mesh,file);f.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(file);
            }
        }
        private static void ClipGate(GameObject gate,Bounds cut)
        {
            foreach(var f in gate.GetComponentsInChildren<MeshFilter>()) {
                var mesh=UnityEngine.Object.Instantiate(f.sharedMesh);var matrix=gate.transform.worldToLocalMatrix*f.transform.localToWorldMatrix;
                mesh.vertices=mesh.vertices.Select(p=>matrix.MultiplyPoint3x4(p)).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();
                var raw=StaticMeshClip.Subtract(mesh,new[]{cut});var clipped=Compact(raw);UnityEngine.Object.DestroyImmediate(raw);UnityEngine.Object.DestroyImmediate(mesh);var path=Folder+"/Derived/gate-"+(derivative++)+".asset";Save(clipped,path);
                f.transform.SetParent(gate.transform,false);f.transform.localPosition=Vector3.zero;f.transform.localRotation=Quaternion.identity;f.transform.localScale=Vector3.one;f.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);f.gameObject.layer=8;f.gameObject.AddComponent<MeshCollider>().sharedMesh=f.sharedMesh;
            }
        }
        private static Mesh Compact(Mesh source)
        {
            var used=Enumerable.Range(0,source.subMeshCount).SelectMany(s=>source.GetTriangles(s)).Distinct().ToArray();var map=used.Select((v,i)=>(v,i)).ToDictionary(p=>p.v,p=>p.i);
            var mesh=new Mesh{name=source.name+" compact",indexFormat=IndexFormat.UInt32};var vertices=source.vertices;mesh.vertices=used.Select(i=>vertices[i]).ToArray();
            if(source.normals.Length==source.vertexCount){var a=source.normals;mesh.normals=used.Select(i=>a[i]).ToArray();}
            if(source.tangents.Length==source.vertexCount){var a=source.tangents;mesh.tangents=used.Select(i=>a[i]).ToArray();}
            if(source.uv.Length==source.vertexCount){var a=source.uv;mesh.uv=used.Select(i=>a[i]).ToArray();}
            if(source.uv2.Length==source.vertexCount){var a=source.uv2;mesh.uv2=used.Select(i=>a[i]).ToArray();}
            if(source.colors.Length==source.vertexCount){var a=source.colors;mesh.colors=used.Select(i=>a[i]).ToArray();}
            mesh.subMeshCount=source.subMeshCount;for(var s=0;s<source.subMeshCount;s++)mesh.SetTriangles(source.GetTriangles(s).Select(i=>map[i]).ToArray(),s);mesh.RecalculateBounds();return mesh;
        }
        private static void CreateGateLeaves(ReferenceSampleView view)
        {
            var wood=Mat("Gate timber",new Color(.65f,.46f,.29f));var textureFile=Folder+"/GateWood.asset";var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(textureFile);
            if(!texture){texture=new Texture2D(128,256,TextureFormat.RGBA32,true);texture.name="Procedural weathered timber";var pixels=new Color[128*256];for(var y=0;y<256;y++)for(var x=0;x<128;x++){var grain=Mathf.PerlinNoise(x*.14f,y*.012f);var fine=Mathf.PerlinNoise(x*.65f,y*.035f);var t=Mathf.Clamp01(grain*.8f+fine*.2f);pixels[y*128+x]=Color.Lerp(new Color(.18f,.11f,.065f),new Color(.54f,.38f,.22f),t);}texture.SetPixels(pixels);texture.Apply(true);AssetDatabase.CreateAsset(texture,textureFile);}
            wood.SetTexture("_BaseMap",texture);var iron=Mat("Gate iron",new Color(.12f,.115f,.10f));iron.SetFloat("_Metallic",.55f);
            for(var side=-1;side<=1;side+=2){var pivot=new GameObject(side<0?"Left gate leaf":"Right gate leaf").transform;pivot.SetParent(root);pivot.position=new Vector3(12+side*2.9f,3,-40);if(side<0)view.gateLeft=pivot;else view.gateRight=pivot;
                for(var i=0;i<9;i++)Box("Textured gate plank",new Vector3(-side*(i+.5f)*2.9f/9,2.8f,0),new Vector3(.31f,5.6f,.26f),wood,pivot,false,true);
                foreach(var y in new[]{.9f,2.9f,4.9f}){
                    Box("Iron strap",new Vector3(-side*1.45f,y,-.16f),new Vector3(2.8f,.13f,.07f),iron,pivot,false,true);
                    for(var i=0;i<6;i++)Box("Iron rivet",new Vector3(-side*(i+.5f)*2.9f/6,y,-.205f),Vector3.one*.085f,iron,pivot,false,true);
                }
            }
            var c=new GameObject("Closed gate collision");c.transform.SetParent(root);c.transform.position=new Vector3(12,5.8f,-40);c.layer=8;view.closedGate=c.AddComponent<BoxCollider>();view.closedGate.size=new Vector3(5.8f,5.6f,.4f);
        }
        private static void Palisade()
        {
            var points=new[]{new Vector2(-40,-37),new Vector2(-40,30),new Vector2(-22,46),new Vector2(29,46),new Vector2(45,28),new Vector2(45,-29),new Vector2(23.5f,-40)};
            var leftEnd=new Vector2(.5f,-40);var segments=new List<(Vector2,Vector2)>();for(var i=1;i<points.Length;i++)segments.Add((points[i-1],points[i]));segments.Add((points[0],leftEnd));
            var index=0;
            foreach(var seg in segments){var delta=seg.Item2-seg.Item1;var length=delta.magnitude;var n=Mathf.CeilToInt(length/6);for(var i=0;i<n;i++){
                    var p=Vector2.Lerp(seg.Item1,seg.Item2,(i+.5f)/n);var wall=Fit("Palisade module "+index++,Existing+"/Models/valley/palisade.glb",new Vector3(length/n+.35f,6,1.25f),new Vector3(p.x,3,p.y),-90,true);wall.transform.rotation=Quaternion.Euler(0,Mathf.Atan2(-delta.y,delta.x)*Mathf.Rad2Deg,0);}
            }
        }
        private static GameObject Terrain()
        {
            const int n=320;const float step=3;var vertices=new Vector3[(n+1)*(n+1)];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var indices=new int[n*n*6];
            for(var z=0;z<=n;z++)for(var x=0;x<=n;x++){var i=z*(n+1)+x;var px=(x-n/2)*step;var pz=(z-n/2)*step;var height=ReferenceSampleGround.Height(px,pz);vertices[i]=new Vector3(px,height,pz);uv[i]=new Vector2(px/10,pz/10);
                var noise=Mathf.PerlinNoise(px*.11f+32,pz*.11f+19);var c=Color.Lerp(new Color(.24f,.31f,.15f),new Color(.48f,.43f,.28f),noise);
                var plaza=1-Mathf.SmoothStep(.45f,1.1f,px*px/(38*38)+(pz-4)*(pz-4)/(33*33));var path=Mathf.Abs(px-12)<3&&pz< -20&&pz> -90;
                c=Color.Lerp(c,Color.Lerp(new Color(.43f,.34f,.22f),new Color(.59f,.49f,.32f),noise),path?1:plaza*.8f);if(height<2)c=Color.Lerp(c,new Color(.3f,.32f,.28f),.6f);colors[i]=c;
            }
            var k=0;for(var z=0;z<n;z++)for(var x=0;x<n;x++){var a=z*(n+1)+x;indices[k++]=a;indices[k++]=a+n+1;indices[k++]=a+1;indices[k++]=a+1;indices[k++]=a+n+1;indices[k++]=a+n+2;}
            var mesh=new Mesh{name="Reference riverbank terrain",indexFormat=IndexFormat.UInt32};mesh.vertices=vertices;mesh.colors=colors;mesh.uv=uv;mesh.triangles=indices;mesh.RecalculateNormals();mesh.RecalculateBounds();Save(mesh,Folder+"/Ground.asset");
            var go=new GameObject("Sample ground");go.transform.SetParent(root);go.layer=9;go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Folder+"/Ground.asset");go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            var mat=Mat("Ground",Color.white,"CampMind/Reference Sample Ground");var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(Folder+"/bedrock.png");if(texture)mat.SetTexture("_BaseMap",texture);go.AddComponent<MeshRenderer>().sharedMaterial=mat;return go;
        }
        private static void River()
        {
            const int n=180;var vertices=new Vector3[(n+1)*2];var uv=new Vector2[vertices.Length];var triangles=new int[n*6];
            for(var i=0;i<=n;i++){var z=-220+i*440f/n;var x=ReferenceSampleGround.RiverX(z);vertices[i*2]=new Vector3(x-14,0,z);vertices[i*2+1]=new Vector3(x+14,0,z);uv[i*2]=new Vector2(0,i);uv[i*2+1]=new Vector2(1,i);if(i<n){var k=i*6;var a=i*2;triangles[k]=a;triangles[k+1]=a+2;triangles[k+2]=a+1;triangles[k+3]=a+1;triangles[k+4]=a+2;triangles[k+5]=a+3;}}
            var mesh=new Mesh{name="Curving sample river"};mesh.vertices=vertices;mesh.uv=uv;mesh.triangles=triangles;mesh.RecalculateNormals();mesh.RecalculateBounds();Save(mesh,Folder+"/River.asset");var go=new GameObject("Flowing river");go.transform.SetParent(root);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Folder+"/River.asset");go.AddComponent<MeshRenderer>().sharedMaterial=Mat("River",new Color(.12f,.31f,.33f),"CampMind/Reference Sample Water");
        }
        private static void Scenery()
        {
            var random=new System.Random(29);float Range(float a,float b)=>a+(float)random.NextDouble()*(b-a);
            var existing=Existing+"/Models/valley/";
            for(var i=0;i<520;i++){var x=Range(-155,155);var z=Range(-120,170);if(x> -44&&x<49&&z> -47&&z<53)continue;if(x> -5&&x<58&&z< -40&&z> -85)continue;if(ReferenceSampleGround.IsRiver(x,z)||Mathf.Abs(x-ReferenceSampleGround.RiverX(z))<20||Mathf.Abs(x+35)<4&&z< -20||Mathf.Abs(x-12)<5&&z< -40)continue;var h=Range(7,18);Fit("Pine "+i,existing+"pine.glb",new Vector3(0,h,0),new Vector3(x,ReferenceSampleGround.Height(x,z),z),Range(0,360),false);}
            for(var i=0;i<85;i++){var z=Range(-115,150);var x=ReferenceSampleGround.RiverX(z)+Range(-17,17);var h=Range(1.5f,6);Fit("River rock "+i,existing+"rock.glb",new Vector3(h*Range(.7f,1.8f),h,h*Range(.8f,1.6f)),new Vector3(x,ReferenceSampleGround.Height(x,z)-.25f,z),Range(0,360),true);}
            var mountains=new[]{new Vector3(-155,0,120),new Vector3(120,0,155),new Vector3(-10,0,245),new Vector3(-255,0,285),new Vector3(240,0,340),new Vector3(390,0,460),new Vector3(-410,0,510)};
            for(var i=0;i<mountains.Length;i++)Mountain(i,mountains[i],Range(70,120),Range(80,120));
            for(var i=0;i<80;i++){var x=Range(-110,100);var z=Range(-100,90);if(x> -39&&x<44&&z> -44&&z<45||ReferenceSampleGround.IsRiver(x,z)||Mathf.Abs(x+35)<4&&z< -20||Mathf.Abs(x-12)<5&&z< -40)continue;Fit("Ground bush "+i,existing+"bush.glb",new Vector3(0,Range(.6f,1.7f),0),new Vector3(x,ReferenceSampleGround.Height(x,z),z),Range(0,360),false);}
        }
        private static void Mountain(int seed,Vector3 position,float height,float radius)
        {
            const int n=100;var v=new Vector3[(n+1)*(n+1)];var colors=new Color[v.Length];var indices=new int[n*n*6];
            for(var z=0;z<=n;z++)for(var x=0;x<=n;x++){
                var px=(x/(float)n*2-1)*radius;var pz=(z/(float)n*2-1)*radius*.8f;var envelope=Mathf.Pow(Mathf.Max(0,1-(px*px/(radius*radius)+pz*pz/(radius*radius*.64f))),1.3f);
                var ridge=1-Mathf.Abs(Mathf.PerlinNoise(px*.018f+seed*19+70,pz*.018f+seed*7+30)*2-1);
                var erosion=Mathf.PerlinNoise(px*.085f+seed*13+51,pz*.085f+seed*5+97);
                var h=height*envelope*(.45f+.48f*ridge+.12f*erosion);var i=z*(n+1)+x;v[i]=new Vector3(px,h,pz);
                colors[i]=Color.Lerp(new Color(.18f,.23f,.23f),new Color(.35f,.38f,.38f),Mathf.Clamp01(h/height*.9f+erosion*.4f));
            }
            var k=0;for(var z=0;z<n;z++)for(var x=0;x<n;x++){var a=z*(n+1)+x;indices[k++]=a;indices[k++]=a+n+1;indices[k++]=a+1;indices[k++]=a+1;indices[k++]=a+n+1;indices[k++]=a+n+2;}
            var mesh=new Mesh{name="Authored sample ridge "+seed,indexFormat=IndexFormat.UInt32};mesh.vertices=v;mesh.colors=colors;mesh.triangles=indices;mesh.RecalculateNormals();mesh.RecalculateBounds();var file=Folder+"/Derived/ridge-"+seed+".asset";Save(mesh,file);
            var go=new GameObject("Authored sample ridge "+seed);go.transform.SetParent(root);go.transform.position=position;go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(file);go.AddComponent<MeshRenderer>().sharedMaterial=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/Ground.mat");
        }
        private static void Bridge()
        {
            var wood=Mat("Bridge wood",new Color(.3f,.21f,.12f));var z=58f;var x=ReferenceSampleGround.RiverX(z);
            for(var i=0;i<45;i++)Box("Bridge plank",new Vector3(x-18+i*.8f,3.2f,z),new Vector3(.76f,.22f,3.4f),wood,root,true);
            for(var i=0;i<10;i++)foreach(var side in new[]{-1,1}){var p=new Vector3(x-18+i*4,2.8f,z+side*1.6f);Box("Bridge post",p,new Vector3(.22f,3.2f,.22f),wood,root,true);}
            foreach(var side in new[]{-1,1})Beam(new Vector3(x-18,4.1f,z+side*1.6f),new Vector3(x+18,4.1f,z+side*1.6f),.15f,wood);
        }
        private static void Beam(Vector3 a,Vector3 b,float width,Material material){var go=Box("Timber rail",(a+b)/2,new Vector3(width,width,Vector3.Distance(a,b)),material,root,false);go.transform.rotation=Quaternion.LookRotation(b-a);}
        private static GameObject Box(string name,Vector3 p,Vector3 size,Material mat,Transform parent,bool collision,bool local=false){var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(parent,false);if(local)go.transform.localPosition=p;else go.transform.position=p;go.transform.localScale=size;go.GetComponent<Renderer>().sharedMaterial=mat;if(!collision)UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());else go.layer=9;return go;}
        private static Mesh MeshCone(float radius,float height,int count){var v=new List<Vector3>{Vector3.up*height};for(var i=0;i<count;i++){var a=i*Mathf.PI*2/count;v.Add(new Vector3(Mathf.Cos(a)*radius,0,Mathf.Sin(a)*radius));}var t=new List<int>();for(var i=0;i<count;i++){t.Add(0);t.Add(i+1);t.Add((i+1)%count+1);}var m=new Mesh();m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();return m;}
        private static Material Mat(string name,Color color,string shader="Universal Render Pipeline/Lit"){var path=Folder+"/"+name+".mat";var s=Shader.Find(shader);if(!s)throw new InvalidOperationException("Shader missing: "+shader);var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(s);AssetDatabase.CreateAsset(m,path);}else m.shader=s;if(m.HasProperty("_BaseColor"))m.SetColor("_BaseColor",color);if(m.HasProperty("_Smoothness"))m.SetFloat("_Smoothness",.15f);return m;}
        private static void Save(UnityEngine.Object value,string path){var old=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);if(old){EditorUtility.CopySerialized(value,old);UnityEngine.Object.DestroyImmediate(value);}else AssetDatabase.CreateAsset(value,path);}
        public static void BuildPlayer()
        {
            BuildScene();var repo=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));var dir=Path.Combine(repo,"native/Builds/ReferenceSample");Directory.CreateDirectory(dir);
            var oldBackend=PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone);var oldScenes=EditorBuildSettings.scenes;
            try{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,ScriptingImplementation.Mono2x);var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=Path.Combine(dir,"CampMindSample.exe"),target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Reference sample build failed");}
            finally{PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone,oldBackend);EditorBuildSettings.scenes=oldScenes;AssetDatabase.SaveAssets();}
        }
    }
}
