using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using NUnit.Framework;
using CampMind.Presentation;
namespace CampMind.Tests
{
    public class NativeFileDialogTests
    {
        [Test] public void WindowsDialogStructureCanBeMarshalledBeforeOpeningAnyWindow()
        {
            var type=typeof(NativeFileDialog).GetNestedType("OpenFileName",BindingFlags.NonPublic);
            Assert.DoesNotThrow(()=>Activator.CreateInstance(type));
            Assert.That(Marshal.SizeOf(type),Is.EqualTo(IntPtr.Size==8?152:88));
        }
        [Test] public void FilePickerWaitRunsOffTheGameThread()
        {
            using(var release=new ManualResetEventSlim())
            {
                var caller=Thread.CurrentThread.ManagedThreadId;var worker=caller;
                var task=NativeFileDialog.Begin(()=>{worker=Thread.CurrentThread.ManagedThreadId;release.Wait(3000);return "selected.json";});
                Assert.That(task.IsCompleted,Is.False);release.Set();Assert.That(task.Wait(3000),Is.True);
                Assert.That(task.Result,Is.EqualTo("selected.json"));Assert.That(worker,Is.Not.EqualTo(caller));
            }
        }
    }
}
