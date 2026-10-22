using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
namespace CampMind.PixelWorld
{
    /// <summary>按视口请求分块，最多64块、2个并发请求；离开视口即释放地表纹理与实体。</summary>
    public sealed class PixelChunkRenderer:MonoBehaviour
    {
        sealed class Visual {public GameObject root;public Texture2D texture,waterMask;public Sprite ground;public SpriteRenderer terrain;}
        readonly Dictionary<Vector2Int,Visual> loaded=new Dictionary<Vector2Int,Visual>();
        readonly HashSet<Vector2Int> pending=new HashSet<Vector2Int>();
        HashSet<Vector2Int> wanted=new HashSet<Vector2Int>();
        PixelWorldClient client;
        Camera cameraView;
        Material material;
        Color32[] palette;
        readonly PixelOverviewPainter overviewPainter=new PixelOverviewPainter();
        bool detailVisible=true;
        public float TerrainBlend {get;private set;}=1;
        public void SetTerrainBlend(float alpha){TerrainBlend=alpha;foreach(var visual in loaded.Values)if(visual.terrain!=null)visual.terrain.color=new Color(1,1,1,alpha);}
        public void SetDetailVisible(bool visible){if(detailVisible==visible)return;detailVisible=visible;foreach(var item in loaded.Values)item.root.SetActive(visible);}
        int epoch;
        float nextUpdate;
        Vector2 visualWind;
        public float WindStrength=>visualWind.magnitude;
        public float WindAngle=>Mathf.Atan2(visualWind.y,visualWind.x);
        void AttachTree(SpriteRenderer renderer,string kind){PixelEnvironmentMotion.ConfigureTree(renderer,kind);if(PixelEnvironmentMotion.IsTree(kind))renderer.gameObject.AddComponent<PixelTreeSway>().Bind(this);}
        public void SetWind(float strength,float angle)
        {
            if(material==null)return;
            strength=PixelEnvironmentMotion.Wind(strength);if(!float.IsFinite(angle))angle=0;
            var target=new Vector2(Mathf.Cos(angle),Mathf.Sin(angle))*strength;
            visualWind=Vector2.Lerp(visualWind,target,1-Mathf.Exp(-Time.unscaledDeltaTime*1.5f));
            material.SetVector("_Wind",new Vector4(visualWind.x,visualWind.y,visualWind.magnitude,0));
            material.SetFloat("_MotionTime",Time.unscaledTime);
            // Keep a gentle but visible screen-space displacement at normal desktop map zooms.
            material.SetFloat("_TreeSway",Mathf.Min(3.5f,cameraView.orthographicSize*2/Mathf.Max(1,cameraView.pixelHeight)*12));
        }
        public PixelArtLibrary Art {get;private set;}
        public int LoadedChunks=>loaded.Count;
        public event Action<string> Problem;
        public void Initialize(PixelWorldClient source,Camera camera)
        {
            StopAllCoroutines();Clear();epoch++;pending.Clear();client=source;cameraView=camera;
            if(Art==null)Art=new PixelArtLibrary();
            var shader=Resources.Load<Shader>("PixelWorld/PixelWorldUnlit")??Shader.Find("Sprites/Default");
            if(shader==null)throw new InvalidOperationException("未找到二维地图着色器");
            if(material!=null)PixelArtLibrary.Release(material);material=new Material(shader);
            palette=client.Manifest.region.palette.Select(hex=>{ColorUtility.TryParseHtmlString(hex,out var c);return(Color32)c;}).ToArray();
            nextUpdate=0;
        }
        public SpriteRenderer CreateActor(string name,string kind)
        {
            var go=new GameObject(name);go.transform.SetParent(transform,false);var r=go.AddComponent<SpriteRenderer>();r.sprite=Art.Get(kind);r.sharedMaterial=material;r.spriteSortPoint=SpriteSortPoint.Pivot;r.sortingOrder=0;AttachTree(r,kind);return r;
        }
        public static List<Vector2Int> VisibleKeys(float x,float y,float halfWidth,float halfHeight)
        {
            if(!float.IsFinite(x)||!float.IsFinite(y)||!float.IsFinite(halfWidth)||!float.IsFinite(halfHeight)||halfWidth<0||halfHeight<0)throw new ArgumentException("视口无效");
            int minX=Mathf.Clamp(Mathf.FloorToInt((x-halfWidth-48)/128),0,249),maxX=Mathf.Clamp(Mathf.FloorToInt((x+halfWidth+48)/128),0,249);
            int minY=Mathf.Clamp(Mathf.FloorToInt((y-halfHeight-48)/128),0,249),maxY=Mathf.Clamp(Mathf.FloorToInt((y+halfHeight+48)/128),0,249);
            var result=new List<Vector2Int>();for(int cy=minY;cy<=maxY;cy++)for(int cx=minX;cx<=maxX;cx++)result.Add(new Vector2Int(cx,cy));
            return result.OrderBy(c=>(new Vector2(c.x*128+64-x,c.y*128+64-y)).sqrMagnitude).Take(64).ToList();
        }
        public void UpdateStreaming()
        {
            if(!detailVisible||client==null||!client.Ready||Time.unscaledTime<nextUpdate)return;nextUpdate=Time.unscaledTime+.15f;
            var center=cameraView.transform.position;
            var centerWorld=PixelProtocol.FromUnity(center);
            var home=client.Manifest.village;
            var extents=PixelProtocol.ViewExtents(cameraView.orthographicSize,cameraView.aspect,cameraView.transform.eulerAngles.z);
            var keys=VisibleKeys(centerWorld.x,centerWorld.y,extents.x,extents.y).Take(48)
                .Concat(VisibleKeys(home.x,home.y,128,128).Take(16)).Distinct().Take(64).ToList();
            wanted=new HashSet<Vector2Int>(keys);
            foreach(var key in loaded.Keys.Where(k=>!wanted.Contains(k)).ToArray())Remove(key);
            foreach(var key in keys){if(pending.Count>=2)break;if(!loaded.ContainsKey(key)&&pending.Add(key))StartCoroutine(Load(key,epoch));}
        }
        IEnumerator Load(Vector2Int key,int ticket)
        {
            try{
                yield return client.Fetch<PixelChunk>($"/chunk?x={key.x}&y={key.y}",c=>{
                    if(c==null||ticket!=epoch||!wanted.Contains(key)||loaded.ContainsKey(key))return;
                    try{PixelProtocol.ValidateChunk(c);if(c.cx!=key.x||c.cy!=key.y)throw new ArgumentException("地图返回了错误的分块");Build(key,c);}
                    catch(Exception e){Problem?.Invoke(e.Message);}
                });
            }finally{pending.Remove(key);}
        }
        void Build(Vector2Int key,PixelChunk chunk)
        {
            var root=new GameObject("地块 "+chunk.id);root.transform.SetParent(transform,false);root.SetActive(detailVisible);
            var pixels=new Color32[256*256];
            for(int row=0;row<256;row++)for(int col=0;col<256;col++){
                var index=chunk.tiles[(row/4)*64+col/4];var c=palette[index];
                int worldX=chunk.cx*256+col,worldY=chunk.cy*256+row;
                int n=unchecked((worldX*73856093^worldY*19349663)&15)-7;
                if(index==5)n=(worldY+worldX/7)%19==0?12:-2;
                c.r=(byte)Mathf.Clamp(c.r+n/2,0,255);c.g=(byte)Mathf.Clamp(c.g+n,0,255);c.b=(byte)Mathf.Clamp(c.b+n/2,0,255);
                pixels[(255-row)*256+col]=c;
            }
            int size=256;
            if(Art.Tiny!=null){pixels=TinyTerrainPainter.Paint(chunk,Art.Tiny);size=TinyTerrainPainter.Size;}
            var texture=new Texture2D(size,size,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};texture.SetPixels32(pixels);texture.Apply(false,true);
            var sprite=Sprite.Create(texture,new Rect(0,0,size,size),new Vector2(0,1),size/128f,0,SpriteMeshType.FullRect);
            var ground=new GameObject("地表");ground.transform.SetParent(root.transform,false);ground.transform.position=PixelProtocol.ToUnity(chunk.x,chunk.y);
            ground.transform.localScale=new Vector3(1,PixelProtocol.WorldYScale,1);
            var sr=ground.AddComponent<SpriteRenderer>();sr.sprite=sprite;sr.sharedMaterial=material;sr.sortingOrder=-100;
            var waterMask=new Texture2D(64,64,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};
            waterMask.SetPixels32(PixelEnvironmentMotion.WaterPixels(chunk));waterMask.Apply(false,true);
            var waterBlock=new MaterialPropertyBlock();waterBlock.SetFloat("_MotionKind",2);waterBlock.SetTexture("_WaterMask",waterMask);sr.SetPropertyBlock(waterBlock);
            foreach(var p in chunk.props){
                var kind=p.kind=="fence"&&p.depth>p.width?"fence-side":p.kind;
                if(kind=="house"&&(p.id.EndsWith("2")||p.id.EndsWith("3")))kind="house-alt";
                var go=new GameObject(p.id);go.transform.SetParent(root.transform,false);
                var renderer=go.AddComponent<SpriteRenderer>();renderer.sprite=Art.Get(kind);renderer.sharedMaterial=material;renderer.spriteSortPoint=SpriteSortPoint.Pivot;
                AttachTree(renderer,kind);
                float width=p.visualWidth>0?p.visualWidth:p.width>0?p.width:(kind=="pine"?6:kind=="oak"?8:kind=="rock"||kind=="goldore"?4:3);
                if(kind=="fence-side")width=3f;
                go.transform.localScale=Vector3.one*(width*8/renderer.sprite.rect.width);
                if(kind.StartsWith("bridge-")){go.transform.localScale=new Vector3(width*8/renderer.sprite.rect.width,p.depth*PixelProtocol.WorldYScale*8/renderer.sprite.rect.height,1);renderer.sortingOrder=-90;}
                if(kind=="garden")renderer.sortingOrder=-95;
                if(kind=="scenery-tree")renderer.color=new Color(.82f,.94f,.78f);
                go.transform.position=PixelProtocol.ToUnity(p.x,p.y+(p.depth>0?p.depth*.5f:0));
                if(kind.StartsWith("bridge-")){
                    // Rotate in world metres before the isometric Y projection. Rotating an
                    // already stretched, bottom-pivoted sprite leaves gaps between bridge planks.
                    var projection=new GameObject(p.id+"-projection");projection.transform.SetParent(root.transform,false);
                    projection.transform.position=PixelProtocol.ToUnity(p.x,p.y);projection.transform.localScale=new Vector3(1,PixelProtocol.WorldYScale,1);
                    go.transform.SetParent(projection.transform,false);
                    go.transform.localPosition=new Vector3(-Mathf.Sin(p.angle)*p.depth*.5f,-Mathf.Cos(p.angle)*p.depth*.5f,0);
                    go.transform.localRotation=Quaternion.Euler(0,0,-p.angle*Mathf.Rad2Deg);
                    go.transform.localScale=new Vector3(width*8/renderer.sprite.rect.width,p.depth*8/renderer.sprite.rect.height,1);
                }
                if(kind=="gate-closed"&&Art.Tiny!=null){
                    var shutter=new GameObject("关闭的寨门门扇");shutter.transform.SetParent(root.transform,false);
                    var door=shutter.AddComponent<SpriteRenderer>();door.sprite=Art.Get("gate-shutter");door.sharedMaterial=material;door.spriteSortPoint=SpriteSortPoint.Pivot;
                    shutter.transform.localScale=new Vector3(12*8/door.sprite.rect.width,12*8/door.sprite.rect.height,1);
                    var point=PixelProtocol.ToUnity(p.x,p.y+1);point.y+=1.5f;shutter.transform.position=point;
                }
                if(kind=="fire"&&Art.Tiny!=null){
                    var flame=new GameObject("公共火塘火焰");flame.transform.SetParent(root.transform,false);
                    var fire=flame.AddComponent<SpriteRenderer>();fire.sprite=Art.Tiny.Get("fire-flame");fire.sharedMaterial=material;fire.spriteSortPoint=SpriteSortPoint.Pivot;
                    flame.transform.position=PixelProtocol.ToUnity(p.x,p.y+1);flame.transform.localScale=Vector3.one*(4.5f*8/fire.sprite.rect.width);
                    var animation=flame.AddComponent<PixelSpriteAnimation>();animation.library=Art.Tiny;animation.kind="fire-flame";
                }
            }
            loaded.Add(key,new Visual{terrain=sr,root=root,texture=texture,waterMask=waterMask,ground=sprite});
        }
        public Texture2D Raster(PixelRaster data)
        {
            if(data==null||data.size<1||data.size>2048||data.pixels?.Length!=data.size*data.size)throw new ArgumentException("总览数据尺寸错误");
            if(data.props!=null&&data.span>=1024&&data.size<2048){
                int originalSize=data.size;var samples=new int[2048*2048];for(int row=0;row<2048;row++)for(int col=0;col<2048;col++)samples[row*2048+col]=data.pixels[(row*originalSize/2048)*originalSize+col*originalSize/2048];
                data=new PixelRaster{size=2048,x=data.x,y=data.y,span=data.span,metresPerPixel=data.span/2048,pixels=samples,props=data.props};
            }
            var colors=new Color32[data.pixels.Length];for(int row=0;row<data.size;row++)for(int col=0;col<data.size;col++){var value=data.pixels[row*data.size+col];colors[(data.size-1-row)*data.size+col]=value>=0&&value<palette.Length?palette[value]:new Color32(12,25,22,255);}
            overviewPainter.Paint(colors,data,Art);
            var t=new Texture2D(data.size,data.size,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};t.SetPixels32(colors);t.Apply(false,false);return t;
        }
        public void InvalidateNearby()
        {
            epoch++;var p=client.Snapshot.player;var center=new Vector2Int(Mathf.FloorToInt(p.x/128),Mathf.FloorToInt(p.y/128));
            foreach(var key in loaded.Keys.Where(k=>Mathf.Abs(k.x-center.x)<=1&&Mathf.Abs(k.y-center.y)<=1).ToArray())Remove(key);nextUpdate=0;
        }
        void Remove(Vector2Int key){var v=loaded[key];PixelArtLibrary.Release(v.root);PixelArtLibrary.Release(v.ground);PixelArtLibrary.Release(v.texture);PixelArtLibrary.Release(v.waterMask);loaded.Remove(key);}
        void Clear(){foreach(var key in loaded.Keys.ToArray())Remove(key);}
        void OnDestroy(){StopAllCoroutines();Clear();Art?.Dispose();if(material!=null)PixelArtLibrary.Release(material);}
    }
}
