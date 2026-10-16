#Requires -Version 7.2
param(
    [string]$Editor,
    [ValidateSet('IL2CPP', 'Mono')][string]$Backend = 'IL2CPP',
    [ValidateSet('Release', 'Development')][string]$Configuration = 'Release',
    [ValidateSet('Win64')][string]$Target = 'Win64',
    [ValidateSet('Compatibility', 'Camp')][string]$Scene = 'Compatibility',
    [switch]$GuardBuildReportPort,
    [ValidateRange(10, 7200)][int]$TimeoutSeconds = 1800
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'process.ps1')
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$environment = Get-CampMindUnityEnvironment -Editor $Editor
if (-not $environment.readyForUnityValidation) { throw $environment.nextAction }
if($Scene -eq 'Camp'){
    Push-Location $repository
    try{& node --import tsx scripts/export-unity-render-replay.ts;if($LASTEXITCODE -ne 0){throw 'Source render replay export failed'}}finally{Pop-Location}
    & (Join-Path $PSScriptRoot 'build-lods.ps1') -Editor $environment.editorPath -GuardBuildReportPort:$GuardBuildReportPort
}
$runId = [guid]::NewGuid().ToString('N')
$runDirectory = Join-Path $repository "native/Artifacts/builds/$runId"
$executable = Join-Path $repository "native/Builds/$Scene-$Backend-$runId/CampMind.exe"
New-Item -ItemType Directory -Force $runDirectory | Out-Null
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName=$environment.editorPath
$start.WorkingDirectory=$repository
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
foreach ($argument in @('-batchmode','-quit','-projectPath',(Join-Path $repository 'native/CampMind.Unity'),'-executeMethod','CampMind.Editor.BuildEntry.BuildCompatibilitySmoke',
    '-campmind-build-output',$executable,'-campmind-backend',$Backend,'-campmind-configuration',$Configuration,'-campmind-scene',$Scene,'-logFile',(Join-Path $runDirectory 'editor.log'))) { $start.ArgumentList.Add($argument) }
$exitCode=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $runDirectory -TimeoutSeconds $TimeoutSeconds -GuardBuildReportPort:$GuardBuildReportPort
if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $executable)) { throw "Native build failed (exit $exitCode). See $runDirectory" }
$result=@{version=1;kind=if($Scene -eq 'Camp'){'native-presentation-preview'}else{'compatibility-smoke-only'};backend=$Backend;configuration=$Configuration;executable=$executable;logDirectory=$runDirectory}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'build.json') -Encoding utf8
$result | ConvertTo-Json
