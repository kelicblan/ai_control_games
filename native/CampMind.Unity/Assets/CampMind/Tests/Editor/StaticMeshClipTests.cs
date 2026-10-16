using CampMind.Editor;
using NUnit.Framework;
using UnityEngine;

namespace CampMind.Tests
{
    public class StaticMeshClipTests
    {
        [Test]
        public void DerivedDoorCutPreservesSourceAndInterpolatesSurfaceAttributes()
        {
            var source=new Mesh();source.vertices=new[]{new Vector3(-2,0,0),new Vector3(2,0,0),new Vector3(0,2,0)};
            source.uv=new[]{Vector2.zero,Vector2.right,Vector2.up};source.triangles=new[]{0,1,2};source.RecalculateNormals();
            var opening=new Bounds(new Vector3(0,.8f,0),new Vector3(1,1.4f,.2f));
            var result=StaticMeshClip.Subtract(source,new[]{opening});
            Assert.That(source.vertexCount,Is.EqualTo(3));Assert.That(source.triangles,Is.EqualTo(new[]{0,1,2}));
            Assert.That(result.uv.Length,Is.EqualTo(result.vertexCount));Assert.That(result.normals.Length,Is.EqualTo(result.vertexCount));
            var vertices=result.vertices;var triangles=result.triangles;var area=0f;
            for(var n=0;n<triangles.Length;n+=3){var a=vertices[triangles[n]];var b=vertices[triangles[n+1]];var c=vertices[triangles[n+2]];area+=Vector3.Cross(b-a,c-a).magnitude*.5f;Assert.That(opening.Contains((a+b+c)/3),Is.False);}
            Assert.That(area,Is.GreaterThan(0));Assert.That(area,Is.LessThan(4));
            Object.DestroyImmediate(source);Object.DestroyImmediate(result);
        }
    }
}
