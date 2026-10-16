using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace CampMind.Presentation
{
    public sealed class NativeNpcSettings
    {
        readonly JObject source;
        public NativeNpcSettings(){source=JObject.Parse(Resources.Load<TextAsset>("NpcSettingsCatalog").text);}
        public JArray Fields=>(JArray)source["catalog"]["fields"];
        public JArray Characters=>(JArray)source["catalog"]["characters"];
        public JObject Defaults=>(JObject)source["defaults"].DeepClone();
        string FileName=>Path.Combine(Application.persistentDataPath,"npc-initial-settings.json");
        public JObject Load(){if(!File.Exists(FileName))return Defaults;var value=JObject.Parse(File.ReadAllText(FileName));Validate(value);return value;}
        public void Validate(JObject value)
        {
            if((int?)value["version"]!=1||(int?)value["schemaVersion"]!=1||(string)value["gameId"]!="campmind")throw new ArgumentException("NPC 配置版本不兼容");
            var people=value["characters"] as JObject;
            if(people==null||people.Count!=Characters.Count||people.Properties().Any(p=>!Characters.Any(c=>(string)c["id"]==p.Name)))throw new ArgumentException("NPC 配置必须包含完整的九名伙伴");
            foreach(var character in Characters)
            {
                var fields=people[(string)character["id"]] as JObject;
                if(fields==null||fields.Count!=Fields.Count)throw new ArgumentException("NPC 配置字段不完整");
                foreach(var field in Fields)
                {
                    var token=fields[(string)field["id"]];
                    if(token==null||(token.Type!=JTokenType.Float&&token.Type!=JTokenType.Integer))throw new ArgumentException("配置字段不是数值："+field["label"]);
                    var number=(double)token;
                    if(double.IsNaN(number)||double.IsInfinity(number)||number<(double)field["min"]||number>(double)field["max"])throw new ArgumentException("配置数值超出范围："+field["label"]);
                }
            }
        }
        public void Save(JObject value)
        {
            Validate(value);Directory.CreateDirectory(Application.persistentDataPath);
            var temp=FileName+"."+Guid.NewGuid().ToString("N")+".tmp";
            File.WriteAllText(temp,value.ToString());
            if(File.Exists(FileName))File.Replace(temp,FileName,null);else File.Move(temp,FileName);
        }
    }
}
