#Requires -Version 7.2
param(
    [string]$Editor,
    [ValidateSet('IL2CPP', 'Mono')][string]$Backend = 'IL2CPP',
    [ValidateSet('Release', 'Development')][string]$Configuration = 'Release',
    [ValidateSet('Win64')][string]$Target = 'Win64',
    [ValidateSet('Compatibility', 'Camp')][string]$Scene = 'Compatibility',
    [switch]$GuardBuildReportPort,
    [switch]$KeepBuildDebugFiles,
    [ValidateRange(10, 7200)][int]$TimeoutSeconds = 1800
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'process.ps1')
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$environment = Get-CampMindUnityEnvironment -Editor $Editor
if (-not $environment.readyForUnityValidation) { throw $environment.nextAction }
# Keep one successful output plus one bounded staging directory.
. (Join-Path $PSScriptRoot 'build-output.ps1')
$buildRoot=Get-CampMindBuildRoot
$output=Join-Path $buildRoot "$Scene-$Backend"
$staging=Join-Path $buildRoot ".building-$Scene-$Backend"
$artifacts=Join-Path $repository 'native/Artifacts'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
try{$lock=[IO.File]::Open((Join-Path $artifacts 'build-output.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Another build is running. Wait for it to finish.'}
try{
    $project=Join-Path $repository 'native/CampMind.Unity'
    if(Get-CimInstance Win32_Process | Where-Object {Test-CampMindInteractiveEditor -Process $_ -EditorPath $environment.editorPath -ProjectPath $project} | Select-Object -First 1){throw 'Please close this Unity project before building. Your previous EXE is preserved.'}
    $null=Assert-CampMindBuildDirectory -Path $output
    Remove-CampMindBuildDirectory -Path $staging
    if($Scene -eq 'Camp'){
        Push-Location $repository
        try{& node --import tsx scripts/export-unity-render-replay.ts;if($LASTEXITCODE -ne 0){throw 'Source render replay export failed'};& node --import tsx scripts/export-unity-ui.ts;if($LASTEXITCODE -ne 0){throw 'Source UI/audio export failed'}}finally{Pop-Location}
        & (Join-Path $PSScriptRoot 'build-lods.ps1') -Editor $environment.editorPath -GuardBuildReportPort:$GuardBuildReportPort
    }
    $runId=[guid]::NewGuid().ToString('N')
    $runDirectory=Join-Path $repository "native/Artifacts/builds/$runId"
    $stagingExecutable=Join-Path $staging 'CampMind.exe'
    New-Item -ItemType Directory -Force $runDirectory | Out-Null
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$environment.editorPath;$start.WorkingDirectory=$repository
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    foreach($argument in @('-batchmode','-quit','-projectPath',$project,'-executeMethod','CampMind.Editor.BuildEntry.BuildCompatibilitySmoke',
        '-campmind-build-output',$stagingExecutable,'-campmind-backend',$Backend,'-campmind-configuration',$Configuration,'-campmind-scene',$Scene,'-logFile',(Join-Path $runDirectory 'editor.log'))){$start.ArgumentList.Add($argument)}
    $exitCode=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $runDirectory -TimeoutSeconds $TimeoutSeconds -GuardBuildReportPort:$GuardBuildReportPort
    if($exitCode -ne 0 -or -not(Test-Path -LiteralPath $stagingExecutable)){throw "Native build failed (exit $exitCode). Previous EXE preserved. See $runDirectory"}
    if($Configuration -eq 'Release' -and -not $KeepBuildDebugFiles){Remove-CampMindBuildDebugFiles -Path $staging}
    $checkedStaging=Assert-CampMindBuildDirectory -Path $staging
    $checkedOutput=Assert-CampMindBuildDirectory -Path $output
    Remove-CampMindBuildDirectory -Path $checkedOutput
    Move-Item -LiteralPath $checkedStaging -Destination $checkedOutput
    $executable=Join-Path $checkedOutput 'CampMind.exe'
    $result=@{version=1;kind=if($Scene -eq 'Camp'){'native-presentation-preview'}else{'compatibility-smoke-only'};backend=$Backend;configuration=$Configuration;executable=$executable;logDirectory=$runDirectory}
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'build.json') -Encoding utf8
    & (Join-Path $PSScriptRoot 'clean-builds.ps1')
    $result | ConvertTo-Json
}finally{
    try{Remove-CampMindBuildDirectory -Path $staging}finally{$lock.Dispose()}
}
