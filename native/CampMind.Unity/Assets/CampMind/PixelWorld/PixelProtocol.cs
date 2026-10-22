using System;
using System.Text.RegularExpressions;
using UnityEngine;
namespace CampMind.PixelWorld
{
    // JSON字段与Node宿主一致；没有客户端预测资源或重新生成碰撞数据。
    [Serializable] public class PixelPoint {public float x,y;}
    [Serializable] public class PixelConnection {public int protocol,pid;public string endpoint,token,scope,player;public bool formal;}
    [Serializable] public class PixelRegion {public string id;public int generator,seed,width,height,chunkMetres,tileMetres,cells,cacheLimit;public string[] palette;}
    [Serializable] public class PixelVillage {public float x,y,width,height;public PixelPoint spawn,gate;}
    [Serializable] public class PixelProp {public string id,kind,name,resource;public float x,y,width,depth,radius,visualWidth,angle;public int amount,beds,mapLayer;}
    [Serializable] public class PixelManifest {public int protocol;public string scope;public PixelRegion region;public PixelVillage village;public PixelProp[] landmarks,buildings;}
    [Serializable] public class PixelChunk {public string id;public int cx,cy,cells,size;public long revision;public float x,y;public int[] tiles,halo;public PixelProp[] props;}
    [Serializable] public class PixelInventory {public string resource;public int amount;}
    [Serializable] public class PixelExplored {public int cx,cy;}
    [Serializable] public class PixelActor {public string id,name,resource,species;public float x,y,hp,maxHp,amount;public bool downed;}
    [Serializable] public class PixelSnapshot {public string scope,map,migrationNotice,worldId;public long revision,tick;public PixelPoint player;public bool gateOpen,formal,paused;public PixelInventory[] inventory;public PixelExplored[] explored;public PixelActor[] actors,nodes,enemies,wildlife;}
    [Serializable] public class PixelRaster {public int size;public float x,y,span,metresPerPixel;public int[] pixels;public PixelProp[] props;}
    [Serializable] public class PixelInput {public float x,y;public string worldId;}
    [Serializable] public class PixelOperation {public string operationId;}
    [Serializable] public class PixelReply {public bool ok,gateOpen;public string error,message,kind,resource;public int amount,remaining;public long revision;}
    public static class PixelProtocol
    {
        public const float WorldYScale=1.35f;
        // The farthest view contains the complete region on desktop aspect ratios.
        public static float FullRegionZoom(float aspect)=>Mathf.Max(16000/Mathf.Max(.1f,aspect),16000*WorldYScale);
        public static Vector3 ToUnity(float x,float y)=>new Vector3(x,-y*WorldYScale,0);
        public static Vector2 FromUnity(Vector3 point)=>new Vector2(point.x,-point.y/WorldYScale);
        public static Vector2 ScreenDirection(Vector2 screen,float angle){var p=Quaternion.Euler(0,0,angle)*new Vector3(screen.x,-screen.y,0);return new Vector2(p.x,-p.y/WorldYScale);}
        public static Vector2 ViewExtents(float halfHeight,float aspect,float angle){float c=Mathf.Abs(Mathf.Cos(angle*Mathf.Deg2Rad)),s=Mathf.Abs(Mathf.Sin(angle*Mathf.Deg2Rad));return new Vector2(halfHeight*(aspect*c+s),halfHeight*(aspect*s+c)/WorldYScale);}
        public static void ValidateConnection(PixelConnection c)
        {
            if(c==null||c.protocol!=1||c.scope!="pixel-game"||!Uri.TryCreate(c.endpoint,UriKind.Absolute,out var uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1||uri.AbsolutePath!="/"||uri.Query!=""||uri.Fragment!=""||uri.UserInfo!=""||!Regex.IsMatch(c.token??"","^[a-f0-9]{64}$"))
                throw new ArgumentException("地图连接文件无效；只允许本机二维游戏宿主");
        }
        public static void ValidateChunk(PixelChunk c)
        {
            if(c==null||c.cx<0||c.cy<0||c.cx>=250||c.cy>=250||c.cells!=64||c.size!=128||c.x!=c.cx*128||c.y!=c.cy*128||c.tiles?.Length!=4096||c.props==null||c.props.Length>512)throw new ArgumentException("地图分块协议或尺寸错误");
            foreach(var i in c.tiles)if(i<0||i>9)throw new ArgumentException("地图地表索引错误");
            if(c.halo!=null&&c.halo.Length!=66*66)throw new ArgumentException("地形边缘采样尺寸错误");
            if(c.halo!=null)foreach(var i in c.halo)if(i<0||i>9)throw new ArgumentException("地形边缘索引错误");
            foreach(var p in c.props)if(p==null||!float.IsFinite(p.x)||!float.IsFinite(p.y)||string.IsNullOrEmpty(p.id)||string.IsNullOrEmpty(p.kind))throw new ArgumentException("地图实体坐标错误");
        }
    }
}
