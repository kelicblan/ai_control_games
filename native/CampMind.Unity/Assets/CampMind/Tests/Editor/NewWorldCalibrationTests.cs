using System;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using CampMind.Editor;

namespace CampMind.Tests
{
    public class NewWorldCalibrationTests
    {
        [Test] public void SceneryLightingInitializesWhenOpenedOutsidePlayMode()
        {
            var type=typeof(CampMind.Presentation.NewWorldAtmosphereRuntime);Assert.That(Attribute.IsDefined(type,typeof(ExecuteAlways)),Is.True);
            var previousAmbient=RenderSettings.ambientLight;var previousSun=RenderSettings.sun;var previousStrength=Shader.GetGlobalFloat("_NewWorldDaylight");var previousSky=Shader.GetGlobalVector("_NewWorldSkyColor");var go=new GameObject("Edit-mode scenery lighting test");var lightObject=new GameObject("Edit-mode diagnostic sun");
            try{var camera=go.AddComponent<Camera>();camera.backgroundColor=new Color(.78f,.84f,.84f);var sun=lightObject.AddComponent<Light>();sun.type=LightType.Directional;sun.intensity=1.05f;RenderSettings.sun=sun;RenderSettings.ambientLight=new Color(.57f,.62f,.61f);Shader.SetGlobalFloat("_NewWorldDaylight",0);Shader.SetGlobalVector("_NewWorldSkyColor",Vector4.zero);go.AddComponent<CampMind.Presentation.NewWorldAtmosphereRuntime>();Assert.That(Shader.GetGlobalFloat("_NewWorldDaylight"),Is.GreaterThan(.9f));var sky=Shader.GetGlobalVector("_NewWorldSkyColor");Assert.That(sky.x,Is.EqualTo(camera.backgroundColor.linear.r).Within(.0001f));Assert.That(sky.y,Is.GreaterThan(.5f));}
            finally{UnityEngine.Object.DestroyImmediate(go);UnityEngine.Object.DestroyImmediate(lightObject);RenderSettings.ambientLight=previousAmbient;RenderSettings.sun=previousSun;Shader.SetGlobalFloat("_NewWorldDaylight",previousStrength);Shader.SetGlobalVector("_NewWorldSkyColor",previousSky);}
        }
        [Test] public void PolygonCourtCutPreservesConcaveNotchAndInterpolatedUV()
        {
            var source=new Mesh();source.vertices=new[]{new Vector3(-3,2,-3),new Vector3(3,2,-3),new Vector3(3,2,3),new Vector3(-3,2,3)};source.uv=source.vertices.Select(v=>new Vector2(v.x,v.z)).ToArray();source.triangles=new[]{0,2,1,0,3,2};var outline=new[]{new Vector3(-2,0,-2),new Vector3(2,0,-2),new Vector3(2,0,2),new Vector3(0,0,2),new Vector3(0,0,0),new Vector3(-2,0,0)};
            try{var result=StaticMeshClip.SubtractAbovePolygon(source,outline,1);try{float area=0;var vertices=result.vertices;var uv=result.uv;var triangles=result.triangles;for(int i=0;i<triangles.Length;i+=3)area+=Vector3.Cross(vertices[triangles[i+1]]-vertices[triangles[i]],vertices[triangles[i+2]]-vertices[triangles[i]]).magnitude*.5f;Assert.That(area,Is.EqualTo(24).Within(.001f));for(int i=0;i<vertices.Length;i++)Assert.That(Vector2.Distance(uv[i],new Vector2(vertices[i].x,vertices[i].z)),Is.LessThan(.001f));Assert.That(source.vertexCount,Is.EqualTo(4));}finally{UnityEngine.Object.DestroyImmediate(result);}}finally{UnityEngine.Object.DestroyImmediate(source);}
        }
        [Test] public void ShoreJoinsActualLandAndWaterOnObservedBankRays()
        {
            var go=new GameObject("Shore join test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(28,0,0);c.transform.position=-c.transform.forward*264;var bank=new[]{new Vector2(200,400),new Vector2(300,600),new Vector2(500,750)};
            try{var mesh=NewWorldRiverBuilder.CreateShoreMesh(c,bank,t=>-1-t*3,2);try{for(int i=0;i<bank.Length;i++){Assert.That(Vector3.Distance(mesh.vertices[i*3],NewWorldCalibrationBuilder.Unproject(c,bank[i],0)),Is.LessThan(.001f));Assert.That(Vector2.Distance(NewWorldCalibrationBuilder.Project(c,mesh.vertices[i*3+1]),bank[i]),Is.LessThan(.01f));Assert.That(mesh.vertices[i*3+2].y,Is.EqualTo(mesh.vertices[i*3+1].y-2).Within(.001f));}}finally{UnityEngine.Object.DestroyImmediate(mesh);}}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void HallCourtPaintDoesNotCollapseSourceRockHeightIntoVerticalSkirts()
        {
            var go=new GameObject("Hall court height test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(28,0,0);c.transform.position=-c.transform.forward*264;
            try{var layout=Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(System.IO.Path.GetFullPath(System.IO.Path.Combine(Application.dataPath,"../../../docs/new-world/layout.json"))));var constraints=new NewWorldGroundConstraints(c,layout);var onCourt=NewWorldCalibrationBuilder.Unproject(c,new Vector2(1000,282),10);onCourt.y=11;Assert.That(constraints.Shape(onCourt),Is.EqualTo(onCourt),"Court elevation must come from continuous source registration, not collapsing an entire source column");var inStairNotch=NewWorldCalibrationBuilder.Unproject(c,new Vector2(950,310),10);Assert.That(constraints.Shape(inStairNotch),Is.EqualTo(inStairNotch));var hall=onCourt+Vector3.up*20;Assert.That(constraints.Shape(hall),Is.EqualTo(hall));}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void LocalRockExtractionKeepsWholeConnectedBodyAcrossUVSeams()
        {
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);var source=new Mesh();source.CombineMeshes(new[]{new CombineInstance{mesh=cube.GetComponent<MeshFilter>().sharedMesh,transform=Matrix4x4.Translate(Vector3.left*3)},new CombineInstance{mesh=cube.GetComponent<MeshFilter>().sharedMesh,transform=Matrix4x4.Translate(Vector3.right*3)}});var original=source.vertices;
            try{var part=NewWorldSourceModules.KeepComponentNearest(source,Vector3.left*3);try{Assert.That(part.bounds.center.x,Is.EqualTo(-3).Within(.001f));Assert.That(part.bounds.size,Is.EqualTo(Vector3.one));Assert.That(part.triangles.Length,Is.EqualTo(36));Assert.That(part.uv.Length,Is.EqualTo(part.vertexCount));Assert.That(source.vertices,Is.EqualTo(original));}finally{UnityEngine.Object.DestroyImmediate(part);}}finally{UnityEngine.Object.DestroyImmediate(source);UnityEngine.Object.DestroyImmediate(cube);}
        }
        [Test] public void StoneGuardPostIsClosedAndFacesOutward()
        {
            var profile=new[]{new Vector2(.42f,0),new Vector2(.42f,.2f),new Vector2(.30f,.26f),new Vector2(.23f,.8f),new Vector2(.34f,.91f),new Vector2(.26f,1.1f)};var mesh=NewWorldDetailBuilder.CreateLathe(profile,16);
            try{var edges=new System.Collections.Generic.Dictionary<(int,int),int>();var tris=mesh.triangles;float volume=0;for(int i=0;i<tris.Length;i+=3){volume+=Vector3.Dot(mesh.vertices[tris[i]],Vector3.Cross(mesh.vertices[tris[i+1]],mesh.vertices[tris[i+2]]))/6;for(int e=0;e<3;e++){int a=tris[i+e],b=tris[i+(e+1)%3];var key=(Math.Min(a,b),Math.Max(a,b));edges[key]=edges.TryGetValue(key,out int count)?count+1:1;}}Assert.That(edges.Values.All(count=>count==2),Is.True);Assert.That(volume,Is.GreaterThan(.1f));Assert.That(mesh.bounds.size.y,Is.EqualTo(1.1f).Within(.001f));}finally{UnityEngine.Object.DestroyImmediate(mesh);}
        }
        [Test] public void RiverProfileChangesRealWaterElevationWithoutMovingObservedBanks()
        {
            var go=new GameObject("River profile test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(28,0,0);c.transform.position=-c.transform.forward*264;var a=new[]{new Vector2(400,250),new Vector2(250,500),new Vector2(800,900)};var b=new[]{new Vector2(350,250),new Vector2(150,500),new Vector2(650,900)};
            try{var mesh=NewWorldRiverBuilder.CreateRiverMesh(c,a,b,-1,s=>-1-s*4,new[]{.365f});try{Assert.That(mesh.vertices.Min(v=>v.y),Is.EqualTo(-5).Within(.001f));Assert.That(mesh.vertices.Max(v=>v.y),Is.EqualTo(-1).Within(.001f));foreach(var p in a.Concat(b))Assert.That(mesh.vertices.Min(v=>Vector2.Distance(NewWorldCalibrationBuilder.Project(c,v),p)),Is.LessThan(.01f));Assert.That(mesh.uv2.Any(v=>v.y>0),Is.True);}finally{UnityEngine.Object.DestroyImmediate(mesh);}}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void ObservedRoadClearancePreservesHighPlatformAndDeepRiver()
        {
            var layout=Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(System.IO.Path.GetFullPath(System.IO.Path.Combine(Application.dataPath,"../../../docs/new-world/layout.json"))));var go=new GameObject("Observed road clearance test");var camera=go.AddComponent<Camera>();camera.aspect=1672f/941;camera.fieldOfView=28;camera.transform.rotation=Quaternion.Euler(28,0,0);camera.transform.position=-camera.transform.forward*264;
            try{var constraints=new NewWorldGroundConstraints(camera,layout);var pixel=layout["roads"][0][0];var p=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)pixel[0],(float)pixel[1]),0);p.y=3;Assert.That(constraints.Shape(p).y,Is.EqualTo(0).Within(.001f));p.y=10;Assert.That(constraints.Shape(p),Is.EqualTo(p));p.y=-4;Assert.That(constraints.Shape(p),Is.EqualTo(p));}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void DetailedMassCorrectionRetainsObservedCrestAndRealDepthAndSourceUV()
        {
            var go=new GameObject("Detailed massif test");var camera=go.AddComponent<Camera>();camera.aspect=1672f/941;camera.fieldOfView=28;camera.transform.rotation=Quaternion.Euler(28,0,0);camera.transform.position=-camera.transform.forward*264;
            var source=new Mesh();source.vertices=Enumerable.Range(0,5).SelectMany(i=>new[]{NewWorldCalibrationBuilder.Unproject(camera,new Vector2(400+i*50,200),30),NewWorldCalibrationBuilder.Unproject(camera,new Vector2(400+i*50,400),0)}).ToArray();source.uv=source.vertices.Select((p,i)=>new Vector2(i/10f,0)).ToArray();source.triangles=new[]{0,1,2,1,3,2};
            try{var corrected=NewWorldDetailedMountainBuilder.CorrectMass(camera,source,Matrix4x4.identity,Rect.MinMaxRect(400,200,600,400),new[]{new Vector2(600,200),new Vector2(650,160),new Vector2(700,210)},new Vector2(600,430),new Vector2(700,440),0,30,35);
                try{for(int i=0;i<5;i++){var pixel=NewWorldCalibrationBuilder.Project(camera,corrected.vertices[i*2]);float x=600+i*25;float y=x<=650?Mathf.Lerp(200,160,(x-600)/50):Mathf.Lerp(160,210,(x-650)/50);Assert.That(Vector2.Distance(pixel,new Vector2(x,y)),Is.LessThan(.01f));}Assert.That(corrected.uv,Is.EqualTo(source.uv));Assert.That(corrected.bounds.size.y,Is.GreaterThan(34));Assert.That(corrected.bounds.size.z,Is.GreaterThan(1));Assert.That(corrected.bounds.size.z,Is.LessThan(corrected.bounds.size.x*.8f),"Observed tall spires must not become a long horizontal ceiling when seen from the ground");Assert.That(source.vertices[0].y,Is.EqualTo(30).Within(.001f));}finally{UnityEngine.Object.DestroyImmediate(corrected);}
            }finally{UnityEngine.Object.DestroyImmediate(source);UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void TerrainRegistrationMatchesControlsAndReproducesAffineGround()
        {
            var source=new[]{new Vector2(-1,-1),new Vector2(1,-1),new Vector2(1,1),new Vector2(-1,1),Vector2.zero};
            var target=source.Select(p=>new Vector3(p.x*40+3,2,p.y*30-8)).ToArray();
            var warp=new NewWorldTerrainRegistration(source,target);
            Assert.That(warp.JacobianXZ(new Vector2(.25f,-.26f)),Is.EqualTo(1200).Within(.01f));
            foreach(var p in source.Concat(new[]{new Vector2(.37f,-.26f)}))Assert.That(Vector3.Distance(warp.Map(p),new Vector3(p.x*40+3,2,p.y*30-8)),Is.LessThan(.001f));
            target[4]=new Vector3(3,12,-8);warp=new NewWorldTerrainRegistration(source,target);
            for(int i=0;i<source.Length;i++)Assert.That(Vector3.Distance(warp.Map(source[i]),target[i]),Is.LessThan(.001f));
            Assert.Throws<ArgumentException>(()=>new NewWorldTerrainRegistration(new[]{Vector2.zero,Vector2.zero,Vector2.one},new[]{Vector3.zero,Vector3.one,Vector3.up}));
        }
        [Test] public void WaterfallUsesObservedCenterlineAndRealVerticalDrop()
        {
            var go=new GameObject("Waterfall test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(28,0,0);c.transform.position=-c.transform.forward*264;
            var points=new[]{new Vector2(1115,88),new Vector2(1110,130),new Vector2(1101,182)};var heights=new[]{35f,20f,2f};
            try{var mesh=NewWorldAtmosphereBuilder.CreateWaterfall(c,points,heights,new[]{7f,9f,13f});try{Assert.That(mesh.bounds.size.y,Is.GreaterThan(32));Assert.That(mesh.uv.Length,Is.EqualTo(mesh.vertexCount));for(int i=0;i<points.Length;i++){var mid=(mesh.vertices[i*2]+mesh.vertices[i*2+1])*.5f;Assert.That(Vector2.Distance(NewWorldCalibrationBuilder.Project(c,mid),points[i]),Is.LessThan(.01f));}Assert.That(mesh.triangles.Length,Is.EqualTo(12));}finally{UnityEngine.Object.DestroyImmediate(mesh);}}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void SourceMeshCorrectionFitsObservedProjectionWithoutChangingSourceOrUV()
        {
            var go=new GameObject("Source cage test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(28,0,0);c.transform.position=-c.transform.forward*264;
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);var source=cube.GetComponent<MeshFilter>().sharedMesh;var original=source.vertices;
            try{
                var matrix=Matrix4x4.TRS(new Vector3(0,2,0),Quaternion.Euler(0,75,0),new Vector3(12,4,8));
                var projected=original.Select(p=>NewWorldCalibrationBuilder.Project(c,matrix.MultiplyPoint3x4(p))).ToArray();
                var from=Rect.MinMaxRect(projected.Min(p=>p.x),projected.Min(p=>p.y),projected.Max(p=>p.x),projected.Max(p=>p.y));var target=Rect.MinMaxRect(550,300,690,382);
                var mesh=NewWorldSourceFitBuilder.CorrectMesh(c,source,matrix,from,target,0,4,0,8);
                try{var pixels=mesh.vertices.Select(p=>NewWorldCalibrationBuilder.Project(c,p)).ToArray();Assert.That(pixels.Min(p=>p.x),Is.EqualTo(target.xMin).Within(.01f));Assert.That(pixels.Max(p=>p.x),Is.EqualTo(target.xMax).Within(.01f));Assert.That(pixels.Min(p=>p.y),Is.EqualTo(target.yMin).Within(.01f));Assert.That(pixels.Max(p=>p.y),Is.EqualTo(target.yMax).Within(.01f));Assert.That(mesh.vertices.Min(p=>p.y),Is.EqualTo(0).Within(.001f));Assert.That(mesh.vertices.Max(p=>p.y),Is.EqualTo(8).Within(.001f));Assert.That(mesh.uv,Is.EqualTo(source.uv));Assert.That(source.vertices,Is.EqualTo(original));Assert.That(mesh.triangles,Is.EqualTo(source.triangles));}
                finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(cube);UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void PlatformShellKeepsIndependentRimAndFootAndClosesTheStairNotch()
        {
            var bottom=new[]{new Vector3(-5,0,-4),new Vector3(5,0,-4),new Vector3(5,0,4),new Vector3(2,0,4),new Vector3(2,0,1),new Vector3(-2,0,1),new Vector3(-2,0,4),new Vector3(-5,0,4)};
            var top=bottom.Select(p=>new Vector3(p.x*.8f,8,p.z*.8f)).ToArray();
            var mesh=NewWorldPlatformBuilder.CreateShell(top,bottom);
            try{
                Assert.That(mesh.subMeshCount,Is.EqualTo(2));
                foreach(var p in top.Concat(bottom))Assert.That(mesh.vertices.Min(v=>Vector3.Distance(v,p)),Is.LessThan(.001f));
                var edges=new System.Collections.Generic.Dictionary<(int,int),int>();var tris=mesh.triangles;
                for(int i=0;i<tris.Length;i+=3)for(int e=0;e<3;e++){var a=tris[i+e];var b=tris[i+(e+1)%3];var k=(Math.Min(a,b),Math.Max(a,b));edges[k]=edges.TryGetValue(k,out var count)?count+1:1;}
                Assert.That(edges.Values.All(count=>count==2),Is.True,"The notch must not leave an open or double surface");
                float signedVolume=0;for(int i=0;i<tris.Length;i+=3)signedVolume+=Vector3.Dot(mesh.vertices[tris[i]],Vector3.Cross(mesh.vertices[tris[i+1]],mesh.vertices[tris[i+2]]))/6;
                Assert.That(signedVolume,Is.GreaterThan(0),"Closed collision shell must face outward");
                var cap=mesh.GetTriangles(0);float area=0;for(int i=0;i<cap.Length;i+=3)area+=Vector3.Cross(mesh.vertices[cap[i+1]]-mesh.vertices[cap[i]],mesh.vertices[cap[i+2]]-mesh.vertices[cap[i]]).magnitude*.5f;
                Assert.That(area,Is.EqualTo(68*.64f).Within(.01f),"Cap must retain the stair cutout");
            }finally{UnityEngine.Object.DestroyImmediate(mesh);}
        }
        [Test] public void SourceModuleClipPreservesOriginalAndRemovesUnusedBoundsAndKeepsUV()
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);var source=go.GetComponent<MeshFilter>().sharedMesh;var original=source.vertices;
            try{var clipped=NewWorldSourceModules.KeepBounds(source,new Bounds(new Vector3(-.25f,0,0),new Vector3(.5f,2,2)));
                try{Assert.That(clipped.bounds.min.x,Is.EqualTo(-.5f).Within(.001f));Assert.That(clipped.bounds.max.x,Is.EqualTo(0).Within(.001f));Assert.That(clipped.uv.Length,Is.EqualTo(clipped.vertexCount));Assert.That(clipped.triangles.Length,Is.GreaterThan(0));Assert.That(source.vertices,Is.EqualTo(original));Assert.That(source.bounds.size.x,Is.EqualTo(1).Within(.001f));}
                finally{UnityEngine.Object.DestroyImmediate(clipped);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void InferredReliefCannotBuryObservedRoadWallOrRiverAnchors()
        {
            var path=System.IO.Path.GetFullPath(System.IO.Path.Combine(Application.dataPath,"../../../docs/new-world/layout.json"));
            var layout=Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(path));
            var anchors=layout["roads"].SelectMany(chain=>chain).Concat(layout["wall"]["footline"]).Concat(layout["river"]["villageBank"]).Concat(layout["river"]["outerBank"]);
            foreach(var p in anchors)Assert.That(NewWorldTerrainBuilder.HeightAt(new Vector2((float)p[0],(float)p[1]),layout),Is.EqualTo(0).Within(.0001f));
            Assert.That(layout["terrainHeightInferences"].Any(control=>NewWorldTerrainBuilder.HeightAt(new Vector2((float)control["pixel"][0],(float)control["pixel"][1]),layout)>.1f),Is.True,"Relief cannot silently revert to a construction plane");
        }
        [Test] public void ReliefKeepsConcaveSourceCoverageWhileChangingActualElevation()
        {
            var go=new GameObject("Terrain source envelope test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            var outline=new[]{new Vector2(300,300),new Vector2(500,300),new Vector2(500,500),new Vector2(400,400),new Vector2(300,500)};
            try{var mesh=NewWorldTerrainBuilder.CreateMesh(c,outline,p=>(p.x-300)/100,8);
                try{
                    var pixels=mesh.vertices.Select(p=>NewWorldCalibrationBuilder.Project(c,p)).ToArray();float area=0;var tris=mesh.triangles;
                    for(int i=0;i<tris.Length;i+=3){var a=pixels[tris[i]];var b=pixels[tris[i+1]];var d=pixels[tris[i+2]];area+=Mathf.Abs((b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x))*.5f;}
                    Assert.That(area,Is.EqualTo(30000).Within(2));Assert.That(mesh.vertices.Max(p=>p.y)-mesh.vertices.Min(p=>p.y),Is.GreaterThan(1.9f));
                    foreach(var pixel in outline)Assert.That(pixels.Min(p=>Vector2.Distance(p,pixel)),Is.LessThan(.01f));
                }finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void ObservedBoulderRetainsSilhouetteAndClosesEveryMeshEdge()
        {
            var go=new GameObject("Observed boulder projection test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            var outline=new[]{new Vector2(716,765),new Vector2(735,746),new Vector2(761,749),new Vector2(778,775),new Vector2(763,799),new Vector2(733,794)};
            try{var mesh=NewWorldObservedRockBuilder.CreateRock(c,outline,4,4);
                try{
                    for(int i=0;i<outline.Length;i++)Assert.That(Vector2.Distance(NewWorldCalibrationBuilder.Project(c,mesh.vertices[i]),outline[i]),Is.LessThan(.01f));
                    var edges=new System.Collections.Generic.Dictionary<(int,int),int>();var indices=mesh.triangles;
                    for(int i=0;i<indices.Length;i+=3)for(int edge=0;edge<3;edge++){int a=indices[i+edge],b=indices[i+(edge+1)%3];var key=(Math.Min(a,b),Math.Max(a,b));edges[key]=edges.TryGetValue(key,out var count)?count+1:1;}
                    Assert.That(edges.Values.All(count=>count==2),Is.True,"Boulder must be a closed volume, not a reference-facing sheet");
                    Assert.That(mesh.bounds.size.z,Is.GreaterThan(4));
                }finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void ReferenceRoofKeepsBothEaveAndRidgeContoursAtDeclaredHeights()
        {
            var go=new GameObject("Controlled roof projection test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            try{
                var eaves=new[]{new Vector2(350,401),new Vector2(387,375),new Vector2(392,360),new Vector2(474,348),new Vector2(490,371),new Vector2(530,401),new Vector2(479,423),new Vector2(390,420)};
                var ridge=new[]{new Vector2(398,366),new Vector2(467,356)};
                var mesh=NewWorldArchitectureBuilder.CreateRoofMesh(c,eaves,ridge,5.6f,8.3f);
                try{
                    foreach(var pixel in eaves){var expected=NewWorldCalibrationBuilder.Unproject(c,pixel,5.6f);Assert.That(System.Linq.Enumerable.Min(mesh.vertices,p=>Vector3.Distance(p,expected)),Is.LessThan(.001f));}
                    foreach(var pixel in ridge){var expected=NewWorldCalibrationBuilder.Unproject(c,pixel,8.3f);Assert.That(System.Linq.Enumerable.Min(mesh.vertices,p=>Vector3.Distance(p,expected)),Is.LessThan(.001f));}
                    Assert.That(mesh.triangles.Length,Is.GreaterThan(60));Assert.That(mesh.uv.Length,Is.EqualTo(mesh.vertexCount));
                    foreach(var p in mesh.vertices)Assert.That(float.IsNaN(p.x)||float.IsNaN(p.y)||float.IsNaN(p.z),Is.False);
                }finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void NewReferenceProjectionRoundTripsBothCameraCandidates()
        {
            var go=new GameObject("New world projection test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.orthographicSize=941*.14f*.5f;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            try{foreach(var ortho in new[]{false,true}){c.orthographic=ortho;foreach(var pixel in new[]{Vector2.zero,new Vector2(1672,941),new Vector2(731,653),new Vector2(912,438)})foreach(var height in new[]{-4f,0f,10f,115f}){
                var point=NewWorldCalibrationBuilder.Unproject(c,pixel,height);Assert.That(Vector2.Distance(NewWorldCalibrationBuilder.Project(c,point),pixel),Is.LessThan(.005f));Assert.That(point.y,Is.EqualTo(height).Within(.001f));
            }}}finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void RiverRetainsBothDifferentLengthBankTracesAndDeclaredDepth()
        {
            var go=new GameObject("River trace test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            var left=new[]{new Vector2(400,200),new Vector2(220,400),new Vector2(500,700),new Vector2(900,941)};
            var right=new[]{new Vector2(370,200),new Vector2(150,420),new Vector2(210,580),new Vector2(420,760),new Vector2(700,941)};
            try{var mesh=NewWorldRiverBuilder.CreateRiverMesh(c,left,right,-2);
                try{foreach(var pixel in left.Concat(right)){var point=NewWorldCalibrationBuilder.Unproject(c,pixel,-2);Assert.That(mesh.vertices.Min(p=>Vector3.Distance(p,point)),Is.LessThan(.002f));}
                    Assert.That(mesh.uv.Length,Is.EqualTo(mesh.vertexCount));foreach(var p in mesh.vertices)Assert.That(p.y,Is.EqualTo(-2).Within(.001f));
                    for(int i=0;i<mesh.triangles.Length;i+=3){var a=mesh.vertices[mesh.triangles[i]];var b=mesh.vertices[mesh.triangles[i+1]];var d=mesh.vertices[mesh.triangles[i+2]];Assert.That(Vector3.Cross(b-a,d-a).y,Is.GreaterThanOrEqualTo(0));}
                }finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [Test] public void TracedConcaveTerrainTriangulatesWithoutFillingOutsideNotch()
        {
            var p=new[]{new Vector3(0,0,0),new Vector3(4,0,0),new Vector3(4,0,4),new Vector3(2,0,2),new Vector3(0,0,4)};
            var indices=NewWorldCalibrationBuilder.Triangulate(p);Assert.That(indices.Length,Is.EqualTo(9));float area=0;
            for(int i=0;i<indices.Length;i+=3){var a=p[indices[i]];var b=p[indices[i+1]];var c=p[indices[i+2]];var normal=Vector3.Cross(b-a,c-a);Assert.That(normal.y,Is.GreaterThan(0));area+=normal.magnitude*.5f;}
            Assert.That(area,Is.EqualTo(12).Within(.001f));
        }
        [Test] public void MountainMassRetainsObservedCrestAndHasVariableHeightAndBackDepth()
        {
            var go=new GameObject("Mountain source test");var c=go.AddComponent<Camera>();c.aspect=1672f/941;c.fieldOfView=28;c.transform.rotation=Quaternion.Euler(48,0,0);c.transform.position=-c.transform.forward*264;
            var crest=new[]{new Vector2(532,186),new Vector2(592,42),new Vector2(625,20),new Vector2(681,63),new Vector2(727,164)};
            try{var mesh=NewWorldMountainBuilder.CreateMass(c,crest,new Vector2(515,244),new Vector2(749,244),35,28);
                try{foreach(var pixel in crest)Assert.That(mesh.vertices.Min(p=>Vector2.Distance(NewWorldCalibrationBuilder.Project(c,p),pixel)),Is.LessThan(.01f));
                    Assert.That(mesh.vertexCount,Is.GreaterThan(100));Assert.That(mesh.bounds.size.z,Is.GreaterThan(28));Assert.That(mesh.vertices.Max(p=>p.y),Is.EqualTo(35).Within(.01f));Assert.That(mesh.vertices.Count(p=>p.y>0&&p.y<30),Is.GreaterThan(30));
                }finally{UnityEngine.Object.DestroyImmediate(mesh);}
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
    }
}
