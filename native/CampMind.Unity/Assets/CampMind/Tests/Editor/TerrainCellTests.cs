using System;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
namespace CampMind.Tests
{
    public class TerrainCellTests
    {
        [Test]
        public void ExactSpatialCellsPreserveTrianglesMaterialsAndVertexAttributes()
        {
            var type=Type.GetType("CampMind.Editor.NativeTerrainCells, CampMind.Editor");Assert.That(type,Is.Not.Null);
            var source=new Mesh();Mesh[] cells=null;
            try{
                source.vertices=new[]{new Vector3(-130,0,0),new Vector3(-120,2,0),new Vector3(-130,0,10),new Vector3(130,0,0),new Vector3(140,3,0),new Vector3(130,0,10)};
                source.uv=Enumerable.Range(0,6).Select(i=>new Vector2(i/6f,.5f)).ToArray();source.colors=Enumerable.Repeat(Color.red,6).ToArray();source.normals=Enumerable.Repeat(Vector3.up,6).ToArray();
                source.subMeshCount=2;source.SetTriangles(new[]{0,1,2},0);source.SetTriangles(new[]{3,4,5},1);source.RecalculateBounds();
                var original=source.vertices;var method=type.GetMethod("Partition");cells=(Mesh[])method.Invoke(null,new object[]{source,128f});
                Assert.That(cells.Length,Is.EqualTo(2));Assert.That(source.vertices,Is.EqualTo(original));Assert.That(source.triangles,Is.EqualTo(new[]{0,1,2,3,4,5}));
                Assert.That(cells.Sum(c=>c.triangles.Length),Is.EqualTo(6));
                foreach(var cell in cells){Assert.That(cell.subMeshCount,Is.EqualTo(2));Assert.That(cell.bounds.size.x,Is.EqualTo(10));
                    var vertices=cell.vertices;for(var i=0;i<vertices.Length;i++){var sourceIndex=Array.IndexOf(original,vertices[i]);Assert.That(sourceIndex,Is.GreaterThanOrEqualTo(0));Assert.That(cell.uv[i],Is.EqualTo(source.uv[sourceIndex]));Assert.That(cell.colors[i],Is.EqualTo(Color.red));Assert.That(cell.normals[i],Is.EqualTo(Vector3.up));}
                    Assert.That(cell.GetTriangles(vertices[0].x<0?0:1).Length,Is.EqualTo(3));
                }
                Assert.That(Assert.Throws<TargetInvocationException>(()=>method.Invoke(null,new object[]{source,0f})).InnerException,Is.TypeOf<ArgumentOutOfRangeException>());
            }finally{UnityEngine.Object.DestroyImmediate(source);if(cells!=null)foreach(var cell in cells)UnityEngine.Object.DestroyImmediate(cell);}
        }
    }
}
