using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using CampMind.Presentation;
namespace CampMind.PixelWorld
{
    /// <summary>纯二维原生客户端。位置只来自地图宿主；勘察相机从不传送玩家。</summary>
    public sealed class PixelWorldView:MonoBehaviour
    {
        PixelWorldClient client;
        PixelGameplayUi gameplay;
        PixelChunkRenderer chunks;
        Camera cameraView;
        SpriteRenderer player;
        PixelManifest manifest;
        PixelRaster miniData,atlasData;
        Texture2D atlasTexture,miniTexture,regionTexture;SpriteRenderer atlasGround,regionGround;
        bool regionBusy;string regionKey;float nextRegion;
        public bool OverviewActive=>cameraView!=null&&cameraView.orthographicSize>Mathf.Min(180,384/Mathf.Max(1,cameraView.aspect));
        public bool OverviewReady=>atlasGround!=null&&atlasGround.sprite!=null;
        public float ZoomSize=>cameraView.orthographicSize;
        public float ViewAngle=>cameraView==null?0:cameraView.transform.eulerAngles.z;
        public void RotateView(float delta){if(cameraView!=null&&float.IsFinite(delta))cameraView.transform.rotation=Quaternion.Euler(0,0,ViewAngle-delta*.3f);}
        public void ExportAtlas(string path){if(atlasTexture!=null)File.WriteAllBytes(path,atlasTexture.EncodeToPNG());}
        Vector2 focus;
        bool follow,fullMap,focused=true,miniBusy;
        bool screenSettings;
        string notice="正在连接二维地图宿主…",connectionFile;
        float nextMini,pauseHintUntil;
        Vector2Int miniCell=new Vector2Int(-1,-1);
        Vector2 previousPlayer;
        GUIStyle titleStyle,textStyle,smallStyle;
        static readonly Color Panel=new Color(.045f,.09f,.075f,.95f),Gold=new Color(.76f,.65f,.37f);
        public bool MapReady=>client!=null&&client.Ready&&manifest!=null;
        public bool AutomatedCapture {get;set;}
        public int LoadedChunks=>chunks?.LoadedChunks??0;
        public Transform PlayerTransform=>player?.transform;
        public Vector3 CameraFocus=>PixelProtocol.ToUnity(focus.x,focus.y);
        public void FollowPlayer(bool enabled){follow=enabled;}
        public void Pan(Vector2 delta,int height){follow=false;var units=2*cameraView.orthographicSize/Mathf.Max(1,height);focus+=PixelProtocol.ScreenDirection(new Vector2(-delta.x,delta.y),ViewAngle)*units;}
        public void Zoom(float delta,bool normalized){if(!float.IsFinite(delta)||cameraView==null)return;cameraView.orthographicSize=Mathf.Clamp(cameraView.orthographicSize*Mathf.Exp(Mathf.Clamp(-delta*(normalized?.16f:.001333333f),-1,1)),8,PixelProtocol.FullRegionZoom(cameraView.aspect));}
        public void ShowWholeRegion(){cameraView.transform.rotation=Quaternion.identity;Observe(new Vector2(16000,16000),PixelProtocol.FullRegionZoom(cameraView.aspect));}
        public SpriteRenderer CreateGameplayActor(string name){var actor=chunks.CreateActor(name,"lord-front-0");actor.sprite=chunks.Art.Actor(false,0);actor.transform.localScale=Vector3.one*(4.8f*8/actor.sprite.rect.width);return actor;}
        public void PresentCompanion(SpriteRenderer actor,string id,Vector2 movement,bool moving)
        {
            int direction=Mathf.Abs(movement.x)>Mathf.Abs(movement.y)?1:movement.y<0?2:0;
            actor.sprite=chunks.Art.Companion(id,direction,moving,moving?(int)(Time.unscaledTime*6):0);actor.flipX=direction==1&&movement.x<0;actor.color=Color.white;
            actor.transform.localScale=Vector3.one*(5.4f*8/actor.sprite.rect.width);
        }
        public void PresentWildlife(SpriteRenderer animal,string species,Vector3 delta,bool alive)
        {
            bool moving=alive&&delta.sqrMagnitude>.0001f;animal.sprite=chunks.Art.Wildlife(species,moving?(int)(Time.unscaledTime*7):0);
            if(moving)animal.flipX=delta.x<0;float width=species=="rabbit"?2.5f:species=="pheasant"?2.7f:species=="bear"?6:species=="tiger"?5.7f:5;
            animal.transform.localScale=Vector3.one*(width*8/animal.sprite.rect.width);
        }
        public SpriteRenderer CreateGameplayProp(string name,string kind,float width){var sprite=chunks.CreateActor(name,kind);sprite.transform.localScale=Vector3.one*(width*8/sprite.sprite.rect.width);return sprite;}
        public void Observe(Vector2 point,float halfHeight){follow=false;focus=point;cameraView.orthographicSize=halfHeight;}
        public void ShowRegionMap(bool visible){fullMap=visible;}
        public void RenderLocalMap(Action render)
        {
            if(chunks==null){render();return;}
            bool atlas=atlasGround!=null&&atlasGround.enabled,region=regionGround!=null&&regionGround.enabled;float alpha=chunks.TerrainBlend;
            try{if(atlasGround!=null)atlasGround.enabled=false;if(regionGround!=null)regionGround.enabled=false;chunks.SetTerrainBlend(1);render();}
            finally{chunks.SetTerrainBlend(alpha);if(atlasGround!=null)atlasGround.enabled=atlas;if(regionGround!=null)regionGround.enabled=region;}
        }
        void Start()
        {
            cameraView=Camera.main;
            if(cameraView==null){var c=new GameObject("像素地图相机");c.tag="MainCamera";cameraView=c.AddComponent<Camera>();c.AddComponent<AudioListener>();}
            cameraView.orthographic=true;cameraView.orthographicSize=155;cameraView.nearClipPlane=.1f;cameraView.farClipPlane=200;
            cameraView.transform.rotation=Quaternion.identity;cameraView.clearFlags=CameraClearFlags.SolidColor;cameraView.backgroundColor=new Color(.08f,.14f,.10f);
            cameraView.transparencySortMode=TransparencySortMode.CustomAxis;cameraView.transparencySortAxis=Vector3.up;
            client=gameObject.AddComponent<PixelWorldClient>();chunks=gameObject.AddComponent<PixelChunkRenderer>();
            gameObject.AddComponent<PixelWeatherView>().Initialize(cameraView);
            client.Notice+=message=>notice=message;chunks.Problem+=message=>notice=message;
            client.Changed+=()=>{if(manifest!=null)chunks.InvalidateNearby();};
            connectionFile=Environment.GetEnvironmentVariable("CAMP_PIXEL_CONNECTION");
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"-pixel-world-connection");if(index>=0&&index+1<args.Length)connectionFile=args[index+1];
            client.Begin(connectionFile);
            if(Array.IndexOf(args,"-pixel-visual-probe")>=0){AutomatedCapture=true;gameObject.AddComponent<PixelMapVisualProbe>();}
            if(Array.IndexOf(args,"-pixel-gameplay-probe")>=0)gameObject.AddComponent<PixelGameplayProbe>();
        }
        void Initialize()
        {
            manifest=client.Manifest;chunks.Initialize(client,cameraView);
            if(player!=null)Destroy(player.gameObject);player=chunks.CreateActor("player","lord-front-0");
            player.transform.position=PixelProtocol.ToUnity(client.Snapshot.player.x,client.Snapshot.player.y);
            previousPlayer=new Vector2(client.Snapshot.player.x,client.Snapshot.player.y);focus=new Vector2(manifest.village.x,manifest.village.y-10);follow=false;
            if(client.Formal&&gameplay==null){gameplay=gameObject.AddComponent<PixelGameplayUi>();gameplay.Initialize(client,this);}
            miniCell=new Vector2Int(-1,-1);nextMini=0;
            notice=client.Formal?"已连接正式玩法 · B 营地管理 · 库存与村民来自原正式存档":"二维地图独立模式";
            if(!string.IsNullOrEmpty(client.Snapshot.migrationNotice))notice=client.Snapshot.migrationNotice;
            StartCoroutine(LoadAtlas());
        }
        void Update()
        {
            if(client==null||!client.Ready)return;
            if(manifest!=client.Manifest)Initialize();
            client.SetObservation(focus.x,focus.y,cameraView.orthographicSize*2*Mathf.Max(cameraView.aspect,1/PixelProtocol.WorldYScale));
            var atmosphere=GetComponent<NativeVillageUi>()?.Snapshot?["atmosphere"];
            chunks.SetWind((float?)atmosphere?["windStrength"]??0,(float?)atmosphere?["windAngle"]??0);
            var keyboard=Keyboard.current;var mouse=Mouse.current;var move=Vector2.zero;
            if((focused||InputSystem.settings.backgroundBehavior==InputSettings.BackgroundBehavior.IgnoreFocus)&&keyboard!=null&&!AutomatedCapture&&!screenSettings&&gameplay?.InputBlocked!=true){
                if(keyboard.mKey.wasPressedThisFrame){if(gameplay?.Ready==true)GetComponent<NativeGameUi>().ShowVillageMap();else fullMap=!fullMap;}
                if(keyboard.bKey.wasPressedThisFrame&&gameplay?.Ready==true)gameplay.OpenPage("营地");
                if(keyboard.tabKey.wasPressedThisFrame&&gameplay?.OriginalView!=null)gameplay.OriginalView.lordView=!gameplay.OriginalView.lordView;
                if(keyboard.escapeKey.wasPressedThisFrame)fullMap=false;
                if(keyboard.homeKey.wasPressedThisFrame){follow=true;cameraView.transform.rotation=Quaternion.identity;}
                if(!fullMap)move=new Vector2((keyboard.dKey.isPressed?1:0)-(keyboard.aKey.isPressed?1:0),(keyboard.sKey.isPressed?1:0)-(keyboard.wKey.isPressed?1:0));
                // WASD always controls the authoritative player, independent of camera mode.
                if(move.sqrMagnitude>0){move=PixelProtocol.ScreenDirection(move,ViewAngle).normalized;if(gameplay?.OriginalView!=null)gameplay.OriginalView.lordView=true;}
                if(!fullMap&&keyboard.eKey.wasPressedThisFrame)client.Interact();
                if(!fullMap){var pan=new Vector2((keyboard.rightArrowKey.isPressed?1:0)-(keyboard.leftArrowKey.isPressed?1:0),(keyboard.downArrowKey.isPressed?1:0)-(keyboard.upArrowKey.isPressed?1:0));
                    if(pan.sqrMagnitude>0){follow=false;focus+=PixelProtocol.ScreenDirection(pan,ViewAngle).normalized*Time.unscaledDeltaTime*(keyboard.leftShiftKey.isPressed?1200:80);}}
            }
            if(move.sqrMagnitude>0&&client.Snapshot.paused){move=Vector2.zero;pauseHintUntil=Time.unscaledTime+2;}
            client.SetDirection(move);
            if((focused||InputSystem.settings.backgroundBehavior==InputSettings.BackgroundBehavior.IgnoreFocus)&&!fullMap&&!screenSettings&&mouse!=null&&!AutomatedCapture&&gameplay?.InputBlocked!=true&&gameplay?.OriginalView?.PointerBlocked!=true){
                if(mouse.middleButton.isPressed)Pan(mouse.delta.ReadValue(),Screen.height);
                if(mouse.rightButton.isPressed)RotateView(mouse.delta.ReadValue().x);
                float wheel=mouse.scroll.ReadValue().y;if(Mathf.Abs(wheel)>.001f)Zoom(wheel,InputSystem.settings.scrollDeltaBehavior==InputSettings.ScrollDeltaBehavior.UniformAcrossAllPlatforms);
            }
            var state=client.Snapshot;var position=new Vector2(state.player.x,state.player.y);var deltaPlayer=position-previousPlayer;
            if(move.sqrMagnitude>0)follow=true;
            if(deltaPlayer.sqrMagnitude>.0001f){
                string side=Mathf.Abs(deltaPlayer.x)>Mathf.Abs(deltaPlayer.y)?"side":deltaPlayer.y<0?"back":"front";
                player.sprite=chunks.Art.Get("lord-"+side+"-"+((int)(Time.unscaledTime*7)%2));player.flipX=side=="side"&&deltaPlayer.x<0;
            }
            player.sprite=chunks.Art.Actor(move.sqrMagnitude>0,(int)(Time.unscaledTime*10));
            player.transform.localScale=Vector3.one*(4.8f*8/player.sprite.rect.width);
            player.transform.position=Vector3.Lerp(player.transform.position,PixelProtocol.ToUnity(position.x,position.y),1-Mathf.Exp(-Time.unscaledDeltaTime*18));
            previousPlayer=position;if(follow)focus=PixelProtocol.FromUnity(player.transform.position);
            focus.x=Mathf.Clamp(focus.x,0,31999);focus.y=Mathf.Clamp(focus.y,0,31999);
            cameraView.orthographicSize=Mathf.Clamp(cameraView.orthographicSize,8,PixelProtocol.FullRegionZoom(cameraView.aspect));
            var extents=PixelProtocol.ViewExtents(cameraView.orthographicSize,cameraView.aspect,ViewAngle);float halfX=extents.x,halfY=extents.y;
            focus.x=halfX>=16000?16000:Mathf.Clamp(focus.x,halfX,32000-halfX);focus.y=halfY>=16000?16000:Mathf.Clamp(focus.y,halfY,32000-halfY);
            var cameraPoint=PixelProtocol.ToUnity(Mathf.Round(focus.x*8)/8,Mathf.Round(focus.y*8)/8);cameraPoint.z=-100;cameraView.transform.position=cameraPoint;chunks.SetDetailVisible(true);chunks.UpdateStreaming();UpdateRegionRaster();chunks.SetTerrainBlend(OverviewActive&&((regionGround!=null&&regionGround.enabled)||OverviewReady)?1-Mathf.InverseLerp(220,700,cameraView.orthographicSize):1);
            if(Time.unscaledTime>=nextMini&&!miniBusy){
                var cell=new Vector2Int(Mathf.FloorToInt(position.x/128),Mathf.FloorToInt(position.y/128));
                if(cell!=miniCell){miniBusy=true;StartCoroutine(LoadMini(position,cell));}nextMini=Time.unscaledTime+1;
            }
        }
        IEnumerator LoadAtlas(){
            for(int attempt=0;attempt<4&&!OverviewReady;attempt++){
                yield return client.Fetch<PixelRaster>("/atlas?size=1024",data=>{if(data==null)return;atlasData=data;PixelArtLibrary.Release(atlasTexture);atlasTexture=chunks.Raster(data);if(atlasGround==null)atlasGround=chunks.CreateActor("完整32公里地形","rock");PlaceRaster(atlasGround,atlasTexture,0,0,32000,-200);});
                if(!OverviewReady)yield return new WaitForSecondsRealtime(1);
            }
        }
        void PlaceRaster(SpriteRenderer renderer,Texture2D texture,float x,float y,float span,int order){if(renderer.sprite!=null&&renderer.sprite.texture==regionTexture)PixelArtLibrary.Release(renderer.sprite);renderer.sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(0,1),texture.width/span,0,SpriteMeshType.FullRect);renderer.sortingOrder=order;renderer.transform.position=PixelProtocol.ToUnity(x,y);renderer.transform.localScale=new Vector3(1,PixelProtocol.WorldYScale,1);}
        void UpdateRegionRaster(){if(regionGround!=null)regionGround.enabled=OverviewActive;if(!OverviewActive||regionBusy||Time.unscaledTime<nextRegion)return;
            int span=Mathf.Min(32000,Mathf.NextPowerOfTwo(Mathf.CeilToInt(Mathf.Max(cameraView.orthographicSize*cameraView.aspect,cameraView.orthographicSize/PixelProtocol.WorldYScale)*3)));
            if(span==32000){if(regionGround!=null)regionGround.enabled=false;return;}int step=span/4,x=Mathf.Clamp(Mathf.RoundToInt(focus.x/step)*step,0,32000),y=Mathf.Clamp(Mathf.RoundToInt(focus.y/step)*step,0,32000);var key=x+":"+y+":"+span;if(key==regionKey)return;
            regionBusy=true;nextRegion=Time.unscaledTime+.4f;StartCoroutine(client.Fetch<PixelRaster>($"/viewport?x={x}&y={y}&span={span}&size=512",data=>{regionBusy=false;if(data==null)return;if(regionGround==null)regionGround=chunks.CreateActor("区域远景地形","rock");if(regionGround.sprite!=null&&regionGround.sprite.texture==regionTexture)PixelArtLibrary.Release(regionGround.sprite);PixelArtLibrary.Release(regionTexture);regionTexture=chunks.Raster(data);PlaceRaster(regionGround,regionTexture,data.x,data.y,data.span,-150);regionGround.enabled=OverviewActive;regionKey=key;}));
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
            smallStyle=new GUIStyle(textStyle){fontSize=client?.Formal==true?21:14};if(client?.Formal==true)textStyle.fontSize=26;titleStyle=new GUIStyle(textStyle){fontSize=24,fontStyle=FontStyle.Bold};titleStyle.normal.textColor=Gold;
        }
        static void Fill(Rect rect,Color color){var previous=GUI.color;GUI.color=color;GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=previous;}
        static void Frame(Rect rect){Fill(rect,Panel);Fill(new Rect(rect.x,rect.y,rect.width,1),Gold);Fill(new Rect(rect.x,rect.yMax-1,rect.width,1),Gold);Fill(new Rect(rect.x,rect.y,1,rect.height),Gold);Fill(new Rect(rect.xMax-1,rect.y,1,rect.height),Gold);}
        void OnGUI()
        {
            if(client?.Formal==true){if(Time.unscaledTime<pauseHintUntil){Styles();var hint=new Rect(Screen.width/2-230,Screen.height-230,460,36);Frame(hint);GUI.Label(hint,"游戏已暂停，请先继续时间再移动",textStyle);}if(OverviewActive&&manifest!=null){Styles();foreach(var point in manifest.landmarks){var p=cameraView.WorldToScreenPoint(PixelProtocol.ToUnity(point.x,point.y));if(p.z>0&&p.x>100&&p.x<Screen.width-100&&p.y>100&&p.y<Screen.height-100){var rect=new Rect(p.x+22,Screen.height-p.y+18,150,24);Frame(rect);GUI.Label(rect,point.name,smallStyle);}}GUI.Label(new Rect(Screen.width-430,Screen.height-180,420,34),"全域 32 km × 32 km · 滚轮缩放",textStyle);}return;}
            GUI.depth=0;
            Styles();
            if(!AutomatedCapture&&GUI.Button(new Rect(540,22,130,32),"屏幕设置"))screenSettings=!screenSettings;
            if(screenSettings){ScreenSettings();return;}
            Styles();Frame(new Rect(16,14,510,74));GUI.Label(new Rect(30,20,480,33),"一寨之主 · 二维像素地图",titleStyle);
            GUI.Label(new Rect(30,54,490,25),client?.Formal==true?"32 × 32 公里 / 正式世界 · NPC与生产已连接":"32 × 32 公里 / 独立地图模式",smallStyle);
            if(client==null||!client.Ready){Frame(new Rect(30,115,680,120));GUI.Label(new Rect(45,129,650,68),client?.Error??notice,textStyle);
                if(client!=null&&GUI.Button(new Rect(45,201,130,26),"重新连接"))client.Begin(connectionFile);return;}
            var s=client.Snapshot;
            Frame(new Rect(Screen.width-302,14,286,110));GUI.Label(new Rect(Screen.width-288,24,264,26),$"坐标  {s.player.x:F0}, {s.player.y:F0} 米",textStyle);
            GUI.Label(new Rect(Screen.width-288,53,264,24),$"载入 {chunks.LoadedChunks} 块  ·  {(follow?"人物跟随":"地图勘察")}",smallStyle);
            if(GUI.Button(new Rect(Screen.width-288,85,119,27),"观察村寨")&&!AutomatedCapture){follow=false;focus=new Vector2(manifest.village.x,manifest.village.y);}
            if(GUI.Button(new Rect(Screen.width-160,85,128,27),"M 区域全图")&&!AutomatedCapture)fullMap=!fullMap;
            MiniMap(s);
            WorldLabels();
            Frame(new Rect(16,Screen.height-104,Screen.width-32,88));
            var names=client.Formal?new[]{"木材","石料","绳索","粮食","肉类"}:new[]{"木材","石料","纤维","食物","金矿石"};string inventory=client.Formal?"公共库存： ":"地图物资： ";
            for(int i=0;i<Mathf.Min(names.Length,s.inventory?.Length??0);i++)inventory+=names[i]+" "+s.inventory[i].amount+"    ";
            GUI.Label(new Rect(30,Screen.height-97,Screen.width-60,25),inventory,textStyle);
            GUI.Label(new Rect(30,Screen.height-70,Screen.width-60,23),"WASD 行走  ·  E 采集/寨门  ·  滚轮缩放  ·  中键/方向键勘察  ·  Shift 加速勘察  ·  Home 跟随",smallStyle);
            GUI.Label(new Rect(30,Screen.height-45,Screen.width-60,23),client.Error??notice,smallStyle);
            if(fullMap)FullMap(s);
        }
        void ScreenSettings()
        {
            float width=Mathf.Min(480,Screen.width-32),x=(Screen.width-width)/2,y=Mathf.Max(65,(Screen.height-290)/2);
            Frame(new Rect(x,y,width,290));
            GUI.Label(new Rect(x+20,y+15,width-40,35),"屏幕模式",titleStyle);
            var names=new[]{"初始窗口模式 · 1920 × 1080","最大化窗口模式 · 保留任务栏","全屏模式 · 占满屏幕"};
            var style=new GUIStyle(GUI.skin.button){font=textStyle.font,fontSize=16};
            for(int i=0;i<3;i++){
                var mode=(GameScreenMode)i;
                if(GUI.Button(new Rect(x+20,y+60+i*49,width-40,40),(NativeDisplaySettings.Current==mode?"✓  ":"")+names[i],style))NativeDisplaySettings.Apply(mode);
            }
            GUI.Label(new Rect(x+20,y+211,width-40,25),"立即生效，自动记住选择；首次默认窗口模式。",smallStyle);
            if(GUI.Button(new Rect(x+width-100,y+248,80,28),"关闭",style))screenSettings=false;
        }
        void WorldLabels()
        {
            foreach(var b in manifest.buildings){
                if(b.kind=="house")continue;
                var sprite=chunks.Art.Get(b.kind);float artWidth=b.visualWidth>0?b.visualWidth:b.width;
                var labelPoint=PixelProtocol.ToUnity(b.x,b.y+b.depth*.5f);labelPoint.y+=artWidth*sprite.rect.height/sprite.rect.width+3;
                var p=cameraView.WorldToScreenPoint(labelPoint);
                if(p.x<210||p.x>Screen.width-160||p.y<130||p.y>Screen.height-110)continue;
                string name=b.kind=="hall"?"寨主住所 · 议事厅":b.name;
                float width=b.kind=="hall"?174:90;var rect=new Rect(p.x-width/2,Screen.height-p.y-25,width,26);Frame(rect);
                GUI.Label(new Rect(rect.x+7,rect.y+1,width-10,25),name,smallStyle);
            }
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
            if(!AutomatedCapture&&Event.current.type==EventType.MouseDown&&Event.current.button==0&&map.Contains(Event.current.mousePosition)){
                var p=Event.current.mousePosition;focus=new Vector2((p.x-map.x)/size*32000,(p.y-map.y)/size*32000);follow=false;fullMap=false;Event.current.Use();
            }
            if(GUI.Button(new Rect(map.xMax-70,49,70,28),"关闭")&&!AutomatedCapture)fullMap=false;
        }
        void OnDestroy(){if(atlasGround?.sprite!=null)PixelArtLibrary.Release(atlasGround.sprite);if(regionGround?.sprite!=null)PixelArtLibrary.Release(regionGround.sprite);PixelArtLibrary.Release(atlasTexture);PixelArtLibrary.Release(miniTexture);PixelArtLibrary.Release(regionTexture);}
    }
}
