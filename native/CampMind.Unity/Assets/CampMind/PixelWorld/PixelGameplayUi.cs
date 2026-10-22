using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using CampMind.Presentation;
namespace CampMind.PixelWorld
{
    // Map adapter only. The original NativeGameUi and NativeVillageUi own every toolbar and management window.
    public sealed class PixelGameplayUi:MonoBehaviour
    {
        PixelWorldClient client;PixelWorldView map;NativeCampView native;NativeVillageUi village;
        bool polling,installed,lastFollow;float nextWorld;Vector3 lastFocus;
        readonly Dictionary<string,SpriteRenderer> actors=new Dictionary<string,SpriteRenderer>();
        readonly Dictionary<string,Vector2> actorFacing=new Dictionary<string,Vector2>();
        readonly Dictionary<string,SpriteRenderer> markers=new Dictionary<string,SpriteRenderer>();
        public bool InputBlocked=>native!=null&&(native.InputBlocked||village?.ManagementPanelOpen==true);
        public bool Ready=>installed&&village?.Snapshot!=null;
        public NativeCampView OriginalView=>native;
        public void Initialize(PixelWorldClient source,PixelWorldView owner){client=source;map=owner;StartCoroutine(InstallOriginalUi());}
        IEnumerator InstallOriginalUi(){
            native=gameObject.AddComponent<NativeCampView>();native.enabled=false;
            if(GetComponent<NativeQualityView>()==null)gameObject.AddComponent<NativeQualityView>();
            var c=client.Connection;native.InitializeExternalMap(Camera.main,map.PlayerTransform,new Vector2(client.Manifest.village.x,client.Manifest.village.y),PixelProtocol.WorldYScale,c.endpoint,c.player,c.token);
            native.ExternalPan=(delta,height)=>map.Pan(delta,height);native.ExternalZoom=(delta,normalized)=>map.Zoom(delta,normalized);
            native.ExternalMapRender=map.RenderLocalMap;
            native.ExternalPickPoint=ray=>{var plane=new Plane(Vector3.forward,Vector3.zero);return plane.Raycast(ray,out var at)?(Vector2?)PixelProtocol.FromUnity(ray.GetPoint(at)):null;};
            native.focus=map.CameraFocus;lastFocus=native.focus;village=gameObject.AddComponent<NativeVillageUi>();
            yield return null;village.SetActive(true);
            while(village.Snapshot==null)yield return null;
            yield return LoadUiWorld();native.CompleteStartup();GetComponent<NativeGameUi>().SetVillageHud(true);installed=true;
        }
        public void OpenPage(string page){if(!Ready)return;var ui=GetComponent<NativeGameUi>();if(page=="模型")ui.ShowVillageSettings();else village.ShowManagement(page=="村民"||page=="背包"?"人物":page=="生产"?"制作":page);}
        IEnumerator LoadUiWorld(){polling=true;yield return client.FormalApi("pixel/ui-world",(json,error)=>{if(json!=null)native.PresentExternalWorld(JObject.Parse(json));else if(error!=null)Debug.LogWarning(error);});polling=false;nextWorld=Time.unscaledTime+.5f;}
        void Update(){if(client==null||!client.Formal||!client.Ready||native==null)return;
            if(installed&&!polling&&Time.unscaledTime>=nextWorld)StartCoroutine(LoadUiWorld());
            foreach(var a in client.Snapshot.actors??Array.Empty<PixelActor>()){
                if(a.id=="player")continue;
                if(!actors.TryGetValue(a.id,out var sprite)){sprite=map.CreateGameplayActor(a.id);actors[a.id]=sprite;sprite.transform.position=PixelProtocol.ToUnity(a.x,a.y);actorFacing[a.id]=Vector2.down;}
                var delta=PixelProtocol.ToUnity(a.x,a.y)-sprite.transform.position;bool moving=delta.sqrMagnitude>.0001f&&!client.Snapshot.paused;
                if(moving)actorFacing[a.id]=new Vector2(delta.x,-delta.y);map.PresentCompanion(sprite,a.id,actorFacing[a.id],moving);
                sprite.gameObject.SetActive(a.hp>0);sprite.transform.position=Vector3.Lerp(sprite.transform.position,PixelProtocol.ToUnity(a.x,a.y),1-Mathf.Exp(-Time.unscaledDeltaTime*15));
            }
            native.characters=new[]{map.PlayerTransform}.Concat(actors.Values.Select(s=>s.transform)).ToArray();
            var live=new HashSet<string>();foreach(var n in client.Snapshot.nodes??Array.Empty<PixelActor>()){
                live.Add(n.id);if(!markers.TryGetValue(n.id,out var sprite)){sprite=map.CreateGameplayProp(n.id,n.resource=="wood"?"oak":n.resource=="stone"?"rock":"berry",n.resource=="wood"?7:3);markers[n.id]=sprite;}
                sprite.transform.position=PixelProtocol.ToUnity(n.x,n.y);sprite.gameObject.SetActive(true);
            }
            foreach(var a in (client.Snapshot.wildlife??Array.Empty<PixelActor>()).Concat(client.Snapshot.enemies??Array.Empty<PixelActor>())){
                if(a.hp<=0&&a.amount<=0)continue;live.Add(a.id);if(!markers.TryGetValue(a.id,out var sprite)){sprite=map.CreateGameplayProp(a.id,"animal-"+(a.species??"boar"),a.species=="rabbit"?2:4);markers[a.id]=sprite;}
                var target=PixelProtocol.ToUnity(a.x,a.y);var delta=target-sprite.transform.position;
                if(delta.sqrMagnitude>64)sprite.transform.position=target;else sprite.transform.position=Vector3.Lerp(sprite.transform.position,target,1-Mathf.Exp(-Time.unscaledDeltaTime*12));
                map.PresentWildlife(sprite,a.species??"boar",client.Snapshot.paused?Vector3.zero:delta,a.hp>0);sprite.gameObject.SetActive(true);sprite.color=a.hp>0?Color.white:new Color(.6f,.5f,.4f);
            }
            foreach(var id in markers.Keys.Where(id=>!live.Contains(id)).ToArray()){Destroy(markers[id].gameObject);markers.Remove(id);}
        }
        void LateUpdate(){if(native==null)return;
            if(native.lordView!=lastFollow){lastFollow=native.lordView;map.FollowPlayer(lastFollow);}
            if((native.focus-lastFocus).sqrMagnitude>.001f)map.Observe(PixelProtocol.FromUnity(native.focus),Camera.main.orthographicSize);
            native.focus=map.CameraFocus;lastFocus=native.focus;
        }
        void OnDestroy(){foreach(var actor in actors.Values.Concat(markers.Values))if(actor!=null)Destroy(actor.gameObject);}
    }
}
