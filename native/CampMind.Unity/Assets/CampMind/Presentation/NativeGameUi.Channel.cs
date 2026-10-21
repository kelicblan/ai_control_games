using System;
using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        float ChannelMessage(string value,string npcId,float y,Color tint)
        {
            var width=Mathf.Max(180,channelBody.rect.width);var reply=!string.IsNullOrEmpty(npcId);
            var label=Label(channelBody,value,0,y,width-(reply?30:0),200,14);label.color=tint;
            var height=Mathf.Max(24,label.preferredHeight);
            if(reply){
                var settings=label.GetGenerationSettings(new Vector2(width-30,2000));var generator=label.cachedTextGenerator;generator.Populate(value,settings);
                var lines=generator.lines;var last=lines.Count>0?lines[lines.Count-1]:default(UILineInfo);var start=Mathf.Clamp(last.startCharIdx,0,value.Length);
                var tail=value.Substring(start).TrimEnd('\r','\n');var x=label.cachedTextGeneratorForLayout.GetPreferredWidth(tail,settings)/label.pixelsPerUnit;
                var lineY=lines.Count>0?(lines[0].topY-last.topY)/label.pixelsPerUnit:0;
                var icon=Button(channelBody,"回复 "+npcId,Mathf.Min(width-26,x+3),y+lineY-3,26,26,()=>{view.SelectNpc(npcId);Open("营地对话");});icon.text="";var button=icon.GetComponentInParent<Button>();NativeUiSurface.Plain(button.GetComponent<Image>());Icon(button.transform,"Reply",3,3,20);button.GetComponentInChildren<RawImage>().color=ReferenceUiArt.Gold;
                height=Mathf.Max(height,lineY+23);
            }
            return height+8;
        }
    }
}
