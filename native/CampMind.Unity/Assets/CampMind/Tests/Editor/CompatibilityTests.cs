using System;
using System.IO;
using NUnit.Framework;
using CampMind.Compatibility;

public sealed class CompatibilityTests
{
    [Test]
    public void NativeCompatibilityRoundTripsCommandAndSqliteAtUnicodePath()
    {
        var directory = Path.Combine(Path.GetTempPath(), "campmind-unity-兼容-" + Guid.NewGuid().ToString("N"));
        try
        {
            var result = RuntimeSmoke.Probe(directory);
            Assert.That(result.success, Is.True);
            Assert.That(result.commandRoundTrip, Is.True);
            Assert.That(result.sqliteText, Is.EqualTo("领主与属民"));
            Assert.That(result.sqliteVersion, Is.Not.Empty);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
