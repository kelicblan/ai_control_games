using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    public sealed class NativeRenderReplay
    {
        readonly CampRenderFrame[] states;
        public double Duration {get;}
        public int Count=>states.Length;
        public NativeRenderReplay(JObject data,List<CampRenderFrame> frames)
        {
            if((int?)data["version"]!=1||(string)data["kind"]!="typescript-authority-render-replay"||(double?)data["stepSeconds"]!=.1||(string)data["policy"]!="teacher-v3-zero-latency")throw new InvalidDataException("Unsupported source render replay");
            Duration=(double)data["durationSeconds"];
            if(Duration<1||Duration>120||frames.Count!=(int)Math.Round(Duration*10)+1)throw new InvalidDataException("Invalid replay timeline");
            states=frames.ToArray();
        }
        public CampRenderFrame At(double seconds)
        {
            if(double.IsNaN(seconds)||double.IsInfinity(seconds)||seconds<0)throw new ArgumentOutOfRangeException(nameof(seconds));
            var index=(int)Math.Floor((seconds%Duration)*10);return states[Math.Min(index,states.Length-1)];
        }
    }
    public sealed class NativeReplayContent:MonoBehaviour
    {
        public TextAsset clearReplay,stormReplay;
        public string clearSha,stormSha;
        public NativeRenderReplay Load(bool storm)
        {
            var asset=storm?stormReplay:clearReplay;var expected=storm?stormSha:clearSha;if(asset==null)throw new InvalidDataException("Missing source replay asset");var bytes=asset.bytes;
            using(var hash=SHA256.Create())if(BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()!=expected)throw new InvalidDataException("Source replay checksum mismatch");
            using(var input=new MemoryStream(bytes,false))using(var gzip=new GZipStream(input,CompressionMode.Decompress))using(var text=new StreamReader(gzip))using(var reader=new JsonTextReader(text)){
                if(!reader.Read()||reader.TokenType!=JsonToken.StartObject)throw new InvalidDataException("Invalid replay document");
                var metadata=new JObject();var frames=new List<CampRenderFrame>(1201);
                while(reader.Read()&&reader.TokenType!=JsonToken.EndObject){
                    if(reader.TokenType!=JsonToken.PropertyName)throw new InvalidDataException("Invalid replay property");var key=(string)reader.Value;if(!reader.Read())throw new InvalidDataException("Truncated replay");
                    if(key!="frames"){metadata[key]=JToken.ReadFrom(reader);continue;}
                    if(reader.TokenType!=JsonToken.StartArray)throw new InvalidDataException("Missing replay frames");
                    while(reader.Read()&&reader.TokenType!=JsonToken.EndArray){
                        if(frames.Count>=1201)throw new InvalidDataException("Replay exceeds its bounded duration");
                        var raw=JObject.Load(reader);if(Math.Abs((double)raw["at"]-frames.Count*.1)>1e-8)throw new InvalidDataException("Unordered source frame");var state=raw["state"] as JObject;
                        if((int?)state?["version"]!=1||(int?)state?["seed"]!=17)throw new InvalidDataException("Unsupported source state");
                        var frame=CampRenderFrame.FromState(state);if(frame.Actors.Count!=9||frame.Actors.Any(a=>!a.Alive))throw new InvalidDataException("Replay requires nine living source NPCs");frames.Add(frame);
                        // The raw complete state is now eligible for collection.
                        // Retain only detached renderer values, not JToken parents.
                    }
                }
                return new NativeRenderReplay(metadata,frames);
            }
        }
    }
}
