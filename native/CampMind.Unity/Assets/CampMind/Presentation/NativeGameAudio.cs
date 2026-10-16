using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    public sealed class NativeGameAudio:MonoBehaviour
    {
        NativeCampView view;JObject profiles,cues;string scope;
        readonly Dictionary<string,AudioSource> loops=new Dictionary<string,AudioSource>();
        readonly Dictionary<string,float> lastReaction=new Dictionary<string,float>();
        readonly Dictionary<string,float> lastCue=new Dictionary<string,float>();
        readonly List<AudioSource> oneShots=new List<AudioSource>();
        long eventId;double lastThunder=-1;bool skipThunder=true,focused=true;
        public bool SoundEnabled {get;private set;}
        public void Initialize(NativeCampView target)
        {
            view=target;SoundEnabled=PlayerPrefs.GetInt("camp.native.sound",1)==1;
            if(view.viewCamera.GetComponent<AudioListener>()==null)view.viewCamera.gameObject.AddComponent<AudioListener>();
            profiles=(JObject)JObject.Parse(Resources.Load<TextAsset>("Audio/vocal-fixtures").text)["profiles"];
            cues=JObject.Parse(Resources.Load<TextAsset>("Audio/cue-tones").text);
            foreach(var kind in new[]{"wind","leaves","rain","water","fire"}){var source=Source(kind);source.clip=Resources.Load<AudioClip>("Audio/"+kind);source.loop=true;source.volume=0;loops[kind]=source;}
        }
        AudioSource Source(string label){var child=new GameObject("音效 "+label);child.transform.SetParent(transform,false);var source=child.AddComponent<AudioSource>();source.playOnAwake=false;source.spatialBlend=0;return source;}
        public void Toggle(){SoundEnabled=!SoundEnabled;PlayerPrefs.SetInt("camp.native.sound",SoundEnabled?1:0);PlayerPrefs.Save();if(!SoundEnabled)StopAudio();}
        public void Click(){Cue("click");}
        void OnApplicationFocus(bool value){focused=value;if(!value)StopAudio();}
        void StopAudio(){foreach(var source in loops.Values)if(source!=null){source.Stop();source.volume=0;}foreach(var source in oneShots)if(source!=null){source.Stop();Destroy(source.gameObject);}oneShots.Clear();skipThunder=true;}
        void Update()
        {
            if(view==null)return;var bridge=view.Authority;var state=view.World;
            if(bridge?.gate.Scope!=scope){scope=bridge?.gate.Scope;eventId=0;lastThunder=-1;StopAudio();}
            if(state==null||bridge?.Connected!=true||!focused||!SoundEnabled||(string)state["status"]!="playing"){StopAudio();if(state!=null)eventId=(long?)state["events"]?.Last?["id"]??eventId;return;}
            var audio=bridge.gate.Snapshot?["presentation"]?["audio"];if(audio==null)return;
            foreach(var pair in loops)
            {
                var mix=audio["ambient"]?[pair.Key];if(mix==null)continue;var source=pair.Value;
                source.volume=Mathf.Lerp(source.volume,(float)mix["gain"]*.16f,1-Mathf.Exp(-Time.unscaledDeltaTime/.16f));source.pitch=(float)mix["playbackRate"];source.panStereo=(float)mix["pan"];
                var low=source.GetComponent<AudioLowPassFilter>();var high=source.GetComponent<AudioHighPassFilter>();var frequency=(float)mix["frequency"];
                if(pair.Key=="rain"||pair.Key=="fire"||pair.Key=="leaves"){if(high==null)high=source.gameObject.AddComponent<AudioHighPassFilter>();high.cutoffFrequency=pair.Key=="leaves"?frequency*.5f:frequency;}
                if(pair.Key!="rain"){if(low==null)low=source.gameObject.AddComponent<AudioLowPassFilter>();low.cutoffFrequency=pair.Key=="fire"?5100:pair.Key=="leaves"?frequency*1.4f:frequency;}
                if(pair.Key=="water"){if(high==null)high=source.gameObject.AddComponent<AudioHighPassFilter>();high.cutoffFrequency=90;}
                if(!source.isPlaying&&source.clip!=null)source.Play();
            }
            var thunderAt=(double?)state["atmosphere"]?["lightningAt"]??-1;
            if(thunderAt>lastThunder){lastThunder=thunderAt;if(!skipThunder&&audio["thunder"] is JObject thunder){var source=Source("雷声");source.clip=Resources.Load<AudioClip>("Audio/thunderBody");source.volume=(float)thunder["gain"]*.16f;source.panStereo=(float)thunder["pan"];source.PlayDelayed((float)thunder["delay"]);oneShots.Add(source);Destroy(source.gameObject,8+(float)thunder["delay"]);}}
            skipThunder=false;
            foreach(var e in state["events"] as JArray??new JArray())
            {
                var id=(long)e["id"];if(id<=eventId)continue;eventId=id;
                if((double?)e["time"]<(double?)state["elapsed"]-1)continue;
                if(e["reaction"] is JObject reaction&&e["npcId"]!=null)
                {var npc=(string)e["npcId"];if(!lastReaction.TryGetValue(npc,out var at)||Time.unscaledTime-at>=.9f){lastReaction[npc]=Time.unscaledTime;var samples=NativeVocalSynth.Samples((string)reaction["kind"],npc,(double)reaction["intensity"],profiles);var clip=AudioClip.Create("伙伴反应",samples.Length,1,22050,false);clip.SetData(samples,0);PlayClip(clip,(string)reaction["kind"]=="bump"?.66f:1.45f);}}
                else if((string)e["kind"]=="good")Cue("harvest");else if((string)e["kind"]=="warning"||(string)e["kind"]=="danger")Cue("warning");
            }
            oneShots.RemoveAll(source=>source==null);
        }
        void PlayClip(AudioClip clip,float gain){if(!SoundEnabled||!focused)return;var source=Source("事件");source.clip=clip;source.volume=Mathf.Clamp01(gain*.16f);source.Play();oneShots.Add(source);Destroy(source.gameObject,clip.length+1);Destroy(clip,clip.length+1);}
        void Cue(string kind)
        {
            if(!SoundEnabled||!focused||cues==null||oneShots.Count>=12)return;const int rate=22050;var tones=(JArray)cues[kind];var duration=0d;
            var minimum=kind=="click"?.04f:kind=="harvest"?.15f:kind=="warning"?1.2f:1;
            if(lastCue.TryGetValue(kind,out var last)&&Time.unscaledTime-last<minimum)return;lastCue[kind]=Time.unscaledTime;
            foreach(var tone in tones)duration=Math.Max(duration,(double)tone["offset"]+(double)tone["duration"]+.01);
            var samples=new float[(int)Math.Ceiling(duration*rate)];
            foreach(var tone in tones){var start=(int)((double)tone["offset"]*rate);var length=(int)((double)tone["duration"]*rate);double phase=0;var frequency=(double)tone["frequency"];var end=(double?)tone["endFrequency"]??frequency;var attack=Math.Min(.012,(double)tone["duration"]/4);var volume=(double)tone["volume"];
                for(var i=0;i<length;i++){var time=(double)i/rate;var progress=(double)i/length;phase+=frequency*Math.Pow(end/frequency,progress)/rate;var wave=(string)tone["type"]=="triangle"?2/Math.PI*Math.Asin(Math.Sin(phase*2*Math.PI)):Math.Sin(phase*2*Math.PI);var envelope=time<attack?.0001*Math.Pow(volume/.0001,time/attack):volume*Math.Pow(.0001/volume,(time-attack)/Math.Max(.001,(double)tone["duration"]-attack));samples[start+i]+=(float)(wave*envelope);}}
            var clip=AudioClip.Create(kind,samples.Length,1,rate,false);clip.SetData(samples,0);PlayClip(clip,1);
        }
        void OnDestroy(){StopAudio();}
    }
}
