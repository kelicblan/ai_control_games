using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CampMind.Editor
{
    // Editor-only derivative. Paid/imported source geometry is never overwritten.
    public static class StaticMeshClip
    {
        private sealed class Vertex
        {
            public int index=-1;
            public Vector3 position,normal;
            public Vector4 tangent;
            public Vector2 uv,uv2;
            public Color color;
            public static Vertex Between(Vertex a,Vertex b,float t)=>new Vertex{
                position=Vector3.LerpUnclamped(a.position,b.position,t),normal=Vector3.LerpUnclamped(a.normal,b.normal,t).normalized,
                tangent=Vector4.LerpUnclamped(a.tangent,b.tangent,t),uv=Vector2.LerpUnclamped(a.uv,b.uv,t),uv2=Vector2.LerpUnclamped(a.uv2,b.uv2,t),color=Color.LerpUnclamped(a.color,b.color,t)};
        }
        public static Mesh Subtract(Mesh source,IReadOnlyList<Bounds> volumes)
        {
            var planes=new List<Plane[]>();foreach(var box in volumes){var p=new List<Plane>();for(int axis=0;axis<3;axis++){var normal=Vector3.zero;normal[axis]=1;p.Add(new Plane(normal,box.min));p.Add(new Plane(-normal,box.max));}planes.Add(p.ToArray());}return SubtractVolumes(source,volumes,planes);
        }
        public static Mesh SubtractAbovePolygon(Mesh source,Vector3[] outline,float height)
            =>SubtractAbovePolygons(source,new[]{outline},new[]{height});
        public static Mesh SubtractAbovePolygons(Mesh source,IReadOnlyList<Vector3[]> outlines,IReadOnlyList<float> heights,IReadOnlyList<float> ceilings=null)
        {
            if(outlines.Count!=heights.Count||(ceilings!=null&&ceilings.Count!=outlines.Count))throw new ArgumentException("Each cut needs its own elevation");var bounds=new List<Bounds>();var volumes=new List<Plane[]>();
            for(int region=0;region<outlines.Count;region++){var outline=outlines[region];float height=heights[region];var triangles=NewWorldCalibrationBuilder.Triangulate(outline);
            for(int t=0;t<triangles.Length;t+=3){var points=new[]{outline[triangles[t]],outline[triangles[t+1]],outline[triangles[t+2]]};var center=(points[0]+points[1]+points[2])/3;var planes=new List<Plane>{new Plane(Vector3.up,Vector3.up*height)};if(ceilings!=null){if(ceilings[region]<=height)throw new ArgumentException("Cut ceiling must exceed its floor");planes.Add(new Plane(Vector3.down,Vector3.up*ceilings[region]));}var box=new Bounds(points[0],Vector3.zero);foreach(var p in points)box.Encapsulate(p);
                for(int i=0;i<3;i++){var normal=Vector3.Cross(Vector3.up,points[(i+1)%3]-points[i]).normalized;var plane=new Plane(normal,points[i]);if(plane.GetDistanceToPoint(center)<0)plane.Flip();planes.Add(plane);}var min=box.min;var max=box.max;min.y=height;max.y=ceilings!=null?ceilings[region]:Mathf.Max(source.bounds.max.y+1,height+1);box.SetMinMax(min,max);bounds.Add(box);volumes.Add(planes.ToArray());}
            }return SubtractVolumes(source,bounds,volumes);
        }
        private static Mesh SubtractVolumes(Mesh source,IReadOnlyList<Bounds> volumes,IReadOnlyList<Plane[]> planes)
        {
            for(var channel=2;channel<8;channel++)if(source.HasVertexAttribute((VertexAttribute)((int)VertexAttribute.TexCoord0+channel)))throw new NotSupportedException("Door clipping needs an explicit adapter for extra UV channels");
            var positions=new List<Vector3>(source.vertices);var normals=new List<Vector3>(source.normals);
            var tangents=new List<Vector4>(source.tangents);var uv=new List<Vector2>(source.uv);var uv2=new List<Vector2>(source.uv2);var colors=new List<Color>(source.colors);
            var hasNormals=normals.Count==positions.Count;var hasTangents=tangents.Count==positions.Count;
            var hasUv=uv.Count==positions.Count;var hasUv2=uv2.Count==positions.Count;var hasColors=colors.Count==positions.Count;
            Vertex Read(int index)=>new Vertex{index=index,position=positions[index],normal=hasNormals?normals[index]:Vector3.up,tangent=hasTangents?tangents[index]:Vector4.zero,
                uv=hasUv?uv[index]:Vector2.zero,uv2=hasUv2?uv2[index]:Vector2.zero,color=hasColors?colors[index]:Color.white};
            int Append(Vertex vertex){if(vertex.index>=0)return vertex.index;vertex.index=positions.Count;positions.Add(vertex.position);
                if(hasNormals)normals.Add(vertex.normal);if(hasTangents)tangents.Add(vertex.tangent);if(hasUv)uv.Add(vertex.uv);if(hasUv2)uv2.Add(vertex.uv2);if(hasColors)colors.Add(vertex.color);return vertex.index;}
            var parts=new List<int>[source.subMeshCount];
            for(var submesh=0;submesh<source.subMeshCount;submesh++){
                var original=source.GetTriangles(submesh);var output=new List<int>(original.Length);parts[submesh]=output;
                for(var i=0;i<original.Length;i+=3){var a=Read(original[i]);var b=Read(original[i+1]);var c=Read(original[i+2]);
                    var bounds=new Bounds(a.position,Vector3.zero);bounds.Encapsulate(b.position);bounds.Encapsulate(c.position);
                    var overlaps=false;foreach(var volume in volumes)if(volume.Intersects(bounds)){overlaps=true;break;}
                    if(!overlaps){output.Add(a.index);output.Add(b.index);output.Add(c.index);continue;}
                    var polygons=new List<List<Vertex>>{new List<Vertex>{a,b,c}};
                    for(int volume=0;volume<volumes.Count;volume++){if(!volumes[volume].Intersects(bounds))continue;var next=new List<List<Vertex>>();foreach(var polygon in polygons)next.AddRange(SubtractPolygon(polygon,planes[volume]));polygons=next;}
                    foreach(var polygon in polygons)for(var n=1;n<polygon.Count-1;n++){
                        if(Vector3.Cross(polygon[n].position-polygon[0].position,polygon[n+1].position-polygon[0].position).sqrMagnitude<1e-12f)continue;
                        output.Add(Append(polygon[0]));output.Add(Append(polygon[n]));output.Add(Append(polygon[n+1]));
                    }
                }
            }
            var result=new Mesh{name=source.name+" doorway derivative",indexFormat=IndexFormat.UInt32};result.SetVertices(positions);
            if(hasNormals)result.SetNormals(normals);if(hasTangents)result.SetTangents(tangents);if(hasUv)result.SetUVs(0,uv);if(hasUv2)result.SetUVs(1,uv2);if(hasColors)result.SetColors(colors);
            result.subMeshCount=parts.Length;for(var i=0;i<parts.Length;i++)result.SetTriangles(parts[i],i);
            if(!hasNormals)result.RecalculateNormals();result.RecalculateBounds();return result;
        }
        private static List<List<Vertex>> SubtractPolygon(List<Vertex> polygon,Plane[] planes)
        {
            var outside=new List<List<Vertex>>();var remaining=polygon;
            foreach(var plane in planes){
                var inside=new List<Vertex>();var rejected=new List<Vertex>();
                for(var i=0;i<remaining.Count;i++){
                    var a=remaining[i];var b=remaining[(i+1)%remaining.Count];
                    float da=plane.GetDistanceToPoint(a.position),db=plane.GetDistanceToPoint(b.position);var ai=da>=0;var bi=db>=0;
                    (ai?inside:rejected).Add(a);
                    if(ai!=bi){var intersection=Vertex.Between(a,b,da/(da-db));inside.Add(intersection);rejected.Add(intersection);}
                }
                if(rejected.Count>=3)outside.Add(rejected);remaining=inside;if(remaining.Count<3)break;
            }
            return outside;
        }
    }
}
