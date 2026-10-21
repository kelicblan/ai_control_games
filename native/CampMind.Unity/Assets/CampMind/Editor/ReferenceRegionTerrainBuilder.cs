using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace CampMind.Editor
{
    /// <summary>New reference-constrained terrain. Depths and obscured slopes are explicitly inferred.</summary>
    public static class ReferenceRegionTerrainBuilder
    {
        private const string Folder="Assets/CampMind/ReferenceRegionCalibration/Terrain";
        private sealed class Mass {public string id;public Vector3[] crest;public Vector2[] pixels;public float front,back,z,baseY;}
        private static Camera camera;
        private static Vector3 eye,forward,up,right;
        private static float tan,aspect;
        private static Vector3[] river,terrace;
        private static Mass[] masses;
        private static float water,bed;
        private static float Cross(Vector3 a,Vector3 b,Vector3 p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
        public static bool Contains(Vector3[] polygon,float x,float z){
            var inside=false;for(int i=0,j=polygon.Length-1;i<polygon.Length;j=i++){
                var a=polygon[i];var b=polygon[j];if((a.z>z)!=(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
            }return inside;
        }
        private static float Distance(Vector3[] polygon,float x,float z){
            var d=float.PositiveInfinity;for(int i=0,j=polygon.Length-1;i<polygon.Length;j=i++){
                var a=polygon[j];var b=polygon[i];var dx=b.x-a.x;var dz=b.z-a.z;var t=Mathf.Clamp01(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz));d=Mathf.Min(d,Mathf.Sqrt(Mathf.Pow(x-a.x-t*dx,2)+Mathf.Pow(z-a.z-t*dz,2)));
            }return d;
        }
        private static Vector3 CrestPoint(Vector2 pixel,float z){
            var tan=Mathf.Tan(camera.fieldOfView*Mathf.Deg2Rad*.5f);var direction=camera.transform.forward+camera.transform.right*((pixel.x/2048*2-1)*tan*camera.aspect)+camera.transform.up*((1-pixel.y/1303*2)*tan);
            var t=(z-camera.transform.position.z)/direction.z;if(t<=0)throw new InvalidOperationException("Crest depth behind camera");return camera.transform.position+direction*t;
        }
        private static float Profile(Mass m,float x){
            if(x<m.crest[0].x||x>m.crest[m.crest.Length-1].x)return -20;
            for(var i=1;i<m.crest.Length;i++)if(x<=m.crest[i].x){var a=m.crest[i-1];var b=m.crest[i];return Mathf.Lerp(a.y,b.y,Mathf.InverseLerp(a.x,b.x,x));}return -20;
        }
        private static Vector2 ProjectFast(float x,float y,float z){var d=new Vector3(x,y,z)-eye;var depth=Vector3.Dot(d,forward);return new Vector2((Vector3.Dot(d,right)/(depth*tan*aspect)+1)*1024,(1-Vector3.Dot(d,up)/(depth*tan))*651.5f);}
        private static float PixelCrest(Mass m,float x){
            if(x<m.pixels[0].x||x>m.pixels[m.pixels.Length-1].x)return m.baseY;
            for(var i=1;i<m.pixels.Length;i++)if(x<=m.pixels[i].x){var a=m.pixels[i-1];var b=m.pixels[i];return Mathf.Lerp(a.y,b.y,Mathf.InverseLerp(a.x,b.x,x));}return m.baseY;
        }
        private static float ConstrainVisibleSurface(Mass m,float x,float z,float height){
            bool Allowed(float h){var p=ProjectFast(x,h,z);return p.y+.05f>=PixelCrest(m,p.x);}
            if(height<=0||Allowed(height))return height;if(!Allowed(0))return 0;
            var lo=0f;var hi=height;for(var i=0;i<14;i++){var mid=(lo+hi)*.5f;if(Allowed(mid))lo=mid;else hi=mid;}return lo;
        }
        public static float Height(float x,float z){
            if(Contains(terrace,x,z))return 0;
            var h=-3f+Mathf.PerlinNoise(x*.008f+41,z*.008f+83)*3;
            var shore=Distance(river,x,z);
            if(Contains(river,x,z))h=bed;
            else{var blend=Mathf.SmoothStep(0,1,Mathf.Clamp01(shore/24));h=Mathf.Lerp(water-.2f,h,blend);}
            var d=Distance(terrace,x,z);var terraceBlend=1-Mathf.SmoothStep(0,1,Mathf.Clamp01(d/18));h=Mathf.Lerp(h,0,terraceBlend);
            // Hidden far boundary slopes down behind the last ridge; no flat green strip in the sky.
            var farEnd=masses.Max(m=>m.z+m.back);return h-Mathf.Max(0,z-farEnd)*1.8f;
        }
        public static JObject Build(Camera reference,JObject constraints)
        {
            camera=reference;eye=camera.transform.position;forward=camera.transform.forward;up=camera.transform.up;right=camera.transform.right;tan=Mathf.Tan(camera.fieldOfView*Mathf.Deg2Rad*.5f);aspect=camera.aspect;Directory.CreateDirectory(Folder);var repo=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));var inferred=JObject.Parse(File.ReadAllText(Path.Combine(repo,"native/ArtSource/reference-initial-region/inferred-terrain.json")));water=(float)inferred["levels"]["water"];bed=(float)inferred["levels"]["riverBed"];
            Vector2[] Pixels(string id)=>constraints["features"].First(f=>(string)f["id"]==id)["points"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();
            var west=Pixels("river-west-bank").Select(p=>ReferenceRegionCalibrationBuilder.Unproject(camera,p,water));var east=Pixels("river-east-bank").Reverse().Select(p=>ReferenceRegionCalibrationBuilder.Unproject(camera,p,water));river=west.Concat(east).ToArray();terrace=Pixels("village-platform").Select(p=>ReferenceRegionCalibrationBuilder.Unproject(camera,p)).ToArray();
            masses=inferred["masses"].Select(m=>{
                var pixels=m["feature"]!=null?Pixels((string)m["feature"]):m["crest"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();var z=ReferenceRegionCalibrationBuilder.Unproject(camera,new Vector2(1024,(float)m["basePixelY"])).z;var depth=(float)m["depth"];
                return new Mass{id=(string)m["id"],z=z,front=depth*(float)m["frontSlope"],back=depth,baseY=(float)m["basePixelY"],pixels=pixels,crest=pixels.Select(p=>CrestPoint(p,z)).OrderBy(p=>p.x).ToArray()};
            }).ToArray();
            var root=new GameObject("REFERENCE TERRAIN BLOCKOUT — inferred depth; not accepted");
            // Traced crest vertices must exist in the exported mesh, rather than only in an analytic function.
            // Keep the actual floating-point support coordinates. Rounding an endpoint can
            // put it outside the bounded crest profile and collapse its exported vertex.
            var axisX=Axis(-1800,1800,-550,650,4,20).Concat(masses.SelectMany(m=>m.crest.Select(p=>p.x))).Where(x=>x>=-1800&&x<=1800).Distinct().OrderBy(x=>x).ToArray();
            var axisZ=Axis(-550,4000,-550,550,4,24).Concat(masses.Select(m=>m.z)).Distinct().OrderBy(z=>z).ToArray();var n=axisX.Length;var vertices=new Vector3[n*axisZ.Length];var colors=new Color[vertices.Length];var triangles=new int[(n-1)*(axisZ.Length-1)*6];
            for(var j=0;j<axisZ.Length;j++)for(var i=0;i<n;i++){var x=axisX[i];var z=axisZ[j];var y=Height(x,z);var k=j*n+i;vertices[k]=new Vector3(x,y,z);var rock=y>30;var noise=Mathf.PerlinNoise(x*.04f+33,z*.04f+62);colors[k]=Contains(terrace,x,z)?Color.Lerp(new Color(.32f,.27f,.18f),new Color(.46f,.39f,.26f),noise):rock?Color.Lerp(new Color(.22f,.25f,.23f),new Color(.42f,.44f,.40f),noise):Color.Lerp(new Color(.19f,.25f,.12f),new Color(.31f,.34f,.18f),noise);}
            var index=0;for(var j=0;j<axisZ.Length-1;j++)for(var i=0;i<n-1;i++){var a=j*n+i;triangles[index++]=a;triangles[index++]=a+n;triangles[index++]=a+1;triangles[index++]=a+1;triangles[index++]=a+n;triangles[index++]=a+n+1;}
            var mesh=new Mesh{name="Reference inferred valley terrain",indexFormat=IndexFormat.UInt32};mesh.vertices=vertices;mesh.colors=colors;mesh.triangles=triangles;mesh.RecalculateNormals();mesh.RecalculateBounds();var normals=mesh.normals;
            for(var i=0;i<colors.Length;i++)if(!Contains(terrace,vertices[i].x,vertices[i].z)){var cliff=1-Mathf.SmoothStep(.35f,.85f,normals[i].y);colors[i]=Color.Lerp(new Color(.19f,.25f,.13f),new Color(.29f,.31f,.29f),cliff);}mesh.colors=colors;Save(mesh,Folder+"/Terrain.asset");
            var go=new GameObject("Reference valley — new mesh and matching collision");go.transform.SetParent(root.transform);go.layer=9;go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Folder+"/Terrain.asset");go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;go.AddComponent<MeshRenderer>().sharedMaterial=Material("Ground",Color.white,"CampMind/Reference Sample Ground");
            var riverGo=new GameObject("Reference river — both traced banks");riverGo.transform.SetParent(root.transform);var riverMesh=Polygon(river);Save(riverMesh,Folder+"/Water.asset");riverGo.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Folder+"/Water.asset");riverGo.AddComponent<MeshRenderer>().sharedMaterial=Material("Water",new Color(.23f,.39f,.40f),"CampMind/Reference Sample Water");
            foreach(var old in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(g=>g.name.StartsWith("Reference terrace construction plane")||g.name.StartsWith("Measured fence footprint")).ToArray())UnityEngine.Object.DestroyImmediate(old);
            var fence=Pixels("palisade-footline").Select(p=>ReferenceRegionCalibrationBuilder.Unproject(camera,p)).ToArray();Palisade(root.transform,fence);
            float MeshHeight(float x,float z){
                var i=Array.BinarySearch(axisX,x);if(i<0)i=~i-1;i=Mathf.Clamp(i,0,axisX.Length-2);var j=Array.BinarySearch(axisZ,z);if(j<0)j=~j-1;j=Mathf.Clamp(j,0,axisZ.Length-2);
                var fx=(x-axisX[i])/(axisX[i+1]-axisX[i]);var fz=(z-axisZ[j])/(axisZ[j+1]-axisZ[j]);var a=j*n+i;
                if(fx+fz<=1)return vertices[a].y+(vertices[a+1].y-vertices[a].y)*fx+(vertices[a+n].y-vertices[a].y)*fz;
                var d=vertices[a+n+1].y;return d+(vertices[a+n].y-d)*(1-fx)+(vertices[a+1].y-d)*(1-fz);
            }
            var reprojection=new JArray();foreach(var m in masses)reprojection.Add(SolidMass(root.transform,m));
            return new JObject{["status"]="reference-terrain-blockout",["vertices"]=vertices.Length,["triangles"]=triangles.Length/3,["waterLevelInferred"]=water,["geometryFromOldMap"]=false,["crestChecks"]=reprojection,["inferredParameters"]=inferred["inferredParameters"].DeepClone(),["visualAccepted"]=false};
        }
        private static JObject SolidMass(Transform root,Mass m){
            // Independent three-dimensional bodies. A single maximum heightfield makes
            // overlapping depth layers into curtains and cannot preserve their visible areas.
            const int rows=40;var columns=new List<float>();for(var x=m.pixels[0].x;x<m.pixels[m.pixels.Length-1].x;x+=8)columns.Add(x);columns.AddRange(m.pixels.Select(p=>p.x));var xs=columns.Distinct().OrderBy(x=>x).ToArray();var n=xs.Length;
            var vertices=new Vector3[n*(rows*2+1)];var colors=new Color[vertices.Length];var triangles=new List<int>();
            for(var i=0;i<n;i++){
                var u=xs[i];var top=PixelCrest(m,u);vertices[i]=CrestPoint(new Vector2(u,top),m.z);
                for(var side=0;side<2;side++)for(var j=1;j<=rows;j++){
                    var t=j/(float)rows;var depth=side==0?-m.front:m.back;var z=m.z+depth*Mathf.Sin(t*Mathf.PI*.5f);
                    var baseY=ReferenceRegionCalibrationBuilder.Project(camera,new Vector3(0,0,m.z+depth)).y;
                    // Back slopes are inferred; the front surface stays entirely inside its traced screen outline.
                    if(side==1)baseY=Mathf.Max(baseY,top+1);
                    var y=Mathf.Lerp(top,Mathf.Max(top+1,baseY),t);var p=CrestPoint(new Vector2(u,y),z);
                    var detail=Mathf.Sin(i*.72f+j*.31f)*Mathf.Sin(j*.8f+i*.19f)*Mathf.Sin(t*Mathf.PI)*Mathf.Min(6,m.front*.04f);
                    // Detail varies hidden depth, not projected location.
                    p=CrestPoint(new Vector2(u,y),z+detail);vertices[(1+side*rows+j-1)*n+i]=p;
                }
            }
            for(var side=0;side<2;side++)for(var j=0;j<rows;j++)for(var i=0;i<n-1;i++){
                var a=(j==0?0:1+side*rows+j-1)*n+i;var b=(1+side*rows+j)*n+i;
                if(side==0)triangles.AddRange(new[]{a,a+1,b,a+1,b+1,b});else triangles.AddRange(new[]{a,b,a+1,a+1,b,b+1});
            }
            var mesh=new Mesh{name="Reference solid "+m.id,indexFormat=IndexFormat.UInt32};mesh.vertices=vertices;mesh.triangles=triangles.ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();var normals=mesh.normals;
            for(var i=0;i<colors.Length;i++){var cliff=1-Mathf.SmoothStep(.25f,.80f,normals[i].y);var grain=Mathf.PerlinNoise(vertices[i].x*.08f+13,vertices[i].y*.05f+71);colors[i]=Color.Lerp(new Color(.16f,.23f,.12f),Color.Lerp(new Color(.22f,.25f,.23f),new Color(.34f,.35f,.31f),grain),cliff);}mesh.colors=colors;
            var path=Folder+"/Mass-"+m.id+".asset";Save(mesh,path);var go=new GameObject("Reference mountain body "+m.id+" — inferred back slopes");go.transform.SetParent(root);go.layer=9;go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=Material("Ground",Color.white,"CampMind/Reference Sample Ground");go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;
            var max=0f;foreach(var pixel in m.pixels){var i=Array.IndexOf(xs,pixel.x);var actual=ReferenceRegionCalibrationBuilder.Project(camera,vertices[i]);max=Mathf.Max(max,Vector2.Distance(actual,pixel));}
            return new JObject{["id"]=m.id,["maxTerrainCrestReprojectionErrorPixels"]=max,["checkedExportedTriangles"]=true,["independentBody"]=true,["vertices"]=vertices.Length,["triangles"]=triangles.Count/3,["inferredDepth"]=true};
        }
        private static float[] Axis(float min,float max,float fineMin,float fineMax,float fine,float coarse){var points=new List<float>();for(var p=min;p<max;p+=p>=fineMin&&p<fineMax?fine:coarse)points.Add(p);points.Add(max);return points.ToArray();}
        private static void Palisade(Transform root,Vector3[] outline){
            var mesh=new Mesh{name="New reference timber stake"};const int sides=7;var v=new List<Vector3>();for(var j=0;j<2;j++)for(var i=0;i<sides;i++){var angle=i*Mathf.PI*2/sides;v.Add(new Vector3(Mathf.Cos(angle)*.49f,j*10.2f,Mathf.Sin(angle)*.49f));}v.Add(Vector3.up*11.5f);var t=new List<int>();for(var i=0;i<sides;i++){var next=(i+1)%sides;t.AddRange(new[]{i,next,i+sides,next,next+sides,i+sides,i+sides,next+sides,sides*2});}mesh.SetVertices(v);mesh.SetTriangles(t,0);mesh.RecalculateNormals();Save(mesh,Folder+"/Stake.asset");var timber=Material("Timber",new Color(.31f,.21f,.12f),"Universal Render Pipeline/Lit");var count=0;
            for(var j=0;j<outline.Length;j++){var a=outline[j];var b=outline[(j+1)%outline.Length];var distance=Vector3.Distance(a,b);var n=Mathf.CeilToInt(distance/1.12f);for(var i=0;i<n;i++){var p=Vector3.Lerp(a,b,(i+.5f)/n);var go=new GameObject("Reference stake "+count++);go.transform.SetParent(root);go.transform.position=p;go.transform.rotation=Quaternion.Euler(0,i*19+j*23,0);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(Folder+"/Stake.asset");go.AddComponent<MeshRenderer>().sharedMaterial=timber;}}
        }
        private static Mesh Polygon(Vector3[] points){
            var ids=Enumerable.Range(0,points.Length).ToList();var t=new List<int>();var area=points.Select((p,i)=>p.x*points[(i+1)%points.Length].z-p.z*points[(i+1)%points.Length].x).Sum();if(area<0)ids.Reverse();
            while(ids.Count>2){var found=false;for(var i=0;i<ids.Count;i++){var a=ids[(i+ids.Count-1)%ids.Count];var b=ids[i];var c=ids[(i+1)%ids.Count];if(Cross(points[a],points[b],points[c])<=0)continue;if(ids.Any(j=>j!=a&&j!=b&&j!=c&&Cross(points[a],points[b],points[j])>=0&&Cross(points[b],points[c],points[j])>=0&&Cross(points[c],points[a],points[j])>=0))continue;t.AddRange(new[]{a,c,b});ids.RemoveAt(i);found=true;break;}if(!found)throw new InvalidOperationException("River banks intersect or polygon invalid");}
            var mesh=new Mesh{name="Reference traced river"};mesh.vertices=points;mesh.triangles=t.ToArray();mesh.uv=points.Select(p=>new Vector2(p.x*.05f,p.z*.05f)).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static void Save(UnityEngine.Object value,string path){var old=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);if(old){EditorUtility.CopySerialized(value,old);UnityEngine.Object.DestroyImmediate(value);}else AssetDatabase.CreateAsset(value,path);}
        private static Material Material(string name,Color color,string shader){var path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find(shader));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",color);return m;}
    }
}
