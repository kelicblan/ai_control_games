using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
namespace CampMind.Presentation
{
    public static class NativeFileDialog
    {
        public static Task<string> Begin(Func<string> picker)
        {
            var result=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var worker=new Thread(()=>{try{result.SetResult(picker());}catch(Exception e){result.SetException(e);}}){IsBackground=true,Name="CampMind file picker"};
            #if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            worker.SetApartmentState(ApartmentState.STA);
            #endif
            worker.Start();return result.Task;
        }
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
        sealed class OpenFileName
        {
            public int size=Marshal.SizeOf(typeof(OpenFileName));
            public IntPtr owner,instance;
            public string filter="JSON 文件\0*.json\0所有文件\0*.*\0\0";
            public IntPtr customFilter;
            public int maxCustomFilter,index=1;
            public IntPtr file;
            public int maxFile=32768;
            public IntPtr fileTitle;
            public int maxFileTitle;
            public string initialDirectory,title;
            public int flags;
            public short fileOffset,extensionOffset;
            public string extension="json";
            public IntPtr customData,hook,template;
            public IntPtr reserved;
            public int reservedSize,flagsEx;
        }
        [DllImport("comdlg32.dll",CharSet=CharSet.Unicode)] static extern bool GetOpenFileName([In,Out] OpenFileName value);
        [DllImport("comdlg32.dll",CharSet=CharSet.Unicode)] static extern bool GetSaveFileName([In,Out] OpenFileName value);
        [DllImport("comdlg32.dll")] static extern uint CommDlgExtendedError();
        public static string Choose(bool save,string title,string name="")
        {
            #if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            var options=new OpenFileName{title=title,owner=System.Diagnostics.Process.GetCurrentProcess().MainWindowHandle,flags=0x00080000|0x00000008|0x00000800|(save?0x00000002:0x00001000)};
            options.file=Marshal.StringToHGlobalUni(name.PadRight(options.maxFile-1,'\0'));
            try{
                if(save?GetSaveFileName(options):GetOpenFileName(options))return Marshal.PtrToStringUni(options.file);
                var error=CommDlgExtendedError();if(error!=0)throw new InvalidOperationException("文件选择失败："+error);return null;
            }finally{Marshal.FreeHGlobal(options.file);}
            #else
            throw new PlatformNotSupportedException("文件选择需要 Windows 桌面平台");
            #endif
        }
    }
}
