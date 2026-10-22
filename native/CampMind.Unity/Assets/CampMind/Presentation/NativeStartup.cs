using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UnityEngine.Video;

namespace CampMind.Presentation
{
    // Kept outside Camp so the video can render before the heavy scene is loaded.
    public sealed class NativeStartup : MonoBehaviour
    {
        public static bool Active { get; private set; }
        VideoPlayer video;
        RenderTexture texture;
        Image progress;
        Text label;
        Button retry;
        NativeCampView view;
        bool firstCycle, videoFailed, modelsReady, polling, preparationStarted;
        float sceneProgress, nextPoll, connectedAt;
        string failure;
        GameObject eventSystem;
        string captureDirectory;
        int loops;
        public static bool CanEnter(bool worldReady,bool modelsReady,bool firstCycle,bool videoFailed)=>worldReady&&modelsReady&&firstCycle&&!videoFailed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void EditorEntry()
        {
            if(FindFirstObjectByType<NativeStartup>()==null && FindFirstObjectByType<NativeCampView>()!=null)
                new GameObject("游戏启动加载").AddComponent<NativeStartup>();
        }
        void Awake()
        {
            Active=true;DontDestroyOnLoad(gameObject);
            var args=Environment.GetCommandLineArgs();var capture=Array.IndexOf(args,"-campmind-startup-capture");
            if(capture>=0&&capture+1<args.Length){captureDirectory=Path.GetFullPath(args[capture+1]);Directory.CreateDirectory(captureDirectory);}
            var canvas=gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=32760;
            gameObject.AddComponent<GraphicRaycaster>();
            var scaler=gameObject.AddComponent<CanvasScaler>();NativeUiScale.Configure(scaler);
            var background=Rect("启动画面",transform,Vector2.zero,Vector2.one);background.gameObject.AddComponent<Image>().color=Color.black;
            var screen=Rect("启动视频",background,Vector2.zero,Vector2.one).gameObject.AddComponent<RawImage>();
            screen.color=Color.white;
            texture=new RenderTexture(1920,1080,0);texture.Create();screen.texture=texture;
            var fit=screen.gameObject.AddComponent<AspectRatioFitter>();fit.aspectMode=AspectRatioFitter.AspectMode.FitInParent;fit.aspectRatio=16f/9;
            var logoTexture=Resources.Load<Texture2D>("Branding/startup-wordmark");
            if(logoTexture!=null){
                var logo=Rect("一寨之主",background,new Vector2(.35f,.82f),new Vector2(.65f,.98f)).gameObject.AddComponent<Image>();
                logo.sprite=Sprite.Create(logoTexture,new UnityEngine.Rect(0,0,logoTexture.width,logoTexture.height),new Vector2(.5f,.5f));
                logo.preserveAspect=true;
            }
            var track=Rect("加载进度底板",background,new Vector2(.05f,.018f),new Vector2(.95f,.032f));track.gameObject.AddComponent<Image>().color=new Color(.15f,.15f,.15f,.9f);
            progress=Rect("加载进度",track,Vector2.zero,new Vector2(0,1)).gameObject.AddComponent<Image>();progress.color=new Color(.85f,.69f,.36f);
            label=Rect("加载阶段",background,new Vector2(.05f,.04f),new Vector2(.95f,.09f)).gameObject.AddComponent<Text>();
            label.font=Resources.Load<Font>("Fonts/NotoSansCJKsc-Regular")??Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");label.fontSize=23;label.alignment=TextAnchor.MiddleCenter;label.text="正在准备游戏世界…";
            var retryRect=Rect("重试加载",background,new Vector2(.44f,.11f),new Vector2(.56f,.16f));retryRect.gameObject.AddComponent<Image>().color=new Color(.3f,.23f,.12f);
            retry=retryRect.gameObject.AddComponent<Button>();retry.onClick.AddListener(Retry);
            var retryText=Rect("重试文字",retryRect,Vector2.zero,Vector2.one).gameObject.AddComponent<Text>();retryText.font=label.font;retryText.fontSize=23;retryText.alignment=TextAnchor.MiddleCenter;retryText.text="重试加载";retry.gameObject.SetActive(false);
            eventSystem=new GameObject("启动界面输入",typeof(EventSystem),typeof(InputSystemUIInputModule));DontDestroyOnLoad(eventSystem);
            video=gameObject.AddComponent<VideoPlayer>();video.playOnAwake=false;video.source=VideoSource.Url;
            video.url=Path.Combine(Application.streamingAssetsPath,"Branding/gamestart.mp4");video.renderMode=VideoRenderMode.RenderTexture;video.targetTexture=texture;video.isLooping=true;video.waitForFirstFrame=true;
            video.audioOutputMode=VideoAudioOutputMode.Direct;
            video.loopPointReached+=_=>{firstCycle=true;loops++;};
            video.prepareCompleted+=p=>{if(p.width>0&&p.height>0)fit.aspectRatio=(float)p.width/p.height;p.Play();};
            video.errorReceived+=(_,message)=>{videoFailed=true;Fail("启动视频播放失败："+message);};video.Prepare();
            StartCoroutine(LoadWorld());
            if(captureDirectory!=null)StartCoroutine(CaptureVideo());
        }
        static RectTransform Rect(string name,Transform parent,Vector2 min,Vector2 max)
        {
            var rect=new GameObject(name,typeof(RectTransform)).GetComponent<RectTransform>();rect.SetParent(parent,false);rect.anchorMin=min;rect.anchorMax=max;rect.offsetMin=rect.offsetMax=Vector2.zero;return rect;
        }
        IEnumerator LoadWorld()
        {
            var deadline=Time.realtimeSinceStartup+20;
            while(!video.isPrepared&&!videoFailed&&Time.realtimeSinceStartup<deadline)yield return null;
            if(!video.isPrepared&&!videoFailed){videoFailed=true;Fail("启动视频准备超时");}
            yield return null;yield return new WaitForEndOfFrame();
            var probe=Environment.GetCommandLineArgs().Any(a=>a.StartsWith("-campmind-")&&a.EndsWith("-probe"));
            if(SceneManager.GetActiveScene().name!="Camp"){
                var loading=SceneManager.LoadSceneAsync("Camp",LoadSceneMode.Additive);
                while(!loading.isDone){sceneProgress=Mathf.Clamp01(loading.progress/.9f);yield return null;}
                SceneManager.SetActiveScene(SceneManager.GetSceneByName("Camp"));
            }
            sceneProgress=1;
            // All serialized meshes/materials and Start callbacks are ready before the gate opens.
            yield return null;yield return new WaitForEndOfFrame();
            view=FindFirstObjectByType<NativeCampView>();connectedAt=Time.realtimeSinceStartup;
            if(probe){Finish();yield break;}
            if(view==null)Fail("游戏场景加载失败");
        }
        void Update()
        {
            if(failure!=null){label.text=failure;return;}
            if(view==null){SetProgress(sceneProgress*.5f,"正在加载 3D 场景与资源");return;}
            var bridge=view.Authority;
            if(bridge==null||!bridge.ReadyForActions){
                SetProgress(.5f,"正在连接并同步游戏世界");
                if((bridge==null||!bridge.Connected)&&Time.realtimeSinceStartup-connectedAt>30)Fail("世界服务连接超时，请通过“运行游戏.cmd”启动游戏后重试。");
                return;
            }
            if(!modelsReady&&!polling&&Time.realtimeSinceStartup>=nextPoll){
                polling=true;nextPoll=Time.realtimeSinceStartup+.5f;
                bridge.Api("/game-api/startup-models",preparationStarted?null:new JObject(),(result,error)=>{
                    if(this==null||!Active)return;
                    polling=false;
                    if(error!=null){Fail("模型加载失败："+error);return;}
                    preparationStarted=true;
                    var stage=(string)result?["stage"];
                    if(stage=="idle"){preparationStarted=false;modelsReady=false;return;}
                    if(stage=="error"){Fail("模型加载失败："+(string)result?["error"]);return;}
                    modelsReady=stage=="ready";
                    SetProgress(.6f+.4f*((float?)result?["progress"]??0),modelsReady?"加载完成，正在进入游戏":"正在准备 MiniMind3 与所选大模型");
                });
            }
            if(CanEnter(bridge.ReadyForActions,modelsReady,firstCycle,videoFailed))Finish();
        }
        void SetProgress(float value,string phase)
        {
            progress.rectTransform.anchorMax=new Vector2(Mathf.Clamp01(value),1);label.text=$"{phase}  {Mathf.FloorToInt(value*100)}%";
        }
        void Fail(string message){failure=message;retry.gameObject.SetActive(true);}
        void Retry()
        {
            failure=null;modelsReady=false;preparationStarted=false;nextPoll=0;connectedAt=Time.realtimeSinceStartup;retry.gameObject.SetActive(false);
            if(videoFailed){videoFailed=false;firstCycle=false;video.Prepare();}
        }
        IEnumerator CaptureVideo()
        {
            while(video!=null&&!video.isPlaying&&!videoFailed)yield return null;
            yield return new WaitForSecondsRealtime(2);yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(captureDirectory,"startup-video.png"));
        }
        void Finish(){
            Active=false;
            // Retire the startup input before the game UI checks EventSystem.current.
            // Otherwise it adopts this temporary system, which OnDestroy removes.
            if(eventSystem!=null)eventSystem.SetActive(false);
            if(view!=null)view.CompleteStartup();
            if(captureDirectory!=null){
                File.WriteAllText(Path.Combine(captureDirectory,"startup-result.json"),new JObject{["success"]=true,["modelsReady"]=modelsReady,["worldReady"]=view?.Authority?.ReadyForActions??false,["firstCycle"]=firstCycle,["loops"]=loops,["videoLength"]=video.length,["elapsed"]=Time.realtimeSinceStartup}.ToString());
                view.StartCoroutine(CaptureGame(captureDirectory));
            }
            Destroy(gameObject);
        }
        static IEnumerator CaptureGame(string directory)
        {
            yield return new WaitForSecondsRealtime(2);yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"startup-game.png"));yield return new WaitForSecondsRealtime(1);Application.Quit();
        }
        void OnDestroy(){Active=false;if(video!=null)video.Stop();if(texture!=null){texture.Release();Destroy(texture);}if(eventSystem!=null)Destroy(eventSystem);}
    }
}
