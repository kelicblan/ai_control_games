using System;
using System.Collections;
using System.Runtime.InteropServices;
using UnityEngine;
namespace CampMind.Presentation
{
    public enum GameScreenMode { Windowed, Maximized, Fullscreen }
    public sealed class NativeDisplaySettings : MonoBehaviour
    {
        const string Preference="CampMind.ScreenMode";
        static NativeDisplaySettings instance;
        public static GameScreenMode Current { get; private set; }
        public static bool UseNativeResolution(string[] args)=>Array.IndexOf(args,"-windowed")<0&&Array.IndexOf(args,"-screen-width")<0&&Array.IndexOf(args,"-screen-height")<0&&Array.IndexOf(args,"-screen-fullscreen")<0;
        public static GameScreenMode ValidateMode(int value)=>value>=0&&value<=2?(GameScreenMode)value:GameScreenMode.Windowed;
        public static Vector2Int FitWindow(int width,int height)
        {
            float scale=Mathf.Min(1,Mathf.Max(1,width-32)/1920f,Mathf.Max(1,height-64)/1080f);
            return new Vector2Int(Mathf.Max(1,Mathf.FloorToInt(1920*scale)),Mathf.Max(1,Mathf.FloorToInt(1080*scale)));
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Initialize()
        {
            Current=ValidateMode(PlayerPrefs.GetInt(Preference,0));
            if(Application.isEditor||Application.isBatchMode)return;
            instance=new GameObject("屏幕模式").AddComponent<NativeDisplaySettings>();
            DontDestroyOnLoad(instance.gameObject);
            if(UseNativeResolution(Environment.GetCommandLineArgs()))Apply(Current,false);
        }
        public static void Apply(GameScreenMode mode,bool save=true)
        {
            Current=ValidateMode((int)mode);
            if(save){PlayerPrefs.SetInt(Preference,(int)Current);PlayerPrefs.Save();}
            if(Application.isEditor||Application.isBatchMode||instance==null)return;
            instance.StopAllCoroutines();instance.StartCoroutine(instance.Change(Current));
        }
        IEnumerator Change(GameScreenMode mode)
        {
            int width=Display.main.systemWidth,height=Display.main.systemHeight;
            if(width<=0||height<=0){width=Screen.currentResolution.width;height=Screen.currentResolution.height;}
            if(mode==GameScreenMode.Fullscreen){Screen.SetResolution(width,height,FullScreenMode.FullScreenWindow);yield break;}
            var size=FitWindow(width,height);
            Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);
            yield return null;yield return new WaitForEndOfFrame();
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
            var window=System.Diagnostics.Process.GetCurrentProcess().MainWindowHandle;
            if(window!=IntPtr.Zero){
                ShowWindow(window,9);
                if(mode==GameScreenMode.Maximized)ShowWindow(window,3);
                else {
                    var monitor=MonitorFromWindow(window,2);var info=new MonitorInfo{size=Marshal.SizeOf(typeof(MonitorInfo))};
                    if(GetMonitorInfo(monitor,ref info)){
                        size=FitWindow(info.work.right-info.work.left,info.work.bottom-info.work.top);
                        var rect=new WinRect{right=size.x,bottom=size.y};
                        AdjustWindowRectEx(ref rect,GetWindowLong(window,-16),false,GetWindowLong(window,-20));
                        int w=rect.right-rect.left,h=rect.bottom-rect.top;
                        SetWindowPos(window,IntPtr.Zero,info.work.left+(info.work.right-info.work.left-w)/2,info.work.top+(info.work.bottom-info.work.top-h)/2,w,h,0x14);
                    }
                }
            }
#else
            if(mode==GameScreenMode.Maximized)Screen.SetResolution(width,Mathf.Max(1,height-64),FullScreenMode.Windowed);
#endif
        }
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
        [StructLayout(LayoutKind.Sequential)] struct WinRect { public int left,top,right,bottom; }
        [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int size;public WinRect monitor,work;public uint flags; }
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
        [DllImport("user32.dll",CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
        [DllImport("user32.dll")] static extern bool AdjustWindowRectEx(ref WinRect rect,int style,bool menu,int extendedStyle);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
#endif
    }
}
