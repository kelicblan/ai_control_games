using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    [Serializable] public sealed class ResourceVisual{public string id;public Transform root,crop;}
    [Serializable] public sealed class AnimalVisual{public string id;public Transform root,head;public Transform[] legs;}
    public sealed class NativeWildernessView:MonoBehaviour
    {
        public ResourceVisual[] resources=Array.Empty<ResourceVisual>();
        public AnimalVisual[] animals=Array.Empty<AnimalVisual>();
        public NativeCampView view;
        readonly Dictionary<string,JToken> resourceStates=new Dictionary<string,JToken>(),animalStates=new Dictionary<string,JToken>();
        Vector2[] observers=Array.Empty<Vector2>();bool playing,connected;
        public int ResourceSnapshotCount=>resourceStates.Count;
        public int AnimalSnapshotCount=>animalStates.Count;
        static Vector2 Point(JToken p)=>new Vector2((float)p["x"],(float)p["y"]);
        public static bool AnimalVisible(Vector2 position,float health,Vector2 focus,Vector2[] observers)=>health>0&&(position-focus).sqrMagnitude<380*380&&observers.Any(o=>(o-position).sqrMagnitude<110*110);
        public void SetSnapshot(JObject state)
        {
            resourceStates.Clear();animalStates.Clear();connected=state?["world"]?["ecology"] is JObject;playing=(string)state?["status"]=="playing";
            if(!connected){observers=Array.Empty<Vector2>();return;}
            foreach(var r in state["world"]["ecology"]["resources"])resourceStates[(string)r["id"]]=r;
            foreach(var a in state["world"]["ecology"]["animals"])animalStates[(string)a["id"]]=a;
            var people=(state["npcs"]??new JArray()).Where(n=>(bool?)n["alive"]!=false).Select(n=>Point(n["position"])).ToList();
            if(state["lord"]?["position"]!=null)people.Add(Point(state["lord"]["position"]));observers=people.ToArray();
        }
        static Vector3 Ground(Vector2 p,float fallback)
        {
            var world=new Vector3(p.x,fallback,p.y);if(Physics.Raycast(world+Vector3.up*500,Vector3.down,out var hit,1000,1<<9))world.y=hit.point.y;return world;
        }
        public void Present(float dt,double time)
        {
            var focus=view==null?Vector2.zero:new Vector2((view.lordView?view.lord.position:view.focus).x,(view.lordView?view.lord.position:view.focus).z);
            foreach(var visual in resources){
                if(!connected||!resourceStates.TryGetValue(visual.id,out var r)){visual.root.gameObject.SetActive(false);continue;}
                var p=Point(r["position"]);visual.root.gameObject.SetActive((p-focus).sqrMagnitude<600*600);var remaining=(float)r["remaining"];visual.crop.gameObject.SetActive(remaining>0);
                visual.crop.localScale=Vector3.one*((string)r["kind"]=="wood"?1:.4f+.6f*remaining/(float)r["capacity"]);
            }
            foreach(var visual in animals){
                if(!connected||!animalStates.TryGetValue(visual.id,out var a)){visual.root.gameObject.SetActive(false);continue;}
                var point=Point(a["position"]);var visible=AnimalVisible(point,(float)a["health"],focus,observers);var wasVisible=visual.root.gameObject.activeSelf;visual.root.gameObject.SetActive(visible);if(!visible)continue;
                var mode=(string)a["mode"];var moving=mode!="idle";var phase=playing?time*(mode=="flee"||mode=="charge"?12:5):0;
                var target=Ground(point,visual.root.position.y);if(moving)target.y+=(float)Math.Abs(Math.Sin(phase))*.13f;
                visual.root.position=wasVisible?Vector3.Lerp(visual.root.position,target,1-Mathf.Exp(-dt*15)):target;visual.root.rotation=Quaternion.Euler(0,90-(float)a["heading"]*Mathf.Rad2Deg,0);
                for(var i=0;i<visual.legs.Length;i++)visual.legs[i].localRotation=Quaternion.Euler(moving?(float)Math.Sin(phase+(i%2!=0?Math.PI:0)+(i>1?Math.PI:0))*.55f*Mathf.Rad2Deg:0,0,0);
                visual.head.localRotation=Quaternion.Euler(mode=="graze"?.25f*Mathf.Rad2Deg:0,0,0);
            }
        }
        void LateUpdate(){Present(Time.unscaledDeltaTime,Time.timeAsDouble);}
    }
}
