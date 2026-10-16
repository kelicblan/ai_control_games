using System;
using System.Runtime.InteropServices;
using System.Text;

namespace CampMind.Compatibility
{
    internal static class WindowsSqliteProbe
    {
        private const string Library = "winsqlite3.dll";
        [DllImport(Library, EntryPoint="sqlite3_open_v2", CallingConvention=CallingConvention.Cdecl)] private static extern int Open(byte[] file, out IntPtr db, int flags, IntPtr vfs);
        [DllImport(Library, EntryPoint="sqlite3_close", CallingConvention=CallingConvention.Cdecl)] private static extern int Close(IntPtr db);
        [DllImport(Library, EntryPoint="sqlite3_exec", CallingConvention=CallingConvention.Cdecl)] private static extern int Exec(IntPtr db, byte[] sql, IntPtr callback, IntPtr context, out IntPtr error);
        [DllImport(Library, EntryPoint="sqlite3_free", CallingConvention=CallingConvention.Cdecl)] private static extern void Free(IntPtr error);
        [DllImport(Library, EntryPoint="sqlite3_prepare_v2", CallingConvention=CallingConvention.Cdecl)] private static extern int Prepare(IntPtr db, byte[] sql, int length, out IntPtr statement, IntPtr tail);
        [DllImport(Library, EntryPoint="sqlite3_step", CallingConvention=CallingConvention.Cdecl)] private static extern int Step(IntPtr statement);
        [DllImport(Library, EntryPoint="sqlite3_column_text", CallingConvention=CallingConvention.Cdecl)] private static extern IntPtr Text(IntPtr statement, int column);
        [DllImport(Library, EntryPoint="sqlite3_finalize", CallingConvention=CallingConvention.Cdecl)] private static extern int Finalize(IntPtr statement);
        [DllImport(Library, EntryPoint="sqlite3_libversion", CallingConvention=CallingConvention.Cdecl)] private static extern IntPtr Version();
        private static byte[] Utf8(string value) => Encoding.UTF8.GetBytes(value + "\0");
        private static void Check(int result) { if (result != 0) throw new InvalidOperationException("SQLite probe failed: " + result); }

        internal static string Run(string file, out string version)
        {
            IntPtr db = IntPtr.Zero, statement = IntPtr.Zero;
            version = Marshal.PtrToStringUTF8(Version());
            try
            {
                Check(Open(Utf8(file), out db, 6, IntPtr.Zero));
                var result = Exec(db, Utf8("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES('领主与属民');"), IntPtr.Zero, IntPtr.Zero, out var error);
                if (error != IntPtr.Zero) Free(error);
                Check(result);
                Check(Close(db)); db = IntPtr.Zero;
                Check(Open(Utf8(file), out db, 1, IntPtr.Zero));
                var query = Utf8("SELECT value FROM probe");
                Check(Prepare(db, query, query.Length - 1, out statement, IntPtr.Zero));
                if (Step(statement) != 100) throw new InvalidOperationException("SQLite probe row missing");
                return Marshal.PtrToStringUTF8(Text(statement, 0));
            }
            finally
            {
                if (statement != IntPtr.Zero) Finalize(statement);
                if (db != IntPtr.Zero) Close(db);
            }
        }
    }
}
