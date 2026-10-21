using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using CampMind.Presentation;

namespace CampMind.Editor
{
    public static class NewWorldSettlementDetailBuilder
    {
        private static Material Material(string name,Color color)
        {
            var path=NewWorldCalibrationBuilder.Folder+"/"+name+".mat";
            var m=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!m){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}
            m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",.1f);return m;
        }
        private static GameObject Box(string name,Vector3 center,Vector3 size,Quaternion rotation,Material material,Transform parent=null,bool collision=false)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetPositionAndRotation(center,rotation);go.transform.localScale=size;go.GetComponent<Renderer>().sharedMaterial=material;
            if(parent)go.transform.SetParent(parent,true);if(!collision)UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());return go;
        }
        public static JObject Build(Camera camera,JObject layout,NewWorldCalibrationView view)
        {
            Vector3 At(JToken p,float y=0)=>NewWorldCalibrationBuilder.Unproject(camera,new Vector2((float)p[0],(float)p[1]),y);
            var timber=Material("NewDetailTimber",new Color(.39f,.27f,.14f));var metal=Material("NewDetailMetal",new Color(.28f,.30f,.27f));var stone=Material("NewDetailStone",new Color(.57f,.58f,.52f));
            var left=At(layout["gate"]["left"]);var right=At(layout["gate"]["right"]);var axis=(right-left).normalized;var normal=Vector3.Cross(Vector3.up,axis);var rotation=Quaternion.LookRotation(normal);float width=Vector3.Distance(left,right)*.5f;
            var gate=new GameObject("New reference double gate").AddComponent<NewWorldGateDoor>();gate.center=(left+right)*.5f;
            for(int side=0;side<2;side++){
                var hinge=new GameObject("Gate leaf hinge "+side).transform;hinge.SetPositionAndRotation(side==0?left:right,rotation);hinge.SetParent(gate.transform,true);
                float sign=side==0?1:-1;
                Box("Gate timber leaf",hinge.position+axis*(sign*width*.5f)+Vector3.up*4,new Vector3(width-.1f,8,.55f),rotation,timber,hinge,true);
                for(int board=1;board<10;board++)Box("Gate plank seam",hinge.position+axis*(sign*width*board/10f)+Vector3.up*4-normal*.29f,new Vector3(.04f,8,.04f),rotation,metal,hinge);
                foreach(float h in new[]{1.2f,4f,6.8f})Box("Gate metal cross strap",hinge.position+axis*(sign*width*.5f)+Vector3.up*h-normal*.32f,new Vector3(width,.16f,.1f),rotation,metal,hinge);
                if(side==0){gate.leftLeaf=hinge;gate.leftClosed=rotation;}else{gate.rightLeaf=hinge;gate.rightClosed=rotation;}
            }
            view.gate=gate;
            var bridge=layout["bridge"];var a=At(bridge["outerEnd"],.1f);var b=At(bridge["villageEnd"],.1f);var forward=(b-a).normalized;var bridgeRotation=Quaternion.LookRotation(forward);float length=Vector3.Distance(a,b);int boards=Mathf.CeilToInt(length/.6f);
            for(int i=0;i<boards;i++)Box("Bridge individual deck plank",Vector3.Lerp(a,b,(i+.5f)/boards)+Vector3.up*.27f,new Vector3((float)bridge["inferredWidthMeters"],.1f,length/boards-.035f),bridgeRotation,timber);
            int postCount=0;
            foreach(var observed in layout["detailObservations"]["wallPostFeet"]){
                var p=At(observed);var tangent=Quaternion.identity;
                for(int layer=0;layer<3;layer++)Box("Observed wall post stepped stone",p+Vector3.up*(.35f+layer*.7f),new Vector3(2.7f-layer*.3f,.7f,2.7f-layer*.3f),tangent,stone);
                Box("Observed wall post timber",p+Vector3.up*6,new Vector3(1.25f,8,1.25f),tangent,timber);
                Box("Observed wall post cap",p+Vector3.up*10.2f,new Vector3(2.1f,.45f,2.1f),tangent,metal);postCount++;
            }
            return new JObject{["doubleGate"]=true,["gateBehavior"]="Closed for reference view, proximity opens physical hinged leaves in walking sample",["bridgeIndividualPlanks"]=boards,["observedWallPosts"]=postCount,["accepted"]=false};
        }
    }
}
