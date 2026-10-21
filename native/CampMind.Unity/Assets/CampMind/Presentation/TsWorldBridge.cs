using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace CampMind.Presentation
{
    public sealed class TsWorldBridge : MonoBehaviour
    {
        public readonly BridgeSnapshotGate gate=new BridgeSnapshotGate();
        public string Error {get;private set;}="";
        public bool Connected {get;private set;}
        public bool ReadyForActions=>Connected&&(bool?)gate.Snapshot?["catchingUp"]!=true;
        public string Endpoint {get;private set;}
        public Vector2 AudioListener,AudioRight=Vector2.right;
        public bool HasAudioListener;
        private string player,owner=Guid.NewGuid().ToString("N");
        private readonly Queue<(JObject action,string scope)> commands=new Queue<(JObject,string)>();
        private Vector2? pendingMotion;
        private string motionScope;
        private float motionAt;
        private UnityWebRequest active;
        private readonly HashSet<UnityWebRequest> activeApis=new HashSet<UnityWebRequest>();
        private bool stop;
        public event Action<JObject> Published;
        public void Api(string route,JObject input,Action<JObject,string> complete)
        {
            if(!Connected){complete(null,"世界服务尚未连接");return;}
            if(!(route.StartsWith("/game-api/conversations?")||route.StartsWith("/game-api/memories?")||route.StartsWith("/game-api/native-map?")||route=="/game-api/village"||route=="/game-api/cognition-settings"||route=="/game-api/startup-models"||route=="/game-api/native-models"||route=="/game-api/remote-models"||route=="/game-api/remote-models/test"))throw new ArgumentException("Unsupported native settings route");
            StartCoroutine(ApiRequest(route,input,gate.Scope,complete));
        }
        private IEnumerator ApiRequest(string route,JObject input,string scope,Action<JObject,string> complete)
        {
            using(var request=new UnityWebRequest(Endpoint+route,input==null?"GET":"POST"))
            {
                activeApis.Add(request);
                request.downloadHandler=new DownloadHandlerBuffer();request.timeout=30;
                request.SetRequestHeader("X-Camp-Tab",owner);request.SetRequestHeader("Cookie","campmind-player="+player);
                request.SetRequestHeader("X-Camp-Native-Protocol","1");
                if(route=="/game-api/village")request.SetRequestHeader("X-Camp-Village-Protocol","1");
                if(input!=null){request.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(input.ToString(Formatting.None)));request.SetRequestHeader("Content-Type","application/json");}
                yield return request.SendWebRequest();activeApis.Remove(request);if(stop)yield break;
                var scoped=route.StartsWith("/game-api/conversations?")||route.StartsWith("/game-api/memories?")||route.StartsWith("/game-api/native-map?");
                if(scoped&&scope!=gate.Scope){complete(null,"所属世界已变化，请刷新");yield break;}
                JObject result=null;string error=null;
                try{var token=JToken.Parse(request.downloadHandler.text);result=token.Type==JTokenType.Null?null:(JObject)token;if(request.result!=UnityWebRequest.Result.Success)error=(string)result?["error"]??"请求失败";}
                catch{error="无法读取世界服务响应";}
                complete(result,error);
            }
        }
        public void Connect(string endpoint,string playerId)
        {
            if(!Uri.TryCreate(endpoint,UriKind.Absolute,out var uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.AbsolutePath!="/"||uri.Port<1024)throw new ArgumentException("Bridge requires an explicit isolated loopback endpoint");
            if(!Guid.TryParse(playerId,out _))throw new ArgumentException("Invalid native test player identity");
            Endpoint=endpoint.TrimEnd('/');player=playerId;StartCoroutine(Run());
        }
        public void Enqueue(JObject action){if(!ReadyForActions){Error=Connected?"World is catching up; action was not queued":"Authority unavailable; action was not queued";return;}if(commands.Count>=16){Error="Too many pending actions";return;}commands.Enqueue((action,gate.Scope));}
        public void SendMotion(Vector2 input){if(GetComponent<NativeVillageUi>()?.VillageActive==true||Environment.GetEnvironmentVariable("CAMP_VILLAGE_DEFAULT")=="1"){pendingMotion=null;return;}if(!ReadyForActions){pendingMotion=null;return;}pendingMotion=Vector2.ClampMagnitude(input,1);motionAt=Time.realtimeSinceStartup;motionScope=gate.Scope;}
        public void ReleaseMotion(){SendMotion(Vector2.zero);}
        private void Disconnect(string reason){Connected=false;Error=reason;commands.Clear();pendingMotion=null;}
        private IEnumerator Request(JObject envelope)
        {
            var epoch=gate.Epoch;
            using(var request=new UnityWebRequest(Endpoint+"/game-api/world",envelope==null?"GET":"POST")){
                active=request;request.downloadHandler=new DownloadHandlerBuffer();request.timeout=10;
                request.SetRequestHeader("X-Camp-Tab",owner);request.SetRequestHeader("Cookie","campmind-player="+player);
                request.SetRequestHeader("X-Camp-Native-Protocol","1");
                if(envelope!=null){request.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(envelope.ToString(Formatting.None)));request.SetRequestHeader("Content-Type","application/json");}
                if(HasAudioListener)request.SetRequestHeader("X-Camp-Audio-Context",new JArray(AudioListener.x,AudioListener.y,AudioRight.x,AudioRight.y).ToString(Formatting.None));
                yield return request.SendWebRequest();if(stop)yield break;
                if(request.result!=UnityWebRequest.Result.Success){var reason=request.responseCode==409?"World changed; refreshed without repeating action":request.error;try{reason=(string)JObject.Parse(request.downloadHandler.text)["error"]??reason;}catch{}Disconnect(reason);active=null;yield break;}
                try {var snapshot=JObject.Parse(request.downloadHandler.text);if(gate.Accept(snapshot,epoch)){Connected=true;Error="";Published?.Invoke(snapshot);}}
                catch(Exception e){Disconnect(e.Message);}
                active=null;
            }
        }
        private IEnumerator Run()
        {
            yield return Request(null);
            while(!stop){
                if(!Connected){yield return Request(null);yield return new WaitForSecondsRealtime(.1f);continue;}
                if(!ReadyForActions){commands.Clear();pendingMotion=null;yield return Request(null);yield return new WaitForSecondsRealtime(.1f);continue;}
                JObject action=null;
                if(commands.Count>0){var queued=commands.Dequeue();if(gate.CanSendAction(queued.scope))action=queued.action;else Error="Discarded action from a previous world";}
                else if(pendingMotion.HasValue){var direction=Time.realtimeSinceStartup-motionAt>.3f||!gate.CanSendAction(motionScope)?Vector2.zero:pendingMotion.Value;pendingMotion=null;
                    action=new JObject{["type"]="command",["command"]=new JObject{["type"]="lord-input",["playerId"]="local-player",["direction"]=new JObject{["x"]=direction.x,["y"]=direction.y}}};}
                if(action!=null&&gate.Revision>=0){gate.BeginMutation();var envelope=new JObject{["revision"]=gate.Revision,["operation"]=Guid.NewGuid().ToString("N"),["action"]=action};yield return Request(envelope);
                    if(!Connected)yield return Request(null); // Never replay unacknowledged motion or blindly repeat resource mutations.
                }else yield return Request(null);
                yield return new WaitForSecondsRealtime(.1f);
            }
        }
        private void OnApplicationFocus(bool value){if(!value)ReleaseMotion();}
        private void OnDestroy(){stop=true;active?.Abort();active?.Dispose();active=null;foreach(var request in activeApis){request.Abort();request.Dispose();}activeApis.Clear();commands.Clear();pendingMotion=null;}
    }
}
