using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        GameObject workshopModel;string workshopWorld,workshopState;Material workshopMaterial;
        void BuildWorkshopControls()
        {
            var w=Snapshot?["uiCatalog"]?["workshop"];if(w==null)return;
            Text("营地工坊 · "+WorkshopStatus((string)w["state"]));
            Bind(()=>"建设：木材12 / 石料4 / 绳索2 · 工时20秒（另计路程）\n"+WorkshopStatus((string)Snapshot?["uiCatalog"]?["workshop"]?["state"])+" · 剩余 "+Math.Ceiling((double?)Snapshot?["uiCatalog"]?["workshop"]?["remaining"]??0)+" 秒");
            if((string)w["state"]=="planned")Button(content,"建造工坊",()=>Command("BUILD_WORKSHOP"));
            if((string)w["state"]=="ready")Button(content,"在工坊制作装备",()=>ShowManagement("制作"));
            Text("制造者会自动前往工坊工位。制作完成由制造者持有；指定伙伴后会实际交接，伙伴自行装备。");
        }
        static string WorkshopStatus(string s)=>s=="ready"?"已建成，可生产":s=="building"?"建设中":"待建设，尚不能生产";
        void PresentWorkshop()
        {
            var w=Snapshot?["uiCatalog"]?["workshop"];if(w==null){if(workshopModel!=null)workshopModel.SetActive(false);return;}
            var key=(string)Snapshot["worldId"];var status=(string)w["state"];
            if(workshopModel==null||workshopWorld!=key||workshopState!=status){
                if(workshopModel!=null)Destroy(workshopModel);if(workshopMaterial!=null)Destroy(workshopMaterial);
                workshopWorld=key;workshopState=status;workshopModel=new GameObject("营地工坊 · "+WorkshopStatus(status));
                var template=Resources.Load<Material>("VillageProp");workshopMaterial=template!=null?new Material(template):new Material(Shader.Find("Universal Render Pipeline/Lit"));workshopMaterial.color=status=="ready"?new Color(.4f,.28f,.15f):new Color(.52f,.42f,.25f);
                void Part(string name,Vector3 p,Vector3 size){var part=GameObject.CreatePrimitive(PrimitiveType.Cube);part.name=name;part.transform.SetParent(workshopModel.transform,false);part.transform.localPosition=p;part.transform.localScale=size;Destroy(part.GetComponent<Collider>());part.GetComponent<Renderer>().sharedMaterial=workshopMaterial;}
                Part("工坊地台",new Vector3(0,.05f,0),new Vector3(5,.1f,4));
                foreach(var x in new[]{-2.2f,2.2f})foreach(var z in new[]{-1.7f,1.7f})Part("立柱",new Vector3(x,status=="planned"?.45f:1.4f,z),new Vector3(.18f,status=="planned"?.9f:2.8f,.18f));
                if(status=="ready"){Part("遮雨顶棚",new Vector3(0,2.9f,0),new Vector3(5.4f,.25f,4.4f));Part("制作工作台",new Vector3(0,.85f,-.8f),new Vector3(2.2f,.22f,1));Part("材料架",new Vector3(-1.7f,.55f,-.8f),new Vector3(.5f,1.1f,1.2f));}
            }
            workshopModel.SetActive(VillageActive);Position(workshopModel,w["position"],0);
        }
    }
}
