using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldPlazaBuilder
    {
        private const string Folder=NewWorldCalibrationBuilder.Folder;
        private static Material Mat(string id,Color color)
        {var path=Folder+"/"+id+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",color);m.SetFloat("_Cull",0);return m;}
        private static void Save(string id,Mesh mesh,Material material,bool collision)
        {var path=Folder+"/"+id+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);var go=new GameObject(id);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;if(collision)go.AddComponent<MeshCollider>().sharedMesh=go.GetComponent<MeshFilter>().sharedMesh;}
        private static void Beam(string id,Vector3 a,Vector3 b,float thickness,Material material)
        {var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=id;go.transform.SetPositionAndRotation((a+b)*.5f,Quaternion.LookRotation(b-a));go.transform.localScale=new Vector3(thickness,thickness,Vector3.Distance(a,b));go.GetComponent<Renderer>().sharedMaterial=material;UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());}
        public static JObject Build(Camera camera,JObject layout)
        {
            Vector2 P(JToken p)=>new Vector2((float)p[0],(float)p[1]);
            var plaza=layout["plaza"];var stone=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/NewLimestone.mat");
            var paving=Mat("NewPlazaPaving",new Color(.90f,.90f,.83f));paving.shader=Shader.Find("CampMind/New World Stone");var disk=GameObject.Find("central-plaza");if(disk)disk.GetComponent<Renderer>().sharedMaterial=paving;
            var observed=plaza["outline"].Select(p=>NewWorldCalibrationBuilder.Unproject(camera,P(p),.1f)).ToArray();var center=observed.Aggregate(Vector3.zero,(a,b)=>a+b)/observed.Length;float radius=observed.Average(p=>Vector3.Distance(p,center));
            const int count=24;float top=(float)plaza["inferredRimHeightMeters"];
            var vertices=new List<Vector3>();var triangles=new List<int>();
            for(int i=0;i<count;i++){
                var ring=new Vector3[8];for(int end=0;end<2;end++)for(int side=0;side<2;side++)for(int h=0;h<2;h++){float angle=(i+end*.96f)*Mathf.PI*2/count;float r=radius-side*.65f;ring[end*4+side*2+h]=new Vector3(center.x+Mathf.Cos(angle)*r,h==0?.1f:top,center.z+Mathf.Sin(angle)*r);}
                int start=vertices.Count;vertices.AddRange(ring);foreach(int index in new[]{0,4,5,0,5,1,2,3,7,2,7,6,1,5,7,1,7,3,0,2,6,0,6,4,0,1,3,0,3,2,4,6,7,4,7,5})triangles.Add(start+index);
            }
            var rim=new Mesh{name="Observed circular plaza rim with inferred stone joints"};rim.SetVertices(vertices);rim.SetTriangles(triangles,0);rim.RecalculateNormals();rim.RecalculateBounds();Save("new-plaza-round-rim",rim,paving,true);
            var oldStone=GameObject.Find("central-standing-stone-proxy");if(oldStone)oldStone.SetActive(false);
            Save("new-plaza-standing-stone",NewWorldObservedRockBuilder.CreateRock(camera,plaza["standingStoneOutline"].Select(P).ToArray(),9,2.5f),stone,true);
            var timber=Mat("NewFlagTimber",new Color(.36f,.24f,.12f));var red=Mat("NewFlagRed",new Color(.51f,.17f,.12f));var gold=Mat("NewFlagGold",new Color(.78f,.57f,.28f));int flags=0;
            foreach(var flag in layout["bannerObservations"]){
                if((float?)flag["inferredBaseHeightMeters"]==10&&layout["sourceCorrectionInferences"]!=null){flags++;continue;}
                var foot=NewWorldCalibrationBuilder.Unproject(camera,P(flag["foot"]),(float?)flag["inferredBaseHeightMeters"]??0);float y=(float)flag["headY"],lo=0,hi=30;
                for(int j=0;j<24;j++){float mid=(lo+hi)*.5f;if(NewWorldCalibrationBuilder.Project(camera,foot+Vector3.up*mid).y>y)lo=mid;else hi=mid;}Beam("Observed banner pole "+flags,foot,foot+Vector3.up*((lo+hi)*.5f),.13f,timber);
                var plane=new Plane(Vector3.forward,foot);Vector3 OnPlane(Vector2 pixel){var ray=camera.ViewportPointToRay(new Vector3(pixel.x/NewWorldCalibrationBuilder.Width,1-pixel.y/NewWorldCalibrationBuilder.Height,0));if(!plane.Raycast(ray,out var distance))throw new InvalidOperationException("Banner reference ray misses its vertical plane");return ray.GetPoint(distance);}
                var outline=flag["clothOutline"].Select(P).ToArray();var points=outline.Select(OnPlane).ToArray();var indices=new List<int>();for(int i=1;i<points.Length-1;i++)indices.AddRange(new[]{0,i,i+1});var cloth=new Mesh{name="Source-observed hanging cloth"};cloth.vertices=points;cloth.triangles=indices.ToArray();cloth.RecalculateNormals();Save("new-observed-banner-"+flags,cloth,red,false);
                for(int i=0;i<points.Length;i++)Beam("Banner gold edge",points[i],points[(i+1)%points.Length],.055f,gold);
                var c=new Vector2(outline.Average(p=>p.x),Mathf.Lerp(outline.Min(p=>p.y),outline.Max(p=>p.y),.45f));float width=(outline.Max(p=>p.x)-outline.Min(p=>p.x))*.22f;var diamond=new[]{c+Vector2.up*5,c+Vector2.right*width,c-Vector2.up*5,c-Vector2.right*width}.Select(OnPlane).Select(p=>p+Vector3.back*.03f).ToArray();
                for(int i=0;i<diamond.Length;i++)Beam("Banner diamond emblem",diamond[i],diamond[(i+1)%diamond.Length],.065f,gold);flags++;
            }
            return new JObject{["inferredCircleRadiusMeters"]=radius,["observedRadiusResidualMeters"]=observed.Max(p=>Mathf.Abs(Vector3.Distance(p,center)-radius)),["rimJointsInferred"]=count,["banners"]=flags,["policy"]="Round plaza constrained by source perimeter; standing stone and cloth contours manually observed, hidden depth and joints inferred",["accepted"]=false};
        }
    }
}
