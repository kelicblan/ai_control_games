using System;
using System.Collections;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        RectTransform triggerWindow;Text triggerText,triggerTitle,triggerPath;string triggerKind="mlp",triggerDiskPath="";bool triggerPolling;int triggerVersion;
        void BuildTriggerDebug()
        {
            var tools=Rect("触发调试按钮",hud,new Vector2(1,1),new Vector2(1,1),new Vector2(-270,-389),new Vector2(-16,-353));
            Button(tools,"MLP触发",0,0,122,36,()=>ToggleTriggerDebug("mlp"));
            Button(tools,"对话触发",130,0,124,36,()=>ToggleTriggerDebug("dialogue"));
            triggerWindow=Panel("触发调试窗口",hud,new Vector2(1,0),new Vector2(1,0),new Vector2(-354,96),new Vector2(-16,444));ReferenceUiArt.Surface(triggerWindow.GetComponent<Image>(),false,8);
            triggerTitle=Label(triggerWindow,"MLP触发记录 · 最新100条",12,8,278,30,16);triggerTitle.color=ReferenceUiArt.Gold;
            Button(triggerWindow,"关闭触发记录",298,7,30,30,()=>{triggerWindow.gameObject.SetActive(false);triggerVersion++;}).text="×";
            triggerPath=Label(triggerWindow,"",12,43,242,44,11);
            var copy=Button(triggerWindow,"复制日志路径",258,44,68,34,()=>GUIUtility.systemCopyBuffer=triggerDiskPath);copy.text="复制路径";copy.fontSize=12;
            Scroll(triggerWindow,"触发记录消息",new Vector2(12,12),new Vector2(-12,-101),out triggerText);triggerText.fontSize=14;
            triggerWindow.gameObject.SetActive(false);
        }
        void ToggleTriggerDebug(string kind)
        {
            if(triggerWindow.gameObject.activeSelf&&triggerKind==kind){triggerWindow.gameObject.SetActive(false);triggerVersion++;return;}
            triggerKind=kind;triggerVersion++;triggerWindow.gameObject.SetActive(true);triggerWindow.SetAsLastSibling();triggerTitle.text=(kind=="mlp"?"MLP触发记录":"NPC对话触发")+" · 最新100条";triggerText.text="正在读取真实触发记录…";
            if(!triggerPolling)StartCoroutine(PollTriggerDebug());
        }
        IEnumerator PollTriggerDebug()
        {
            triggerPolling=true;
            while(triggerWindow!=null&&triggerWindow.gameObject.activeInHierarchy){
                var client=view.Authority;var version=triggerVersion;bool done=false;
                if(client==null){triggerText.text="当前入口未连接正式地图服务";break;}
                client.Api("/game-api/pixel/trigger-debug?kind="+triggerKind,null,(json,error)=>{
                    done=true;
                    if(version!=triggerVersion||!triggerWindow.gameObject.activeInHierarchy)return;
                    if(error!=null||json==null){triggerText.text="读取失败："+error;return;}
                    try{var data=json;triggerDiskPath=((string)data["path"]??"").Split(new[]{" · "},StringSplitOptions.None)[0];triggerPath.text="完整日志："+System.IO.Path.GetFileName(triggerDiskPath)+"（SQLite）\n表：trigger_debug_v1";var rows=data["items"] as JArray;var text=new StringBuilder();
                        foreach(var row in rows??new JArray()){var time=DateTimeOffset.FromUnixTimeMilliseconds((long)row["wallMs"]).LocalDateTime;text.Append(time.ToString("HH:mm:ss")).Append(" · 游戏 ").Append(((double)row["elapsed"]).ToString("0.0")).Append("秒\n").Append((string)row["summary"]).Append("\n\n");}
                        triggerText.text=text.Length>0?text.ToString():"暂无触发记录。仅记录本版本运行后的真实触发，不补造历史。";
                    }catch(Exception e){triggerText.text="日志数据解析失败："+e.Message;}
                });
                while(!done)yield return null;
                yield return new WaitForSecondsRealtime(1);
            }
            triggerPolling=false;
        }
    }
}
