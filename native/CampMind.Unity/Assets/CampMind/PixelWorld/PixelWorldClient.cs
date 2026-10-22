using System;
using System.Collections;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
namespace CampMind.PixelWorld
{
    // 所有HTTP请求有超时；令牌只读本机临时文件，不写入日志或PlayerPrefs。
    public sealed class PixelWorldClient:MonoBehaviour
    {
        public PixelManifest Manifest {get;private set;}
        public PixelSnapshot Snapshot {get;private set;}
        public string Error {get;private set;}
        public bool Ready=>Manifest!=null&&Snapshot!=null;
        public bool Formal=>connection?.formal==true;
        internal PixelConnection Connection=>connection;
        public float LastSnapshotTime {get;private set;}
        public event Action Changed;
        public event Action<string> Notice;
        PixelConnection connection;
        Vector2 direction;
        bool interacting;
        string observation="";
        public void SetObservation(float x,float y,float span){observation=$"?viewX={Mathf.Clamp(Mathf.RoundToInt(x),0,31999)}&viewY={Mathf.Clamp(Mathf.RoundToInt(y),0,31999)}&viewSpan={Mathf.Clamp(Mathf.RoundToInt(span),16,600)}";}
        public void Begin(string file){StopAllCoroutines();connection=null;Manifest=null;Snapshot=null;Error=null;direction=Vector2.zero;interacting=false;StartCoroutine(Connect(file));}
        IEnumerator Connect(string file)
        {
            var deadline=Time.realtimeSinceStartup+12;
            while(!string.IsNullOrEmpty(file)&&!File.Exists(file)&&Time.realtimeSinceStartup<deadline)yield return null;
            try{if(string.IsNullOrEmpty(file)||!File.Exists(file))throw new IOException("二维游戏宿主尚未启动，请通过“运行游戏.cmd”或“打开Unity编辑器.cmd”进入");connection=JsonUtility.FromJson<PixelConnection>(File.ReadAllText(file));PixelProtocol.ValidateConnection(connection);}
            catch(Exception e){Error=e.Message;}
            if(Error!=null||connection==null)yield break;
            yield return Fetch<PixelManifest>("/manifest",m=>{
                if(m?.protocol==1&&m.scope=="pixel-game"&&m.region?.width==32000&&m.region.height==32000&&m.region.palette?.Length==10&&m.village!=null)Manifest=m;
                else Error="地图清单版本不兼容";
            });
            if(Manifest==null)yield break;
            StartCoroutine(Poll());StartCoroutine(SendInput());
        }
        IEnumerator Poll()
        {
            while(true){yield return Fetch<PixelSnapshot>("/snapshot"+observation,s=>{
                if(s?.scope=="pixel-game"&&s.map==Manifest.region.id&&s.player!=null&&float.IsFinite(s.player.x)&&float.IsFinite(s.player.y)&&s.player.x>=0&&s.player.y>=0&&s.player.x<32000&&s.player.y<32000){var gateChanged=Snapshot!=null&&Snapshot.gateOpen!=s.gateOpen;Snapshot=s;LastSnapshotTime=Time.realtimeSinceStartup;Error=null;if(gateChanged)Changed?.Invoke();}
                else Error="地图状态格式错误";
            });yield return new WaitForSecondsRealtime(.10f);}
        }
        IEnumerator SendInput()
        {
            while(true){if(Snapshot==null){yield return null;continue;}var d=Time.realtimeSinceStartup-LastSnapshotTime>1.5f?Vector2.zero:direction;yield return Fetch<PixelReply>("/input",_=>{},JsonUtility.ToJson(new PixelInput{x=d.x,y=d.y,worldId=Snapshot.worldId}));yield return new WaitForSecondsRealtime(.08f);}
        }
        public void SetDirection(Vector2 value){direction=Vector2.ClampMagnitude(value,1);}
        public void Interact(){if(!Ready||interacting)return;StartCoroutine(Interaction());}
        IEnumerator Interaction()
        {
            interacting=true;
            yield return Fetch<PixelReply>("/interact",r=>{if(r!=null){Notice?.Invoke(r.message??"操作完成");Changed?.Invoke();}},JsonUtility.ToJson(new PixelOperation{operationId=Guid.NewGuid().ToString("N")}));
            interacting=false;
        }
        public IEnumerator Fetch<T>(string route,Action<T> complete,string body=null) where T:class
        {
            if(connection==null){complete(null);yield break;}
            using(var request=new UnityWebRequest(connection.endpoint.TrimEnd('/')+(connection.formal?"/game-api/pixel":"")+route,body==null?"GET":"POST"))
            {
                request.downloadHandler=new DownloadHandlerBuffer();request.timeout=route.StartsWith("/atlas")||route.StartsWith("/viewport")?30:8;request.redirectLimit=0;
                request.SetRequestHeader("x-pixel-token",connection.token);
                if(connection.formal){request.SetRequestHeader("X-Camp-Tab","pixel-client");request.SetRequestHeader("Cookie","campmind-player="+connection.player);}
                if(body!=null){request.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));request.SetRequestHeader("Content-Type","application/json");}
                yield return request.SendWebRequest();
                if(request.result!=UnityWebRequest.Result.Success){
                    string message=null;try{message=JsonUtility.FromJson<PixelReply>(request.downloadHandler.text)?.error;}catch{/* 非JSON网络错误。 */}
                    Error=message??("地图连接失败："+request.error);Notice?.Invoke(Error);complete(null);yield break;
                }
                T result=null;try{result=JsonUtility.FromJson<T>(request.downloadHandler.text);}catch(Exception e){Error="地图协议解析失败："+e.Message;}
                complete(result);
            }
        }
        public IEnumerator FormalApi(string route,Action<string,string> complete,string body=null)
        {
            if(!Formal){complete(null,"正式世界尚未连接");yield break;}
            if(route!="village"&&route!="cognition-settings"&&route!="startup-models"&&route!="world"&&route!="pixel/ui-world")throw new ArgumentException("不支持的正式接口");
            using(var request=new UnityWebRequest(connection.endpoint+"/game-api/"+route,body==null?"GET":"POST")){
                request.downloadHandler=new DownloadHandlerBuffer();request.timeout=30;request.redirectLimit=0;
                request.SetRequestHeader("X-Camp-Tab","pixel-client");request.SetRequestHeader("Cookie","campmind-player="+connection.player);request.SetRequestHeader("X-Camp-Village-Protocol","1");request.SetRequestHeader("X-Camp-Native-Protocol","1");
                request.SetRequestHeader("X-Pixel-Token",connection.token);
                if(body!=null){request.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));request.SetRequestHeader("Content-Type","application/json");}
                yield return request.SendWebRequest();complete(request.result==UnityWebRequest.Result.Success?request.downloadHandler.text:null,request.result==UnityWebRequest.Result.Success?null:request.downloadHandler.text);
            }
        }
        void OnDisable(){direction=Vector2.zero;StopAllCoroutines();}
    }
}
