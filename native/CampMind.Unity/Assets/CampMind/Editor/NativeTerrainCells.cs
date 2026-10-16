using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
namespace CampMind.Editor
{
    // Equivalent to source spatialGeometry.partitionGeometry: centroid cells,
    // original triangles and attributes, tight bounds. No simplification.
    public static class NativeTerrainCells
    {
        sealed class Cell
        {
            public readonly Dictionary<int,int> map=new Dictionary<int,int>();
            public readonly List<int> vertices=new List<int>();
            public readonly List<int>[] parts;
            public Cell(int count){parts=Enumerable.Range(0,count).Select(_=>new List<int>()).ToArray();}
            public int Index(int original){if(map.TryGetValue(original,out var index))return index;index=vertices.Count;map.Add(original,index);vertices.Add(original);return index;}
        }
        public static Mesh[] Partition(Mesh source,float cellSize)
        {
            if(!float.IsFinite(cellSize)||cellSize<=0)throw new ArgumentOutOfRangeException(nameof(cellSize));
            if(source.blendShapeCount>0||source.bindposes.Length>0)throw new NotSupportedException("Terrain cells require a static source mesh");
            var vertices=source.vertices;var normals=source.normals;var tangents=source.tangents;var colors=source.colors;
            var uv=new List<Vector4>[8];for(var n=0;n<8;n++){uv[n]=new List<Vector4>();source.GetUVs(n,uv[n]);}
            var cells=new SortedDictionary<(int,int),Cell>();
            for(var part=0;part<source.subMeshCount;part++){
                if(source.GetTopology(part)!=MeshTopology.Triangles)throw new NotSupportedException("Terrain cells require triangle topology");
                var indices=source.GetTriangles(part);
                for(var n=0;n<indices.Length;n+=3){var a=indices[n];var b=indices[n+1];var c=indices[n+2];var center=(vertices[a]+vertices[b]+vertices[c])/3;
                    var key=(Mathf.FloorToInt(center.x/cellSize),Mathf.FloorToInt(center.z/cellSize));
                    if(!cells.TryGetValue(key,out var cell)){cell=new Cell(source.subMeshCount);cells.Add(key,cell);}
                    cell.parts[part].Add(cell.Index(a));cell.parts[part].Add(cell.Index(b));cell.parts[part].Add(cell.Index(c));
                }
            }
            return cells.Select(entry=>{
                var cell=entry.Value;var mesh=new Mesh{name=$"Terrain cell {entry.Key.Item1},{entry.Key.Item2}",indexFormat=IndexFormat.UInt32};
                mesh.SetVertices(cell.vertices.Select(i=>vertices[i]).ToList());
                if(normals.Length==vertices.Length)mesh.SetNormals(cell.vertices.Select(i=>normals[i]).ToList());
                if(tangents.Length==vertices.Length)mesh.SetTangents(cell.vertices.Select(i=>tangents[i]).ToList());
                if(colors.Length==vertices.Length)mesh.SetColors(cell.vertices.Select(i=>colors[i]).ToList());
                for(var n=0;n<8;n++)if(uv[n].Count==vertices.Length){var channel=n;mesh.SetUVs(channel,cell.vertices.Select(i=>uv[channel][i]).ToList());}
                mesh.subMeshCount=source.subMeshCount;for(var n=0;n<source.subMeshCount;n++)mesh.SetTriangles(cell.parts[n],n,false);
                mesh.RecalculateBounds();return mesh;
            }).ToArray();
        }
    }
}
