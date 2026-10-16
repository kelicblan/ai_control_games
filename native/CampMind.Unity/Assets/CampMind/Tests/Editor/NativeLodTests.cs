using CampMind.Editor;
using NUnit.Framework;
using UnityEngine;

namespace CampMind.Tests
{
    public class NativeLodTests
    {
        [Test]
        public void GeometryFingerprintMatchesTheOfflineSimplifierByteContract()
        {
            var mesh=new Mesh();mesh.vertices=new[]{Vector3.zero,Vector3.right,Vector3.up};mesh.triangles=new[]{0,1,2};
            Assert.That(NativeMeshLod.Fingerprint(mesh,0),Is.EqualTo("577f5dd074efad2142c2fd1bc437cdfb72b528f551ef626cfdf45a95c240d241"));
            Object.DestroyImmediate(mesh);
        }
    }
}
