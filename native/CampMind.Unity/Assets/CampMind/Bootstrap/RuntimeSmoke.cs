using System;
using System.IO;
using CampMind.Foundation;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using UnityEngine;

namespace CampMind.Compatibility
{
    [Serializable]
    public sealed class SmokeResult
    {
        public int version = 1;
        public bool success;
        public bool commandRoundTrip;
        public string sqliteText;
        public string sqliteVersion;
        public string backend;
        public string graphicsApi;
        public string error;
    }

    public static class RuntimeSmoke
    {
        public static SmokeResult Probe(string directory)
        {
            Directory.CreateDirectory(directory);
            var command = new CommandEnvelope<string>("smoke-command", "smoke-session", "local-player", new WorldVersion("smoke-generation", "smoke-branch", 7, 9), "gate-toggle", "{}");
            var settings = new JsonSerializerSettings { ContractResolver = new CamelCasePropertyNamesContractResolver() };
            var json = JsonConvert.SerializeObject(command, settings);
            var restored = JsonConvert.DeserializeObject<CommandEnvelope<string>>(json, settings);
            var roundTrip = restored != null && restored.CommandId == command.CommandId && restored.ExpectedVersion.MatchesScope(command.ExpectedVersion)
                && restored.ExpectedVersion.Revision == 7 && restored.ExpectedVersion.Tick == 9 && restored.Payload == "{}";
            var text = WindowsSqliteProbe.Run(Path.Combine(directory, "营地-" + Guid.NewGuid().ToString("N") + ".sqlite"), out var sqliteVersion);
            return new SmokeResult { success = roundTrip && text == "领主与属民", commandRoundTrip = roundTrip, sqliteText = text, sqliteVersion = sqliteVersion,
#if ENABLE_IL2CPP
                backend = "IL2CPP",
#else
                backend = Application.isEditor ? "Editor" : "Mono",
#endif
                graphicsApi = SystemInfo.graphicsDeviceType.ToString() };
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void RunRequestedProbe()
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, "-campmind-smoke-output");
            if (index < 0) return;
            if (index + 1 >= args.Length) { Application.Quit(2); return; }
            var output = Path.GetFullPath(args[index + 1]);
            SmokeResult result;
            try { result = Probe(Path.Combine(Path.GetDirectoryName(output), "database")); }
            catch (Exception error) { result = new SmokeResult { success = false, error = error.ToString() }; }
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            File.WriteAllText(output, JsonConvert.SerializeObject(result, Formatting.Indented));
            Application.Quit(result.success ? 0 : 1);
        }
    }
}
