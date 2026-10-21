using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

// 这只是C#9语法检查：没有Unity引用，不冒充Unity编译、着色器或原生运行验证。
var root = args.Length > 0 ? args[0] : "native/CampMind.Unity/Assets/CampMind/PixelWorld";
if (!Directory.Exists(root)) { Console.Error.WriteLine("Missing source directory: " + root); return 2; }
var files = Directory.GetFiles(root, "*.cs", SearchOption.AllDirectories);
if (files.Length == 0) { Console.Error.WriteLine("No C# sources found"); return 2; }
var errors = 0;
foreach (var file in files)
{
    foreach (var symbols in new[] { Array.Empty<string>(), new[] { "UNITY_EDITOR" } })
    {
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(file),
            new CSharpParseOptions(LanguageVersion.CSharp9, preprocessorSymbols: symbols), file);
        foreach (var diagnostic in tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error))
        { Console.Error.WriteLine(diagnostic); errors++; }
    }
}
Console.WriteLine($"C#9 syntax only: {files.Length} files, {errors} errors. Unity compilation and rendering NOT verified.");
return errors == 0 ? 0 : 1;
