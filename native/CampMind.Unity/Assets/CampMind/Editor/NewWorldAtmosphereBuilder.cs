using System;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace CampMind.Editor
{
    public static class NewWorldAtmosphereBuilder
    {
        public static Mesh CreateWaterfall(Camera camera,Vector2[] centers,float[] heights,float[] widths)
        {
            if(centers.Length<2||heights.Length!=centers.Length||widths.Length!=centers.Length)throw new ArgumentException("Incomplete waterfall observations");
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var indices=new List<int>();
            for(int i=0;i<centers.Length;i++){
                foreach(float side in new[]{-.5f,.5f}){vertices.Add(NewWorldCalibrationBuilder.Unproject(camera,centers[i]+Vector2.right*widths[i]*side,heights[i]));uv.Add(new Vector2(side+.5f,i/(float)(centers.Length-1)));}
                if(i>0){int a=(i-1)*2;indices.AddRange(new[]{a,a+1,a+3,a,a+3,a+2});}
            }
            var mesh=new Mesh{name="Observed waterfall path with inferred real elevation drop"};mesh.SetVertices(vertices);mesh.SetTriangles(indices,0);mesh.SetUVs(0,uv);mesh.colors=Enumerable.Repeat(Color.white,vertices.Count).ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
        private static Material Material(string name,bool mist)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(Shader.Find("CampMind/New World Air Water"));AssetDatabase.CreateAsset(m,path);}m.SetColor("_BaseColor",mist?new Color(.83f,.88f,.85f,.19f):new Color(.90f,.95f,.92f,.90f));m.SetFloat("_Mist",mist?1:0);return m;
        }
        public static JObject Build(Camera camera,JObject layout)
        {
            var material=Material("NewWaterfall",false);int falls=0;
            foreach(var data in layout["waterfallObservations"]){
                var centers=data["centers"].Select(p=>new Vector2((float)p[0],(float)p[1])).ToArray();var mesh=CreateWaterfall(camera,centers,data["inferredHeightsMeters"].Select(p=>(float)p).ToArray(),data["widthsPixels"].Select(p=>(float)p).ToArray());
                string path=NewWorldCalibrationBuilder.Folder+"/observed-waterfall-"+falls+".asset";var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(old){EditorUtility.CopySerialized(mesh,old);UnityEngine.Object.DestroyImmediate(mesh);}else AssetDatabase.CreateAsset(mesh,path);
                var go=new GameObject("Observed waterfall "+falls++);go.AddComponent<MeshFilter>().sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);go.AddComponent<MeshRenderer>().sharedMaterial=material;
            }
            var cloud=Material("NewMountainMist",true);int patches=0;
            foreach(var data in layout["mistObservations"]){
                var rect=data["bounds"];float height=(float)data["inferredHeightMeters"];var center=new Vector2(((float)rect[0]+(float)rect[2])*.5f,((float)rect[1]+(float)rect[3])*.5f);
                var a=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)rect[0],center.y),height);var b=NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)rect[2],center.y),height);float width=Vector3.Distance(a,b);
                var go=new GameObject("Observed mountain mist volume "+patches++);go.transform.position=NewWorldCalibrationBuilder.Unproject(camera,center,height);
                var ps=go.AddComponent<ParticleSystem>();ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);var main=ps.main;main.loop=true;main.duration=20;main.prewarm=true;main.playOnAwake=true;main.startLifetime=20;main.startSpeed=0;main.startSize=new ParticleSystem.MinMaxCurve(width*.18f,width*.26f);main.simulationSpace=ParticleSystemSimulationSpace.World;main.maxParticles=60;
                var emission=ps.emission;emission.enabled=true;emission.rateOverTime=2.1f;var shape=ps.shape;shape.enabled=true;shape.shapeType=ParticleSystemShapeType.Box;shape.scale=new Vector3(width,width*.1f,10);var renderer=ps.GetComponent<ParticleSystemRenderer>();renderer.sharedMaterial=cloud;renderer.renderMode=ParticleSystemRenderMode.Billboard;
                ps.useAutoRandomSeed=false;ps.randomSeed=(uint)(20261017+patches);
            }
            return new JObject{["waterfalls"]=falls,["mistVolumes"]=patches,["policy"]="Observed effect paths and broad mist envelopes; depths, individual particles and elevations inferred; no reference-image background",["accepted"]=false};
        }
    }
}
