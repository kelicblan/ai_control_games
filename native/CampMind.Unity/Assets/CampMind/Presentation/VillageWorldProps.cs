using UnityEngine;
using System.Collections.Generic;
namespace CampMind.Presentation
{
    // Low-poly local meshes; no collider or simulation authority.
    public sealed class VillageWorldProps:MonoBehaviour
    {
        Transform[] legs;
        static readonly Dictionary<Color,Material> colors=new Dictionary<Color,Material>();
        Vector3 previous;
        public static GameObject Wolf(string id,string archetype)
        {
            var root=new GameObject("狼 "+id);var c=archetype=="M004"?new Color(.24f,.17f,.12f):archetype=="M006"?new Color(.12f,.15f,.22f):new Color(.4f,.42f,.43f);
            Part(root,"躯干",PrimitiveType.Sphere,new Vector3(0,.65f,0),new Vector3(.5f,.55f,1.05f),c);
            Part(root,"头",PrimitiveType.Sphere,new Vector3(0,.88f,.58f),new Vector3(.43f,.43f,.46f),c);
            Part(root,"吻",PrimitiveType.Cube,new Vector3(0,.78f,.86f),new Vector3(.24f,.18f,.35f),c*.8f);
            foreach(var x in new[]{-.14f,.14f}){var ear=Part(root,"耳",PrimitiveType.Cube,new Vector3(x,1.13f,.5f),new Vector3(.12f,.28f,.16f),c*.8f);ear.localRotation=Quaternion.Euler(0,0,x<0?-15:15);Part(root,"眼",PrimitiveType.Sphere,new Vector3(x*1.35f,.92f,.74f),Vector3.one*.055f,new Color(.95f,.66f,.13f));}
            var instance=root.AddComponent<VillageWorldProps>();instance.legs=new Transform[4];int i=0;
            foreach(var x in new[]{-.19f,.19f})foreach(var z in new[]{-.35f,.35f})instance.legs[i++]=Part(root,"腿",PrimitiveType.Cube,new Vector3(x,.3f,z),new Vector3(.12f,.5f,.14f),c*.8f);
            var tail=Part(root,"尾",PrimitiveType.Capsule,new Vector3(0,.67f,-.7f),new Vector3(.13f,.35f,.13f),c);tail.localRotation=Quaternion.Euler(45,0,0);
            if(archetype=="M004")root.transform.localScale=Vector3.one*1.4f;else if(archetype=="M003")root.transform.localScale=Vector3.one*1.2f;
            return root;
        }
        public static GameObject Resource(string id,string resource)
        {
            var root=new GameObject("资源 "+id);
            if(resource=="wood"){Part(root,"树干",PrimitiveType.Cylinder,new Vector3(0,.8f,0),new Vector3(.28f,.8f,.28f),new Color(.35f,.23f,.12f));Part(root,"树冠",PrimitiveType.Sphere,new Vector3(0,2,0),new Vector3(1.5f,1.8f,1.5f),new Color(.18f,.36f,.17f));}
            else if(resource=="stone"){var stone=Part(root,"矿石",PrimitiveType.Sphere,new Vector3(0,.4f,0),new Vector3(1.1f,.8f,.9f),new Color(.49f,.5f,.48f));stone.localRotation=Quaternion.Euler(12,25,13);}
            else if(resource=="food"){Part(root,"莓果灌木",PrimitiveType.Sphere,new Vector3(0,.6f,0),new Vector3(1.2f,1,1),new Color(.22f,.4f,.15f));foreach(var x in new[]{-.35f,0,.35f})Part(root,"莓果",PrimitiveType.Sphere,new Vector3(x,.85f,.35f),Vector3.one*.15f,new Color(.7f,.13f,.16f));}
            else if(resource=="container"){Part(root,"掉落物资",PrimitiveType.Cube,new Vector3(0,.2f,0),new Vector3(.6f,.4f,.5f),new Color(.45f,.28f,.13f));}
            else{foreach(var x in new[]{-.3f,0,.3f})Part(root,"纤维",PrimitiveType.Capsule,new Vector3(x,.5f,0),new Vector3(.2f,.55f,.3f),new Color(.64f,.59f,.3f));}
            return root;
        }
        public static GameObject Weapon(string recipe)
        {
            var root=new GameObject("实际装备 "+recipe);var wood=new Color(.42f,.25f,.1f);var steel=new Color(.62f,.66f,.67f);
            if(recipe=="WPN003"||recipe=="WPN005"){
                for(int i=0;i<7;i++){var y=(i-3)*.15f;var segment=Part(root,"弓臂",PrimitiveType.Cube,new Vector3(.18f*(1-y*y*3),y,0),new Vector3(.055f,.18f,.055f),wood);segment.localRotation=Quaternion.Euler(0,0,-y*65);}
                Part(root,"弓弦",PrimitiveType.Cube,Vector3.zero,new Vector3(.012f,1.05f,.012f),new Color(.8f,.77f,.62f));
            }else{
                Part(root,"握柄",PrimitiveType.Cube,new Vector3(0,.1f,0),new Vector3(.075f,.4f,.075f),wood);
                if(recipe=="WPN006")Part(root,"斧刃",PrimitiveType.Cube,new Vector3(.13f,.55f,0),new Vector3(.4f,.35f,.1f),steel);
                else Part(root,"剑刃",PrimitiveType.Cube,new Vector3(0,.6f,0),new Vector3(.12f,.7f,.035f),recipe=="WPN001"||recipe=="WPN002"?wood:steel);
            }
            return root;
        }
        static Transform Part(GameObject root,string name,PrimitiveType type,Vector3 position,Vector3 scale,Color color){var part=GameObject.CreatePrimitive(type);part.name=name;part.transform.SetParent(root.transform,false);part.transform.localPosition=position;part.transform.localScale=scale;Destroy(part.GetComponent<Collider>());var renderer=part.GetComponent<Renderer>();if(!colors.TryGetValue(color,out var material)){var template=Resources.Load<Material>("VillageProp");if(template==null)throw new System.InvalidOperationException("Missing VillageProp URP material");material=new Material(template){color=color,enableInstancing=true};material.SetColor("_BaseColor",color);colors[color]=material;}renderer.sharedMaterial=material;return part.transform;}
        void LateUpdate(){var travel=(transform.position-previous).sqrMagnitude;previous=transform.position;if(legs==null)return;for(int i=0;i<legs.Length;i++)legs[i].localRotation=Quaternion.Euler(travel>.000001f?Mathf.Sin(Time.time*12+i%2*Mathf.PI)*22:0,0,0);}
    }
}
