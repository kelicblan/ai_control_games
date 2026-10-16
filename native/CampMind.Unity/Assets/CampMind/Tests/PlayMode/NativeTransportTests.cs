using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Linq;
using CampMind.Presentation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.TestTools;

namespace CampMind.Tests
{
    public class NativeTransportTests
    {
        string endpoint;JObject stats;
        static int FeedOperations(JObject value)=>value["requests"].Where(r=>(string)r["type"]=="feed").Select(r=>(string)r["operation"]).Distinct().Count();
        IEnumerator Control(JObject value)
        {
            using(var request=new UnityWebRequest(endpoint+"/control","POST")){
                request.uploadHandler=new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(value.ToString()));request.downloadHandler=new DownloadHandlerBuffer();request.SetRequestHeader("Content-Type","application/json");request.timeout=3;yield return request.SendWebRequest();Assert.That(request.responseCode,Is.EqualTo(200));
            }
        }
        IEnumerator Stats(){using(var request=UnityWebRequest.Get(endpoint+"/stats")){request.timeout=3;yield return request.SendWebRequest();Assert.That(request.responseCode,Is.EqualTo(200));stats=JObject.Parse(request.downloadHandler.text);}}
        IEnumerator Wait(Func<bool> condition)
        {
            var deadline=Time.realtimeSinceStartup+10;while(!condition()&&Time.realtimeSinceStartup<deadline)yield return null;Assert.That(condition(),Is.True,"Native transport condition timed out");
        }
        [UnityTest]
        public IEnumerator UnconfirmedActionsAreNotReplayedAndFocusReleasesMotion()
        {
            Process owned=null;GameObject root=null;
            try{
                var script=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../scripts/unity/fixtures/native-wire-server.mjs"));Assert.That(File.Exists(script),Is.True);
                var start=new ProcessStartInfo("node","\""+script+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};owned=Process.Start(start);
                var ready=owned.StandardOutput.ReadLineAsync();yield return Wait(()=>ready.IsCompleted);Assert.That(ready.Result,Is.Not.Null);endpoint=(string)JObject.Parse(ready.Result)["endpoint"];
                root=new GameObject("Transport fault test");var bridge=root.AddComponent<TsWorldBridge>();bridge.Connect(endpoint,Guid.NewGuid().ToString());yield return Wait(()=>bridge.Connected);
                // Drain initial handshake before measuring resource operations.
                yield return new WaitForSecondsRealtime(.5f);yield return Stats();var initialRevision=(long)stats["revision"];
                yield return Control(new JObject{["mode"]="drop"});bridge.Enqueue(new JObject{["type"]="command",["command"]=new JObject{["type"]="feed"}});
                bridge.Enqueue(new JObject{["type"]="command",["command"]=new JObject{["type"]="feed"}}); // Unsent intent must be discarded on uncertainty.
                yield return Wait(()=>bridge.Connected&&bridge.gate.Revision==initialRevision+1);yield return new WaitForSecondsRealtime(.4f);yield return Stats();Assert.That(FeedOperations(stats),Is.EqualTo(1),"A wire retransmission must retain its operation ID: "+stats["requests"]);Assert.That((int)stats["food"],Is.EqualTo(9));
                yield return Control(new JObject{["mode"]="conflict"});bridge.Enqueue(new JObject{["type"]="command",["command"]=new JObject{["type"]="feed"}});
                yield return Wait(()=>bridge.Connected&&bridge.gate.Revision==initialRevision+2);yield return Stats();Assert.That(FeedOperations(stats),Is.EqualTo(2));Assert.That((int)stats["food"],Is.EqualTo(9),"409 must refresh without spending or retrying");
                yield return Control(new JObject{["version"]=2});yield return Wait(()=>!bridge.Connected&&bridge.Error.Contains("schema version"));Assert.That(bridge.gate.Revision,Is.EqualTo(initialRevision+2));
                bridge.Enqueue(new JObject{["type"]="command",["command"]=new JObject{["type"]="feed"}});yield return new WaitForSecondsRealtime(.4f);yield return Stats();Assert.That(FeedOperations(stats),Is.EqualTo(2),"Invalid protocol must fail closed instead of spending from a stale snapshot");
                yield return Control(new JObject{["version"]=1});yield return Wait(()=>bridge.Connected);
                yield return Control(new JObject{["catchingUp"]=true});yield return Wait(()=>(bool?)bridge.gate.Snapshot?["catchingUp"]==true);
                yield return Stats();var postsBeforeReplay=(int)stats["posts"];
                bridge.Enqueue(new JObject{["type"]="command",["command"]=new JObject{["type"]="feed"}});bridge.SendMotion(Vector2.up);
                yield return new WaitForSecondsRealtime(.5f);yield return Stats();Assert.That((int)stats["posts"],Is.EqualTo(postsBeforeReplay),"Offline catch-up must block gameplay mutations and input");
                yield return Control(new JObject{["catchingUp"]=false});yield return Wait(()=>(bool?)bridge.gate.Snapshot?["catchingUp"]==false);
                bridge.SendMotion(Vector2.up);yield return Wait(()=>bridge.gate.Revision>=initialRevision+3);yield return Stats();Assert.That((float)stats["lastMotion"]["y"],Is.EqualTo(1));
                root.SendMessage("OnApplicationFocus",false);yield return Wait(()=>bridge.gate.Revision>=initialRevision+4);yield return Stats();Assert.That((float)stats["lastMotion"]["y"],Is.EqualTo(0));Assert.That((float)stats["lastMotion"]["x"],Is.EqualTo(0));
            }finally{
                if(root!=null)UnityEngine.Object.DestroyImmediate(root);
                if(owned!=null){if(!owned.HasExited){owned.Kill();owned.WaitForExit(3000);}owned.Dispose();}
            }
        }
    }
}
