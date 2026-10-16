using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    [Serializable] public sealed class ResourceVisual{public string id;public Transform root,crop;[NonSerialized]public float shownRemaining=float.NaN;}
    [Serializable] public sealed class AnimalVisual{public string id;public Transform root,head;public Transform[] legs;}
    public sealed class NativeWildernessView:MonoBehaviour
    {
        public ResourceVisual[] resources=Array.Empty<ResourceVisual>();
        public AnimalVisual[] animals=Array.Empty<AnimalVisual>();
        public NativeCampView view;
        readonly Dictionary<string,CampRenderFrame.Resource> resourceStates=new Dictionary<string,CampRenderFrame.Resource>();
        readonly Dictionary<string,CampRenderFrame.Animal> animalStates=new Dictionary<string,CampRenderFrame.Animal>();
        Vector2[] observers=Array.Empty<Vector2>();bool playing,connected;
        public int ResourceSnapshotCount=>resourceStates.Count;
        public int AnimalSnapshotCount=>animalStates.Count;
        Vector2 Point(Vector2 logical){var space=view!=null?view.Space:new WorldVisualSpace(Vector2.zero);var world=space.ToUnity(logical,0);return new Vector2(world.x,world.z);}
        public static bool AnimalVisible(Vector2 position,float health,Vector2 focus,Vector2[] observers){if(health<=0||(position-focus).sqrMagnitude>=380*380)return false;foreach(var observer in observers)if((observer-position).sqrMagnitude<110*110)return true;return false;}
        public void SetSnapshot(JObject state){SetFrame(CampRenderFrame.FromState(state));}
        public void SetFrame(CampRenderFrame frame)
        {
            resourceStates.Clear();animalStates.Clear();connected=frame!=null&&frame.HasEcology;playing=frame?.Status=="playing";
            if(!connected){observers=Array.Empty<Vector2>();return;}
            foreach(var r in frame.Resources)resourceStates[r.Id]=r;foreach(var a in frame.Animals)animalStates[a.Id]=a;
            var people=new List<Vector2>(frame.Actors.Count+1);foreach(var actor in frame.Actors)if(actor.Alive)people.Add(Point(actor.Position));
            if(frame.HasLord)people.Add(Point(frame.Lord));observers=people.ToArray();
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
                var p=Point(r.Position);var visible=(p-focus).sqrMagnitude<600*600;if(visual.root.gameObject.activeSelf!=visible)visual.root.gameObject.SetActive(visible);
                if(visual.shownRemaining!=r.Remaining){visual.shownRemaining=r.Remaining;visual.crop.gameObject.SetActive(r.Remaining>0);visual.crop.localScale=Vector3.one*(r.Kind=="wood"?1:.4f+.6f*r.Remaining/r.Capacity);}
            }
            foreach(var visual in animals){
                if(!connected||!animalStates.TryGetValue(visual.id,out var a)){visual.root.gameObject.SetActive(false);continue;}
                var point=Point(a.Position);var visible=AnimalVisible(point,a.Health,focus,observers);var wasVisible=visual.root.gameObject.activeSelf;if(wasVisible!=visible)visual.root.gameObject.SetActive(visible);if(!visible)continue;
                var mode=a.Mode;var moving=mode!="idle";var phase=playing?time*(mode=="flee"||mode=="charge"?12:5):0;
                var target=Ground(point,visual.root.position.y);if(moving)target.y+=(float)Math.Abs(Math.Sin(phase))*.13f;
                visual.root.position=wasVisible?Vector3.Lerp(visual.root.position,target,1-Mathf.Exp(-dt*15)):target;visual.root.localRotation=Quaternion.Euler(0,90-a.Heading*Mathf.Rad2Deg,0);
                for(var i=0;i<visual.legs.Length;i++)visual.legs[i].localRotation=Quaternion.Euler(moving?(float)Math.Sin(phase+(i%2!=0?Math.PI:0)+(i>1?Math.PI:0))*.55f*Mathf.Rad2Deg:0,0,0);
                visual.head.localRotation=Quaternion.Euler(mode=="graze"?.25f*Mathf.Rad2Deg:0,0,0);
            }
        }
        void LateUpdate(){Present(Time.unscaledDeltaTime,view!=null?view.VisualTime:Time.timeAsDouble);}
    }
}
