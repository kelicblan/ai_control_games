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
        private string player,owner=Guid.NewGuid().ToString("N");
        private readonly Queue<(JObject action,string scope)> commands=new Queue<(JObject,string)>();
        private Vector2? pendingMotion;
        private string motionScope;
        private float motionAt;
        private UnityWebRequest active;
        private bool stop;
        public event Action<JObject> Published;
        public void Connect(string endpoint,string playerId)
        {
            if(!Uri.TryCreate(endpoint,UriKind.Absolute,out var uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.AbsolutePath!="/"||uri.Port<1024)throw new ArgumentException("Bridge requires an explicit isolated loopback endpoint");
            if(!Guid.TryParse(playerId,out _))throw new ArgumentException("Invalid native test player identity");
            Endpoint=endpoint.TrimEnd('/');player=playerId;StartCoroutine(Run());
        }
        public void Enqueue(JObject action){if(!ReadyForActions){Error=Connected?"World is catching up; action was not queued":"Authority unavailable; action was not queued";return;}if(commands.Count>=16){Error="Too many pending actions";return;}commands.Enqueue((action,gate.Scope));}
        public void SendMotion(Vector2 input){if(!ReadyForActions){pendingMotion=null;return;}pendingMotion=Vector2.ClampMagnitude(input,1);motionAt=Time.realtimeSinceStartup;motionScope=gate.Scope;}
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
                yield return request.SendWebRequest();if(stop)yield break;
                if(request.result!=UnityWebRequest.Result.Success){Disconnect(request.responseCode==409?"World changed; refreshed without repeating action":request.error);active=null;yield break;}
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
        private void OnDestroy(){stop=true;active?.Abort();active?.Dispose();active=null;commands.Clear();pendingMotion=null;}
    }
}
