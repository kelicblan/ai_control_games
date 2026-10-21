using System;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.PixelWorld.Tests
{
    public class PixelWorldTests
    {
        [Test] public void ConnectionRejectsRemoteHostsAndWrongScope()
        {
            Assert.Throws<ArgumentException>(()=>PixelProtocol.ValidateConnection(new PixelConnection{protocol=1,scope="map-preview",endpoint="https://example.com",token=new string('a',64)}));
            Assert.Throws<ArgumentException>(()=>PixelProtocol.ValidateConnection(new PixelConnection{protocol=1,scope="formal",endpoint="http://127.0.0.1:18083",token=new string('a',64)}));
        }
        [Test] public void MetresUseNorthUpWithoutASecondTerrainGenerator()
        {
            Assert.AreEqual(new Vector3(10,-20,0),PixelProtocol.ToUnity(10,20));
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
