using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed partial class NativeGameUi
    {
        int settingsCategory;
        void SettingsNavigation()
        {
            var names=new[]{"画面与声音","对话与认知","游戏与退出"};
            var nav=At("系统设置分类",modal,26,83,508,44);
            for(var i=0;i<names.Length;i++){
                var category=i;var label=Button(nav,names[i],i*171,0,166,40,()=>{settingsCategory=category;Open("游戏设置");});
                var skin=label.GetComponentInParent<Button>().GetComponentInChildren<NativeUiSurface>();
                if(i==settingsCategory){skin.Set(new Color32(65,73,42,255),new Color32(51,65,39,255),new Color32(216,191,120,110));label.color=new Color32(241,214,159,255);}
                else NativeUiSurface.Plain((Image)label.GetComponentInParent<Button>().targetGraphic);
            }
            body.offsetMax=new Vector2(-26,-146);
        }
        void GameSettings()
        {
            if(settingsCategory==1){ModelSettings();return;}
            foreach(Transform child in modal)if(child.GetComponent<NativeUiSurface>()==null)Destroy(child.gameObject);
            SourceDialog("游戏设置",560,settingsCategory==0?730:570);SettingsNavigation();var content=SourceScroll(body,"系统设置内容");
            if(settingsCategory==0){
                Icon(content,"Camera",0,0,22);Label(content,"显示与画质",34,0,474,30,18).fontStyle=FontStyle.Bold;
                var screenModes=new[]{"初始窗口","最大化窗口","全屏模式"};
                for(var i=0;i<3;i++){
                    var mode=(GameScreenMode)i;
                    Button(content,(NativeDisplaySettings.Current==mode?"✓ ":"")+screenModes[i],i*171,48,166,34,()=>{NativeDisplaySettings.Apply(mode);Open("游戏设置");});
                }
                Label(content,$"当前渲染：{Screen.width} × {Screen.height}   ·   原生比例 100%",0,86,508,26,12).color=new Color32(173,194,153,255);
                Paragraph(content,"三档画质调整阴影精度、远处细节和抗锯齿，界面文字始终按当前输出分辨率绘制。",0,127,508,11);
                var quality=GetComponent<NativeQualityView>();var names=new[]{"低画质","中画质","高画质"};var notes=new[]{"减少阴影与远处细节","平衡画面与性能","更精细的阴影与远景"};
                for(var i=0;i<3;i++){
                    var level=i;var button=Card(content,names[i],notes[i],i==0?"Leaf":i==1?"Sun":"Sparkles",0,198+i*81,508,70,()=>{quality.Apply(level);Open("游戏设置");});
                    if(quality!=null&&quality.Current==i){button.GetComponentInChildren<NativeUiSurface>().Set(new Color32(59,72,43,255),new Color32(39,61,38,255),new Color32(221,190,113,130));Icon(button.transform,"Check",470,25,20);}
                }
                var audio=GetComponent<NativeGameAudio>();Card(content,audio!=null&&audio.SoundEnabled?"环境音：开启":"环境音：关闭","风雨、溪流、脚步与营地声音","Volume2",0,460,508,65,()=>{audio?.Toggle();Open("游戏设置");});
                content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,545);
            }else{
                Icon(content,"House",0,0,22);Label(content,"游戏",34,0,474,30,18).fontStyle=FontStyle.Bold;
                Paragraph(content,"进度自动保存。退出会关闭游戏窗口和本地世界服务，下次运行继续已有进度。",0,52,508,12);
                Card(content,"返回游戏","关闭设置，继续村寨生活","Play",0,125,508,65,Close);
                Card(content,"退出游戏","保存当前进度并关闭游戏","House",0,207,508,65,()=>Open("确认退出"));
                Button(content,"开始新的旅程",0,304,246,44,()=>Open("开始旅程"));Button(content,"重置世界…",262,304,246,44,()=>Open("确认重置"));
                content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical,370);
            }
        }
        void QuitConfirmation()
        {
            SourceDialog("退出游戏",440,290);
            Paragraph(body,"当前进度会保留。确定退出村寨生活吗？",0,0,388,13);
            Button(body,"取消退出",0,88,185,44,()=>{settingsCategory=2;Open("游戏设置");});
            Button(body,"确认退出游戏",203,88,185,44,Quit);
        }
    }
}
