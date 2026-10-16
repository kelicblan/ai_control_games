using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using CampMind.Foundation;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using NUnit.Framework;

namespace CampMind.Compatibility.Tests
{
    // These are desktop .NET probes, not a substitute for Unity IL2CPP tests.
    public sealed class CompatibilityTests
    {
        [Test]
        public void JsonRoundTripPreservesCommandScopeAndRejectsInvalidCounters()
        {
            var settings = new JsonSerializerSettings { ContractResolver = new CamelCasePropertyNamesContractResolver() };
            var command = new CommandEnvelope<string>("op-1", "session", "local-player", new WorldVersion("generation", "branch", 7, 9), "gate-toggle", "{}");
            var json = JsonConvert.SerializeObject(command, settings);
            Assert.That(json, Does.Contain("\"commandId\":\"op-1\""));
            var restored = JsonConvert.DeserializeObject<CommandEnvelope<string>>(json, settings)!;
            Assert.That(restored.ExpectedVersion.MatchesScope(command.ExpectedVersion), Is.True);
            Assert.That(restored.ExpectedVersion.Revision, Is.EqualTo(7));
            Assert.That(restored.Payload, Is.EqualTo("{}"));
            Assert.Throws<ArgumentOutOfRangeException>(() => JsonConvert.DeserializeObject<WorldVersion>("{\"generation\":\"g\",\"branch\":\"b\",\"revision\":-1,\"tick\":0}"));
        }

        [Test]
        public void WindowsSqliteCanPersistAndReopenUtf8DataAtAUnicodePath()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) Assert.Ignore("Windows native SQLite probe");
            var directory = Path.Combine(Path.GetTempPath(), "campmind-native-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            var file = Path.Combine(directory, "营地 smoke.sqlite");
            IntPtr db = IntPtr.Zero, statement = IntPtr.Zero;
            try
            {
                Assert.That(Sqlite.Open(Utf8(file), out db, 6, IntPtr.Zero), Is.Zero);
                Assert.That(Sqlite.Exec(db, Utf8("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES('领主与属民');"), IntPtr.Zero, IntPtr.Zero, out var error), Is.Zero);
                if (error != IntPtr.Zero) Sqlite.Free(error);
                Assert.That(Sqlite.Close(db), Is.Zero); db = IntPtr.Zero;
                Assert.That(Sqlite.Open(Utf8(file), out db, 1, IntPtr.Zero), Is.Zero);
                var query = Utf8("SELECT value FROM probe");
                Assert.That(Sqlite.Prepare(db, query, query.Length - 1, out statement, IntPtr.Zero), Is.Zero);
                Assert.That(Sqlite.Step(statement), Is.EqualTo(100));
                Assert.That(Marshal.PtrToStringUTF8(Sqlite.ColumnText(statement, 0)), Is.EqualTo("领主与属民"));
            }
            finally
            {
                if (statement != IntPtr.Zero) Sqlite.Finalize(statement);
                if (db != IntPtr.Zero) Sqlite.Close(db);
                Directory.Delete(directory, true);
            }
        }

        private static byte[] Utf8(string value) => Encoding.UTF8.GetBytes(value + "\0");
        private static class Sqlite
        {
            private const string Library = "winsqlite3.dll";
            [DllImport(Library, EntryPoint = "sqlite3_open_v2", CallingConvention = CallingConvention.Cdecl)] public static extern int Open(byte[] file, out IntPtr db, int flags, IntPtr vfs);
            [DllImport(Library, EntryPoint = "sqlite3_close", CallingConvention = CallingConvention.Cdecl)] public static extern int Close(IntPtr db);
            [DllImport(Library, EntryPoint = "sqlite3_exec", CallingConvention = CallingConvention.Cdecl)] public static extern int Exec(IntPtr db, byte[] sql, IntPtr callback, IntPtr context, out IntPtr error);
            [DllImport(Library, EntryPoint = "sqlite3_free", CallingConvention = CallingConvention.Cdecl)] public static extern void Free(IntPtr value);
            [DllImport(Library, EntryPoint = "sqlite3_prepare_v2", CallingConvention = CallingConvention.Cdecl)] public static extern int Prepare(IntPtr db, byte[] sql, int length, out IntPtr statement, IntPtr tail);
            [DllImport(Library, EntryPoint = "sqlite3_step", CallingConvention = CallingConvention.Cdecl)] public static extern int Step(IntPtr statement);
            [DllImport(Library, EntryPoint = "sqlite3_column_text", CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr ColumnText(IntPtr statement, int column);
            [DllImport(Library, EntryPoint = "sqlite3_finalize", CallingConvention = CallingConvention.Cdecl)] public static extern int Finalize(IntPtr statement);
        }
    }
}
