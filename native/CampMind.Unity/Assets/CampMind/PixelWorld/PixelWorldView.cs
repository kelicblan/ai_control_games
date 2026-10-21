using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
namespace CampMind.PixelWorld
{
    /// <summary>纯二维原生客户端。位置只来自地图宿主；勘察相机从不传送玩家。</summary>
    public sealed class PixelWorldView:MonoBehaviour
    {
        PixelWorldClient client;
        PixelChunkRenderer chunks;
        Camera cameraView;
        SpriteRenderer player;
        PixelManifest manifest;
        PixelRaster miniData;
        Texture2D atlasTexture,miniTexture;
        Vector2 focus;
        bool follow,fullMap,focused=true,miniBusy;
        string notice="正在连接二维地图宿主…",connectionFile;
        float nextMini;
        Vector2Int miniCell=new Vector2Int(-1,-1);
        Vector2 previousPlayer;
        GUIStyle titleStyle,textStyle,smallStyle;
        static readonly Color Panel=new Color(.045f,.09f,.075f,.95f),Gold=new Color(.76f,.65f,.37f);
        void Start()
        {
            cameraView=Camera.main;
            if(cameraView==null){var c=new GameObject("像素地图相机");c.tag="MainCamera";cameraView=c.AddComponent<Camera>();c.AddComponent<AudioListener>();}
            cameraView.orthographic=true;cameraView.orthographicSize=90;cameraView.nearClipPlane=.1f;cameraView.farClipPlane=200;
            cameraView.transform.rotation=Quaternion.identity;cameraView.clearFlags=CameraClearFlags.SolidColor;cameraView.backgroundColor=new Color(.08f,.14f,.10f);
            cameraView.transparencySortMode=TransparencySortMode.CustomAxis;cameraView.transparencySortAxis=Vector3.up;
            client=gameObject.AddComponent<PixelWorldClient>();chunks=gameObject.AddComponent<PixelChunkRenderer>();
            client.Notice+=message=>notice=message;chunks.Problem+=message=>notice=message;
            client.Changed+=()=>{if(manifest!=null)chunks.InvalidateNearby();};
            connectionFile=Environment.GetEnvironmentVariable("CAMP_PIXEL_CONNECTION");
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"-pixel-world-connection");if(index>=0&&index+1<args.Length)connectionFile=args[index+1];
            client.Begin(connectionFile);
        }
        void Initialize()
        {
            manifest=client.Manifest;chunks.Initialize(client,cameraView);
            if(player!=null)Destroy(player.gameObject);player=chunks.CreateActor("寨主（地图验收角色）","lord-front-0");
            player.transform.position=PixelProtocol.ToUnity(client.Snapshot.player.x,client.Snapshot.player.y);
            previousPlayer=new Vector2(client.Snapshot.player.x,client.Snapshot.player.y);focus=new Vector2(manifest.village.x,manifest.village.y);follow=false;
            miniCell=new Vector2Int(-1,-1);nextMini=0;
            notice="地图验收版：正式NPC、MLP与生产系统尚未切换到新坐标";
            StartCoroutine(client.Fetch<PixelRaster>("/atlas?size=512",data=>{if(data==null)return;PixelArtLibrary.Release(atlasTexture);atlasTexture=chunks.Raster(data);}));
        }
        void Update()
        {
            if(client==null||!client.Ready)return;
            if(manifest!=client.Manifest)Initialize();
            var keyboard=Keyboard.current;var mouse=Mouse.current;var move=Vector2.zero;
            if(focused&&keyboard!=null){
                if(keyboard.mKey.wasPressedThisFrame)fullMap=!fullMap;
                if(keyboard.escapeKey.wasPressedThisFrame)fullMap=false;
                if(keyboard.homeKey.wasPressedThisFrame)follow=true;
                if(!fullMap)move=new Vector2((keyboard.dKey.isPressed?1:0)-(keyboard.aKey.isPressed?1:0),(keyboard.sKey.isPressed?1:0)-(keyboard.wKey.isPressed?1:0));
                if(!fullMap&&keyboard.eKey.wasPressedThisFrame)client.Interact();
                if(!fullMap){var pan=new Vector2((keyboard.rightArrowKey.isPressed?1:0)-(keyboard.leftArrowKey.isPressed?1:0),(keyboard.downArrowKey.isPressed?1:0)-(keyboard.upArrowKey.isPressed?1:0));
                    if(pan.sqrMagnitude>0){follow=false;focus+=pan.normalized*Time.unscaledDeltaTime*(keyboard.leftShiftKey.isPressed?1200:80);}}
            }
            client.SetDirection(move);
            if(focused&&!fullMap&&mouse!=null){
                if(mouse.middleButton.isPressed){follow=false;var delta=mouse.delta.ReadValue()*2*cameraView.orthographicSize/Mathf.Max(1,Screen.height);focus+=new Vector2(-delta.x,delta.y);}
                float wheel=mouse.scroll.ReadValue().y;if(Mathf.Abs(wheel)>.01f)cameraView.orthographicSize*=wheel>0?.88f:1.14f;
            }
            var state=client.Snapshot;var position=new Vector2(state.player.x,state.player.y);var deltaPlayer=position-previousPlayer;
            if(move.sqrMagnitude>0)follow=true;
            if(deltaPlayer.sqrMagnitude>.0001f){
                string side=Mathf.Abs(deltaPlayer.x)>Mathf.Abs(deltaPlayer.y)?"side":deltaPlayer.y<0?"back":"front";
                player.sprite=chunks.Art.Get("lord-"+side+"-"+((int)(Time.unscaledTime*7)%2));player.flipX=side=="side"&&deltaPlayer.x<0;
            }
            player.transform.position=Vector3.Lerp(player.transform.position,PixelProtocol.ToUnity(position.x,position.y),1-Mathf.Exp(-Time.unscaledDeltaTime*18));
            previousPlayer=position;if(follow)focus=new Vector2(player.transform.position.x,-player.transform.position.y);
            focus.x=Mathf.Clamp(focus.x,0,31999);focus.y=Mathf.Clamp(focus.y,0,31999);
            cameraView.orthographicSize=Mathf.Clamp(cameraView.orthographicSize,16,Mathf.Max(16,Mathf.Min(120,384/Mathf.Max(1,cameraView.aspect))));
            cameraView.transform.position=new Vector3(Mathf.Round(focus.x*8)/8,-Mathf.Round(focus.y*8)/8,-100);chunks.UpdateStreaming();
            if(Time.unscaledTime>=nextMini&&!miniBusy){
                var cell=new Vector2Int(Mathf.FloorToInt(position.x/128),Mathf.FloorToInt(position.y/128));
                if(cell!=miniCell){miniBusy=true;StartCoroutine(LoadMini(position,cell));}nextMini=Time.unscaledTime+1;
            }
        }
        IEnumerator LoadMini(Vector2 p,Vector2Int cell)
        {
            yield return client.Fetch<PixelRaster>($"/minimap?x={(int)p.x}&y={(int)p.y}",data=>{
                if(data!=null){PixelArtLibrary.Release(miniTexture);miniTexture=chunks.Raster(data);miniData=data;miniCell=cell;}
            });miniBusy=false;
        }
        void OnApplicationFocus(bool value){focused=value;client?.SetDirection(Vector2.zero);}
        void OnDisable(){client?.SetDirection(Vector2.zero);}
        void Styles()
        {
            if(textStyle!=null)return;var font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular")??Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            textStyle=new GUIStyle(GUI.skin.label){font=font,fontSize=17,wordWrap=true};textStyle.normal.textColor=new Color(.91f,.91f,.80f);
            smallStyle=new GUIStyle(textStyle){fontSize=14};titleStyle=new GUIStyle(textStyle){fontSize=24,fontStyle=FontStyle.Bold};titleStyle.normal.textColor=Gold;
        }
        static void Fill(Rect rect,Color color){var previous=GUI.color;GUI.color=color;GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=previous;}
        static void Frame(Rect rect){Fill(rect,Panel);Fill(new Rect(rect.x,rect.y,rect.width,1),Gold);Fill(new Rect(rect.x,rect.yMax-1,rect.width,1),Gold);Fill(new Rect(rect.x,rect.y,1,rect.height),Gold);Fill(new Rect(rect.xMax-1,rect.y,1,rect.height),Gold);}
        void OnGUI()
        {
            Styles();Frame(new Rect(16,14,510,74));GUI.Label(new Rect(30,20,480,33),"一寨之主 · 二维像素地图",titleStyle);
            GUI.Label(new Rect(30,54,490,25),"32 × 32 公里  /  独立地图验收，不修改正式存档",smallStyle);
            if(client==null||!client.Ready){Frame(new Rect(30,115,680,120));GUI.Label(new Rect(45,129,650,68),client?.Error??notice,textStyle);
                if(client!=null&&GUI.Button(new Rect(45,201,130,26),"重新连接"))client.Begin(connectionFile);return;}
            var s=client.Snapshot;
            Frame(new Rect(Screen.width-302,14,286,110));GUI.Label(new Rect(Screen.width-288,24,264,26),$"坐标  {s.player.x:F0}, {s.player.y:F0} 米",textStyle);
            GUI.Label(new Rect(Screen.width-288,53,264,24),$"载入 {chunks.LoadedChunks} 块  ·  {(follow?"人物跟随":"地图勘察")}",smallStyle);
            if(GUI.Button(new Rect(Screen.width-288,85,119,27),"观察村寨")){follow=false;focus=new Vector2(manifest.village.x,manifest.village.y);}
            if(GUI.Button(new Rect(Screen.width-160,85,128,27),"M 区域全图"))fullMap=!fullMap;
            MiniMap(s);
            Frame(new Rect(16,Screen.height-104,Screen.width-32,88));
            var names=new[]{"木材","石料","纤维","食物","金矿石"};string inventory="地图采集验证： ";
            for(int i=0;i<Mathf.Min(names.Length,s.inventory?.Length??0);i++)inventory+=names[i]+" "+s.inventory[i].amount+"    ";
            GUI.Label(new Rect(30,Screen.height-97,Screen.width-60,25),inventory,textStyle);
            GUI.Label(new Rect(30,Screen.height-70,Screen.width-60,23),"WASD 行走  ·  E 采集/寨门  ·  滚轮缩放  ·  中键/方向键勘察  ·  Shift 加速勘察  ·  Home 跟随",smallStyle);
            GUI.Label(new Rect(30,Screen.height-45,Screen.width-60,23),client.Error??notice,smallStyle);
            if(fullMap)FullMap(s);
        }
        void MiniMap(PixelSnapshot state)
        {
            var rect=new Rect(16,102,180,180);Frame(rect);
            if(miniTexture==null||miniData==null)return;
            var map=new Rect(22,108,168,168);GUI.DrawTexture(map,miniTexture,ScaleMode.StretchToFill);
            float x=map.x+(state.player.x-miniData.x+512)/1024*map.width,y=map.y+(state.player.y-miniData.y+512)/1024*map.height;
            Fill(new Rect(x-3,y-3,6,6),Gold);GUI.Label(new Rect(map.x+4,map.y+2,45,23),"北 ↑",smallStyle);
            var v=manifest.village;var box=new Rect(map.x+(v.x-v.width/2-miniData.x+512)/1024*map.width,map.y+(v.y-v.height/2-miniData.y+512)/1024*map.height,v.width/1024*map.width,v.height/1024*map.height);
            if(map.Contains(box.min)&&map.Contains(box.max)){var old=GUI.color;GUI.color=Gold;GUI.Box(box,GUIContent.none);GUI.color=old;}
        }
        void FullMap(PixelSnapshot state)
        {
            Fill(new Rect(0,0,Screen.width,Screen.height),new Color(0,0,0,.7f));
            float size=Mathf.Min(Screen.height-150,Screen.width-360);var map=new Rect((Screen.width-size)/2,95,size,size);
            Frame(new Rect(map.x-16,40,size+32,size+88));GUI.Label(new Rect(map.x,48,size,36),"初始区域规划 · 32,000 × 32,000 米",titleStyle);
            if(atlasTexture!=null)GUI.DrawTexture(map,atlasTexture,ScaleMode.StretchToFill);
            foreach(var point in manifest.landmarks){float x=map.x+point.x/32000*size,y=map.y+point.y/32000*size;Fill(new Rect(x-2,y-2,4,4),Gold);GUI.Label(new Rect(x+5,y-9,140,24),point.name,smallStyle);}
            float px=map.x+state.player.x/32000*size,py=map.y+state.player.y/32000*size;Fill(new Rect(px-3,py-3,6,6),Color.white);
            GUI.Label(new Rect(map.x,map.yMax+5,size,28),$"已探索 {(state.explored?.Length??0)/62500f:P2} · 点击只移动勘察相机，不传送人物",smallStyle);
            if(Event.current.type==EventType.MouseDown&&Event.current.button==0&&map.Contains(Event.current.mousePosition)){
                var p=Event.current.mousePosition;focus=new Vector2((p.x-map.x)/size*32000,(p.y-map.y)/size*32000);follow=false;fullMap=false;Event.current.Use();
            }
            if(GUI.Button(new Rect(map.xMax-70,49,70,28),"关闭"))fullMap=false;
        }
        void OnDestroy(){PixelArtLibrary.Release(atlasTexture);PixelArtLibrary.Release(miniTexture);}
    }
}
