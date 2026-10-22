using System;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.PixelWorld.Tests
{
    public class PixelWorldTests
    {
        [Test] public void RotatedMovementStillProjectsToTheRequestedScreenDirection(){
            foreach(float angle in new[]{0f,45f,90f,180f,270f})foreach(var input in new[]{Vector2.right,Vector2.left,Vector2.up,Vector2.down}){
                var world=PixelProtocol.ScreenDirection(input,angle).normalized;
                var screen=Quaternion.Inverse(Quaternion.Euler(0,0,angle))*PixelProtocol.ToUnity(world.x,world.y);
                Assert.Greater(Vector2.Dot(new Vector2(screen.x,-screen.y).normalized,input),.999f);
            }
        }
        [Test] public void RotatedStreamingBoundsContainEveryCameraCorner(){
            foreach(float angle in new[]{0f,30f,45f,90f,130f}){
                var bounds=PixelProtocol.ViewExtents(155,1.8f,angle);
                foreach(int x in new[]{-1,1})foreach(int y in new[]{-1,1}){
                    var p=PixelProtocol.ScreenDirection(new Vector2(x*155*1.8f,y*155),angle);
                    Assert.LessOrEqual(Mathf.Abs(p.x),bounds.x+.001f);Assert.LessOrEqual(Mathf.Abs(p.y),bounds.y+.001f);
                }
            }
        }
        [Test] public void VillageMiniatureCannotBeCoveredByANeighbouringMountainAggregate()
        {
            using(var art=new PixelArtLibrary()){
                var hall=new PixelProp{id="lord-hall",kind="hall",x=128,y=128,width=60,mapLayer=1};
                var mountain=new PixelProp{id="ridge",kind="mountain-peak",x=128,y=150,width=240};
                var raster=new PixelRaster{size=128,span=256,metresPerPixel=2,props=new[]{mountain}};
                var expected=new Color32[128*128];var actual=new Color32[128*128];var painter=new PixelOverviewPainter();
                // Reference composition: mountain background first, then the translucent village sprite.
                painter.Paint(expected,raster,art);raster.props=new[]{hall};painter.Paint(expected,raster,art);
                raster.props=new[]{hall,mountain};painter.Paint(actual,raster,art);
                CollectionAssert.AreEqual(expected,actual);
            }
        }
        [Test] public void OverviewBridgeKeepsTheAuthoritativeRoadCrossingAngle()
        {
            using(var art=new PixelArtLibrary()){
                var raster=new PixelRaster{size=128,span=256,metresPerPixel=2,props=new[]{new PixelProp{id="bridge",kind="bridge-horizontal",x=128,y=128,width=80,depth=12,angle=Mathf.PI/4}}};
                var pixels=new Color32[128*128];new PixelOverviewPainter().Paint(pixels,raster,art);
                int count=0;float covariance=0;for(int row=0;row<128;row++)for(int x=0;x<128;x++)if(pixels[(127-row)*128+x].a>0){count++;covariance+=(x-64)*(row-64);}
                Assert.Greater(count,50);Assert.Greater(covariance,1000);
            }
        }
        [Test] public void OverviewCompositeDrawsRealBuildingAndTreeSpritesAtTheirWorldAnchors()
        {
            using(var art=new PixelArtLibrary()){
                var raster=new PixelRaster{size=128,x=0,y=0,span=256,metresPerPixel=2,props=new[]{new PixelProp{id="hall",kind="hall",x=64,y=128,width=60},new PixelProp{id="tree",kind="oak",x=180,y=128,width=30}}};
                var pixels=new Color32[128*128];new PixelOverviewPainter().Paint(pixels,raster,art);
                int hall=0,tree=0;for(int y=0;y<128;y++)for(int x=0;x<128;x++)if(pixels[y*128+x].a>0){if(x<64)hall++;else tree++;}
                Assert.Greater(hall,40);Assert.Greater(tree,20);Assert.AreEqual(0,pixels[0].a);
            }
        }
        [Test] public void TreeTransformSwayMovesInWindAndKeepsItsWorldRootFixed()
        {
            var tree=new GameObject("rooted tree");try{
                tree.transform.position=new Vector3(13900,-23400,0);var root=tree.transform.position;var sway=tree.AddComponent<PixelTreeSway>();
                sway.Present(.65f,5.02f,0);var first=tree.transform.localRotation;sway.Present(.65f,5.02f,1.5f);
                Assert.Greater(Quaternion.Angle(first,tree.transform.localRotation),.1f);Assert.AreEqual(root,tree.transform.position);
                sway.Present(0,5.02f,3);Assert.AreEqual(Quaternion.identity,tree.transform.localRotation);Assert.AreEqual(root,tree.transform.position);
            }finally{UnityEngine.Object.DestroyImmediate(tree);}
        }
        [Test] public void CompanionsHaveStableDistinctSpritesAndDirectionalWalkFrames()
        {
            using(var art=new PixelArtLibrary()){
                var hashes=new System.Collections.Generic.HashSet<string>();var preview=new Texture2D(9*64,72*3,TextureFormat.RGBA32,false);
                string[] ids={"azhuang","xiaomi","laozhou","linlan","aye","tiesheng","aling","xiaoman","shenyan"};
                for(int n=0;n<ids.Length;n++){
                    var front=art.Companion(ids[n],0,false,0);Assert.AreSame(front,art.Companion(ids[n],0,false,0));
                    var bytes=front.texture.EncodeToPNG();using(var sha=System.Security.Cryptography.SHA256.Create())Assert.IsTrue(hashes.Add(Convert.ToBase64String(sha.ComputeHash(bytes))),ids[n]);
                    for(int d=0;d<3;d++){var frame=art.Companion(ids[n],d,true,1);Assert.AreEqual(front.rect.size,frame.rect.size);preview.SetPixels32(n*64,d*72,64,72,frame.texture.GetPixels32());}
                }
                preview.Apply();string folder=System.IO.Path.GetFullPath(System.IO.Path.Combine(Application.dataPath,"../../Artifacts/companion-wildlife"));System.IO.Directory.CreateDirectory(folder);System.IO.File.WriteAllBytes(System.IO.Path.Combine(folder,"companions.png"),preview.EncodeToPNG());UnityEngine.Object.DestroyImmediate(preview);
                var animals=new Texture2D(6*72,64);string[] species={"rabbit","pheasant","deer","boar","bear","tiger"};
                for(int n=0;n<species.Length;n++){var first=art.Wildlife(species[n],0);Assert.AreEqual(first.rect,art.Wildlife(species[n],1).rect);animals.SetPixels32(n*72,0,72,64,first.texture.GetPixels32());}
                animals.Apply();System.IO.File.WriteAllBytes(System.IO.Path.Combine(folder,"animals.png"),animals.EncodeToPNG());UnityEngine.Object.DestroyImmediate(animals);
            }
        }
        [Test] public void RainAndStormDarkenTheMapWithoutDarkeningClearSkies()
        {
            Assert.AreEqual(0,PixelWeatherView.TargetDarkness("clear",0));
            Assert.Greater(PixelWeatherView.TargetDarkness("rain",.8f),.18f);
            Assert.Greater(PixelWeatherView.TargetDarkness("storm",1),PixelWeatherView.TargetDarkness("rain",1));
        }
        [Test] public void EnvironmentWindIsBoundedAndDoesNotInventWind()
        {
            Assert.AreEqual(0,PixelEnvironmentMotion.Wind(0));
            Assert.AreEqual(0,PixelEnvironmentMotion.Wind(float.NaN));
            Assert.AreEqual(0,PixelEnvironmentMotion.Wind(float.PositiveInfinity));
            Assert.AreEqual(1,PixelEnvironmentMotion.Wind(2));
            Assert.AreEqual(.35f,PixelEnvironmentMotion.Wind(.35f));
        }
        [Test] public void WaterMaskUsesAuthoritativeCellsAndMatchesNorthUpTextureRows()
        {
            var chunk=new PixelChunk{tiles=new int[4096]};chunk.tiles[0]=5;chunk.tiles[4095]=5;chunk.tiles[64]=7;
            var mask=PixelEnvironmentMotion.WaterPixels(chunk);
            Assert.AreEqual(255,mask[63*64].r);Assert.AreEqual(255,mask[63].r);
            Assert.AreEqual(0,mask[62*64].r);Assert.AreEqual(0,mask[0].r);
            Assert.AreEqual(2,System.Array.FindAll(mask,c=>c.r==255).Length);
        }
        [Test] public void OnlyLivingTreeKindsReceiveCrownMotion()
        {
            foreach(var kind in new[]{"pine","oak","ornamental-tree","scenery-tree","scenery-tree-gold","scenery-pine"})Assert.IsTrue(PixelEnvironmentMotion.IsTree(kind),kind);
            foreach(var kind in new[]{"stump","bridge-wood","house","rock",null})Assert.IsFalse(PixelEnvironmentMotion.IsTree(kind),kind);
            var go=new GameObject("wind test");
            try{
                var renderer=go.AddComponent<SpriteRenderer>();
                using(var art=new PixelArtLibrary()){
                    renderer.sprite=art.Get("oak");PixelEnvironmentMotion.ConfigureTree(renderer,"oak");
                    var block=new MaterialPropertyBlock();renderer.GetPropertyBlock(block);
                    Assert.AreEqual(1,block.GetFloat("_MotionKind"));
                    Assert.AreEqual(renderer.sprite.rect.yMin/renderer.sprite.texture.height,block.GetVector("_TreeBounds").x);
                    Assert.Greater(block.GetVector("_TreeBounds").y,0);
                }
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        [TestCase(1.333333f)] [TestCase(1.777778f)] [TestCase(3.555556f)]
        public void FarthestZoomContainsTheCompleteRegion(float aspect)
        {
            float zoom=PixelProtocol.FullRegionZoom(aspect);
            Assert.GreaterOrEqual(zoom*2*aspect,31999.99f);
            Assert.GreaterOrEqual(zoom*2/PixelProtocol.WorldYScale,31999.99f);
        }
        [Test] public void MountainSpritesUseSeparateOrganicMassifsInsteadOfWholeAtlasStrips()
        {
            var library=Resources.Load<TinySwordsLibrary>("PixelWorld/TinySwords");Assert.IsNotNull(library);
            foreach(var kind in new[]{"mountain-peak","mountain-ridge","snow-peak"}){
                var sprite=library.Get(kind);Assert.IsNotNull(sprite,kind);
                // The low ridge is deliberately wider than the alpine massif.
                Assert.Less(sprite.rect.width,sprite.texture.width/2);Assert.Greater(sprite.rect.height,sprite.rect.width*.25f);
                Assert.AreEqual(0,sprite.texture.GetPixel(0,0).a);
            }
        }
        [Test] public void ChineseArchitectureUsesTheActualAtlasWithDistinctHouseVariants()
        {
            var library=Resources.Load<TinySwordsLibrary>("PixelWorld/TinySwords");Assert.IsNotNull(library);
            foreach(var kind in new[]{"hall","house","house-alt","workshop","storehouse","gate-open","well","tower"}){
                var sprite=library.Get(kind);Assert.IsNotNull(sprite,kind);Assert.Greater(sprite.rect.width,150,kind);
                Assert.Less(sprite.rect.width,sprite.texture.width*.35f,kind);Assert.AreEqual(0,sprite.pivot.y);
            }
            Assert.AreNotEqual(library.Get("house").rect,library.Get("house-alt").rect);
        }
        [Test] public void TinySwordsSheetsAreSlicedAndPublishedAsReferencedResources()
        {
            var library=Resources.Load<TinySwordsLibrary>("PixelWorld/TinySwords");Assert.IsNotNull(library);
            foreach(var kind in new[]{"pine","oak","bush","lord-idle","lord-run","fire-flame"}){
                var sprite=library.Get(kind,0);Assert.IsNotNull(sprite,kind);
                Assert.Less(sprite.rect.width,sprite.texture.width/2,kind+" must not display an animation strip");
                Assert.AreEqual(FilterMode.Point,sprite.texture.filterMode);
                Assert.AreEqual(sprite.rect.size,library.Get(kind,1).rect.size,kind+" animation bounds must remain stable");
            }
        }
        [Test] public void ConnectionRejectsRemoteHostsAndWrongScope()
        {
            Assert.Throws<ArgumentException>(()=>PixelProtocol.ValidateConnection(new PixelConnection{protocol=1,scope="pixel-game",endpoint="https://example.com",token=new string('a',64)}));
            Assert.Throws<ArgumentException>(()=>PixelProtocol.ValidateConnection(new PixelConnection{protocol=1,scope="formal",endpoint="http://127.0.0.1:18083",token=new string('a',64)}));
        }
        [Test] public void MetresUseNorthUpWithoutASecondTerrainGenerator()
        {
            Assert.AreEqual(new Vector3(10,-27,0),PixelProtocol.ToUnity(10,20));
            var original=new Vector2(13824,17408);var point=PixelProtocol.FromUnity(PixelProtocol.ToUnity(original.x,original.y));
            Assert.That(Vector2.Distance(original,point),Is.LessThan(.002f));
        }
        [Test] public void BadChunkIsRejectedBeforeAllocatingTextures()
        {
            Assert.Throws<ArgumentException>(()=>PixelProtocol.ValidateChunk(new PixelChunk{cells=64,size=128,tiles=new int[2],props=Array.Empty<PixelProp>()}));
        }
        [Test] public void OriginalSpritesArePointFilteredWithFootPivots()
        {
            using(var art=new PixelArtLibrary())
            {
                foreach(var kind in new[]{"hall","house","workshop","storehouse","pine","oak","gate-open","gate-closed","goldmine","lord-front-0"})
                {
                    var sprite=art.Get(kind);
                    Assert.AreEqual(FilterMode.Point,sprite.texture.filterMode);
                    Assert.AreEqual(0,sprite.pivot.y);
                    Assert.Greater(sprite.texture.width,8);
                }
            }
        }
    }
}
