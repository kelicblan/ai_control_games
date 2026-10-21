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
        sealed class Visual {public GameObject root;public Texture2D texture;public Sprite ground;}
        readonly Dictionary<Vector2Int,Visual> loaded=new Dictionary<Vector2Int,Visual>();
        readonly HashSet<Vector2Int> pending=new HashSet<Vector2Int>();
        HashSet<Vector2Int> wanted=new HashSet<Vector2Int>();
        PixelWorldClient client;
        Camera cameraView;
        Material material;
        Color32[] palette;
        int epoch;
        float nextUpdate;
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
            var go=new GameObject(name);go.transform.SetParent(transform,false);var r=go.AddComponent<SpriteRenderer>();r.sprite=Art.Get(kind);r.sharedMaterial=material;r.spriteSortPoint=SpriteSortPoint.Pivot;r.sortingOrder=0;return r;
        }
        public static List<Vector2Int> VisibleKeys(float x,float y,float halfWidth,float halfHeight)
        {
            if(!float.IsFinite(x)||!float.IsFinite(y)||!float.IsFinite(halfWidth)||!float.IsFinite(halfHeight)||halfWidth<0||halfHeight<0)throw new ArgumentException("视口无效");
            int minX=Mathf.Clamp(Mathf.FloorToInt((x-halfWidth-24)/128),0,249),maxX=Mathf.Clamp(Mathf.FloorToInt((x+halfWidth+24)/128),0,249);
            int minY=Mathf.Clamp(Mathf.FloorToInt((y-halfHeight-24)/128),0,249),maxY=Mathf.Clamp(Mathf.FloorToInt((y+halfHeight+24)/128),0,249);
            var result=new List<Vector2Int>();for(int cy=minY;cy<=maxY;cy++)for(int cx=minX;cx<=maxX;cx++)result.Add(new Vector2Int(cx,cy));
            return result.OrderBy(c=>(new Vector2(c.x*128+64-x,c.y*128+64-y)).sqrMagnitude).Take(64).ToList();
        }
        public void UpdateStreaming()
        {
            if(client==null||!client.Ready||Time.unscaledTime<nextUpdate)return;nextUpdate=Time.unscaledTime+.15f;
            var center=cameraView.transform.position;
            var keys=VisibleKeys(center.x,-center.y,cameraView.orthographicSize*cameraView.aspect,cameraView.orthographicSize);
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
            var root=new GameObject("地块 "+chunk.id);root.transform.SetParent(transform,false);
            var pixels=new Color32[256*256];
            for(int row=0;row<256;row++)for(int col=0;col<256;col++){
                var index=chunk.tiles[(row/4)*64+col/4];var c=palette[index];
                int worldX=chunk.cx*256+col,worldY=chunk.cy*256+row;
                int n=unchecked((worldX*73856093^worldY*19349663)&15)-7;
                if(index==5)n=(worldY+worldX/7)%19==0?12:-2;
                c.r=(byte)Mathf.Clamp(c.r+n/2,0,255);c.g=(byte)Mathf.Clamp(c.g+n,0,255);c.b=(byte)Mathf.Clamp(c.b+n/2,0,255);
                pixels[(255-row)*256+col]=c;
            }
            var texture=new Texture2D(256,256,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};texture.SetPixels32(pixels);texture.Apply(false,false);
            var sprite=Sprite.Create(texture,new Rect(0,0,256,256),new Vector2(0,1),2,0,SpriteMeshType.FullRect);
            var ground=new GameObject("地表");ground.transform.SetParent(root.transform,false);ground.transform.position=PixelProtocol.ToUnity(chunk.x,chunk.y);
            var sr=ground.AddComponent<SpriteRenderer>();sr.sprite=sprite;sr.sharedMaterial=material;sr.sortingOrder=-100;
            foreach(var p in chunk.props){
                var kind=p.kind=="fence"&&p.depth>p.width?"fence-side":p.kind;
                var go=new GameObject(p.id);go.transform.SetParent(root.transform,false);
                var renderer=go.AddComponent<SpriteRenderer>();renderer.sprite=Art.Get(kind);renderer.sharedMaterial=material;renderer.spriteSortPoint=SpriteSortPoint.Pivot;
                float width=p.width>0?p.width:(kind=="pine"?6:kind=="oak"?8:kind=="rock"||kind=="goldore"?4:3);
                if(kind=="fence-side")width=1.7f;
                go.transform.localScale=Vector3.one*(width*8/renderer.sprite.rect.width);
                if(kind.StartsWith("bridge-")){go.transform.localScale=new Vector3(width*8/renderer.sprite.rect.width,p.depth*8/renderer.sprite.rect.height,1);renderer.sortingOrder=-90;}
                go.transform.position=PixelProtocol.ToUnity(p.x,p.y+(p.depth>0?p.depth*.5f:0));
            }
            loaded.Add(key,new Visual{root=root,texture=texture,ground=sprite});
        }
        public Texture2D Raster(PixelRaster data)
        {
            if(data==null||data.size<1||data.size>512||data.pixels?.Length!=data.size*data.size)throw new ArgumentException("总览数据尺寸错误");
            var colors=new Color32[data.pixels.Length];for(int row=0;row<data.size;row++)for(int col=0;col<data.size;col++){var value=data.pixels[row*data.size+col];colors[(data.size-1-row)*data.size+col]=value>=0&&value<palette.Length?palette[value]:new Color32(12,25,22,255);}
            var t=new Texture2D(data.size,data.size,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};t.SetPixels32(colors);t.Apply(false,false);return t;
        }
        public void InvalidateNearby()
        {
            epoch++;var p=client.Snapshot.player;var center=new Vector2Int(Mathf.FloorToInt(p.x/128),Mathf.FloorToInt(p.y/128));
            foreach(var key in loaded.Keys.Where(k=>Mathf.Abs(k.x-center.x)<=1&&Mathf.Abs(k.y-center.y)<=1).ToArray())Remove(key);nextUpdate=0;
        }
        void Remove(Vector2Int key){var v=loaded[key];PixelArtLibrary.Release(v.root);PixelArtLibrary.Release(v.ground);PixelArtLibrary.Release(v.texture);loaded.Remove(key);}
        void Clear(){foreach(var key in loaded.Keys.ToArray())Remove(key);}
        void OnDestroy(){StopAllCoroutines();Clear();Art?.Dispose();if(material!=null)PixelArtLibrary.Release(material);}
    }
}
