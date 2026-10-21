using System;
using System.Text.RegularExpressions;
using UnityEngine;
namespace CampMind.PixelWorld
{
    // JSON字段与Node宿主一致；没有客户端预测资源或重新生成碰撞数据。
    [Serializable] public class PixelPoint {public float x,y;}
    [Serializable] public class PixelConnection {public int protocol,pid;public string endpoint,token,scope;}
    [Serializable] public class PixelRegion {public string id;public int generator,seed,width,height,chunkMetres,tileMetres,cells,cacheLimit;public string[] palette;}
    [Serializable] public class PixelVillage {public float x,y,width,height;public PixelPoint spawn,gate;}
    [Serializable] public class PixelProp {public string id,kind,name,resource;public float x,y,width,depth,radius;public int amount,beds;}
    [Serializable] public class PixelManifest {public int protocol;public string scope;public PixelRegion region;public PixelVillage village;public PixelProp[] landmarks,buildings;}
    [Serializable] public class PixelChunk {public string id;public int cx,cy,cells,size;public long revision;public float x,y;public int[] tiles;public PixelProp[] props;}
    [Serializable] public class PixelInventory {public string resource;public int amount;}
    [Serializable] public class PixelExplored {public int cx,cy;}
    [Serializable] public class PixelSnapshot {public string scope,map;public long revision;public PixelPoint player;public bool gateOpen;public PixelInventory[] inventory;public PixelExplored[] explored;}
    [Serializable] public class PixelRaster {public int size;public float x,y,span,metresPerPixel;public int[] pixels;}
    [Serializable] public class PixelInput {public float x,y;}
    [Serializable] public class PixelOperation {public string operationId;}
    [Serializable] public class PixelReply {public bool ok,gateOpen;public string error,message,kind,resource;public int amount,remaining;public long revision;}
    public static class PixelProtocol
    {
        public static Vector3 ToUnity(float x,float y)=>new Vector3(x,-y,0);
        public static void ValidateConnection(PixelConnection c)
        {
            if(c==null||c.protocol!=1||c.scope!="pixel-game"||!Uri.TryCreate(c.endpoint,UriKind.Absolute,out var uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1||uri.AbsolutePath!="/"||uri.Query!=""||uri.Fragment!=""||uri.UserInfo!=""||!Regex.IsMatch(c.token??"","^[a-f0-9]{64}$"))
                throw new ArgumentException("地图连接文件无效；只允许本机二维游戏宿主");
        }
        public static void ValidateChunk(PixelChunk c)
        {
            if(c==null||c.cx<0||c.cy<0||c.cx>=250||c.cy>=250||c.cells!=64||c.size!=128||c.x!=c.cx*128||c.y!=c.cy*128||c.tiles?.Length!=4096||c.props==null||c.props.Length>512)throw new ArgumentException("地图分块协议或尺寸错误");
            foreach(var i in c.tiles)if(i<0||i>9)throw new ArgumentException("地图地表索引错误");
            foreach(var p in c.props)if(p==null||!float.IsFinite(p.x)||!float.IsFinite(p.y)||string.IsNullOrEmpty(p.id)||string.IsNullOrEmpty(p.kind))throw new ArgumentException("地图实体坐标错误");
        }
    }
}
