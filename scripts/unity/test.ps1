#Requires -Version 7.2
param(
    [ValidateSet('Core', 'EditMode', 'PlayMode')][string]$Suite = 'Core',
    [string]$Editor,
    [string]$Dotnet,
    [ValidateRange(10, 7200)][int]$TimeoutSeconds = 600
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'process.ps1')
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runDirectory = Join-Path $repository ('native/Artifacts/tests/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$resultFile = Join-Path $runDirectory 'results.xml'
$arguments = [System.Collections.Generic.List[string]]::new()
if ($Suite -eq 'Core') {
    if (-not $Dotnet) { $Dotnet = $env:CAMP_DOTNET }
    if (-not $Dotnet) {
        $command = Get-Command dotnet -ErrorAction SilentlyContinue
        if ($command) { $Dotnet = $command.Source }
    }
    if (-not $Dotnet -or -not (Test-Path -LiteralPath $Dotnet -PathType Leaf)) { throw 'A .NET 8 SDK is required. Set CAMP_DOTNET to its dotnet.exe.' }
    $executable = (Resolve-Path -LiteralPath $Dotnet).Path
    foreach ($argument in @('run', '--project', (Join-Path $repository 'native/Tests/CampMind.Foundation.Tests.csproj'), '--', "--result=$resultFile", '--workers=2')) { $arguments.Add($argument) }
} else {
    $environment = Get-CampMindUnityEnvironment -Editor $Editor
    if (-not $environment.readyForUnityValidation) { throw $environment.nextAction }
    $executable = $environment.editorPath
    foreach ($argument in @('-batchmode', '-projectPath', (Join-Path $repository 'native/CampMind.Unity'), '-runTests', '-testPlatform', $Suite,
        '-testResults', $resultFile, '-logFile', (Join-Path $runDirectory 'editor.log'))) { $arguments.Add($argument) }
}
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $executable
$start.WorkingDirectory = $repository
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
foreach ($argument in $arguments) { $start.ArgumentList.Add($argument) }
if ($Suite -eq 'Core') {
    $start.Environment['DOTNET_ROOT'] = [System.IO.Path]::GetDirectoryName($executable)
    $start.Environment['DOTNET_ROOT_X64'] = [System.IO.Path]::GetDirectoryName($executable)
}
$exitCode = Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $runDirectory -TimeoutSeconds $TimeoutSeconds
if ($exitCode -ne 0) { throw "Test process failed with exit $exitCode; see $runDirectory" }
if (-not (Test-Path -LiteralPath $resultFile)) { throw "No test report produced; see $runDirectory" }
[xml]$results = Get-Content -LiteralPath $resultFile -Raw
$run = $results.'test-run'
if (-not $run -or [int]$run.total -lt 1 -or $run.result -ne 'Passed' -or [int]$run.failed -gt 0) { throw "Test report did not pass; see $resultFile" }
Write-Output "$Suite passed: $($run.passed)/$($run.total). Report: $resultFile"
