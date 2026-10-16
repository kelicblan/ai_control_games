using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    // A detached, read-only projection. No cognition, persistence graph or rules
    // are retained here; the live authority keeps its complete state separately.
    public sealed class CampRenderFrame
    {
        internal static float F(JToken v,float fallback=0)=>v==null||v.Type==JTokenType.Null?fallback:(float)v;
        internal static Vector2 P(JToken v)=>new Vector2(F(v?["x"]),F(v?["y"]));
        public readonly struct Actor
        {
            public readonly string Id,Action,Name,Speech;
            public readonly Vector2 Position,Destination;
            public readonly bool Alive,Injured,HuntWork;
            public readonly float Food,Wood,Health,Hunger,Energy,Wetness,Fear,Bravery;
            public bool Carrying=>Food>0||Wood>0;
            internal Actor(JToken n){Id=(string)n["id"];Action=(string)n["action"]??"Idle";Name=(string)n["name"];Speech=(string)n["speech"];Position=P(n["position"]);Destination=P(n["destination"]??n["position"]);Alive=(bool?)n["alive"]??false;Injured=(bool?)n["injured"]??false;HuntWork=(string)n["wildTask"]?["kind"]=="hunt"&&(string)n["wildTask"]?["phase"]=="work";Food=F(n["inventory"]?["food"]);Wood=F(n["inventory"]?["wood"]);Health=F(n["health"]);Hunger=F(n["hunger"]);Energy=F(n["energy"]);Wetness=F(n["wetness"]);Fear=F(n["fear"]);Bravery=F(n["personality"]?["bravery"],.5f);}
        }
        public readonly struct Resource
        {
            public readonly string Id,Kind;
            public readonly Vector2 Position;
            public readonly float Remaining,Capacity;
            internal Resource(JToken r){Id=(string)r["id"];Kind=(string)r["kind"];Position=P(r["position"]);Remaining=F(r["remaining"]);Capacity=F(r["capacity"],1);}
        }
        public readonly struct Animal
        {
            public readonly string Id,Species,Mode;
            public readonly Vector2 Position;
            public readonly float Heading,Health;
            internal Animal(JToken a){Id=(string)a["id"];Species=(string)a["species"];Mode=(string)a["mode"];Position=P(a["position"]);Heading=F(a["heading"]);Health=F(a["health"]);}
        }
        public double Elapsed {get;private set;}
        public string Status {get;private set;}
        public string Weather {get;private set;}
        public uint Seed {get;private set;}
        public bool HasLord {get;private set;}
        public bool HasEcology {get;private set;}
        public bool GateOpen {get;private set;}
        public Vector2 Lord {get;private set;}
        public float Rain {get;private set;}
        public float Cloud {get;private set;}
        public float Wind {get;private set;}
        public float WindAngle {get;private set;}
        public double Lightning {get;private set;}
        public IReadOnlyList<Actor> Actors {get;private set;}
        public IReadOnlyList<Resource> Resources {get;private set;}
        public IReadOnlyList<Animal> Animals {get;private set;}
        public static CampRenderFrame FromState(JObject state)
        {
            if(state==null)return null;var atmosphere=state["atmosphere"];var ecology=state["world"]?["ecology"];
            return new CampRenderFrame{
                Elapsed=(double?)state["elapsed"]??0,Status=(string)state["status"]??"paused",Weather=(string)state["weather"]??"clear",Seed=(uint?)state["seed"]??17,
                HasLord=state["lord"]?["position"]!=null,Lord=P(state["lord"]?["position"]),HasEcology=ecology is JObject,GateOpen=(bool?)state["world"]?["gateOpen"]??true,
                Rain=F(atmosphere?["rainIntensity"]),Cloud=F(atmosphere?["cloudCover"]),Wind=F(atmosphere?["windStrength"]),WindAngle=F(atmosphere?["windAngle"]),Lightning=(double?)atmosphere?["lightningAt"]??0,
                Actors=(state["npcs"]??new JArray()).Select(n=>new Actor(n)).ToArray(),Resources=(ecology?["resources"]??new JArray()).Select(r=>new Resource(r)).ToArray(),Animals=(ecology?["animals"]??new JArray()).Select(a=>new Animal(a)).ToArray()
            };
        }
    }
}
