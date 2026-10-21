using System;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace CampMind.Presentation
{
    public sealed partial class NativeVillageUi
    {
        JObject migrationMapping=new JObject(),migrationPreview;
        bool acknowledgeArchive;
        readonly string[] prototypes={"W001","W002","W003","H001","H002","H003","H004","H005","H006","H007"};
        void MigrationControls()
        {
            Text("或从已暂停的原模式复制转换。请逐人选择新原型；原存档和未映射社会记录保留。");
            foreach(var person in view.World?["npcs"] as JArray??new JArray()){
                var id=(string)person["id"];var current=(string)migrationMapping[id];
                Button(content,(string)person["name"]+" → "+(current??"尚未选择原型")+"（切换）",()=>{var i=Array.IndexOf(prototypes,(string)migrationMapping[id]);migrationMapping[id]=prototypes[(i+1)%prototypes.Length];migrationPreview=null;signature="";Refresh();});
            }
            Button(content,acknowledgeArchive?"已确认：未映射内容留在原档和私有归档":"确认保留未映射的记忆、关系和未完成工作",()=>{acknowledgeArchive=!acknowledgeArchive;migrationPreview=null;signature="";Refresh();});
            Button(content,"生成转换预览",()=>{
                if(pending)return;pending=true;
                view.Authority.Api("/game-api/village",new JObject{["type"]="migration-preview",["mappings"]=Mapping()},(result,error)=>{pending=false;Error=error??"";migrationPreview=error==null?result?["migrationPreview"] as JObject:null;signature="";Refresh();});
            });
            if(migrationPreview==null)return;
            Text("将复制的物资："+migrationPreview["inventory"]+"\n目标规则："+migrationPreview["ruleVersion"]);
            foreach(var warning in migrationPreview["warnings"] as JArray??new JArray())Text(warning.ToString());
            foreach(var blocker in migrationPreview["blockers"] as JArray??new JArray())Text("阻止转换："+blocker);
            if(!(migrationPreview["blockers"] as JArray??new JArray()).Any())Button(content,"按此预览创建新存档",()=>Send(new JObject{["type"]="migration-apply",["mappings"]=Mapping(),["sourceHash"]=migrationPreview["sourceHash"]}));
        }
        JObject Mapping()=>new JObject{["actors"]=migrationMapping.DeepClone(),["acknowledgeArchive"]=acknowledgeArchive};
    }
}
