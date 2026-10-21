#Requires -Version 7.2
param([switch]$ApplyManual,[string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repo){throw 'Run from current Unity checkout'}
$project=Join-Path $repo 'native/CampMind.Unity'
$active=Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" | Where-Object {$_.CommandLine -match '-projectPath' -and $_.CommandLine -notmatch 'AssetImportWorker'}
if($active){throw 'Preserve the open Editor; use CampMind/New World install menu there'}
$run=Join-Path $repo ('native/Artifacts/new-world-game-build-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Editor;$start.WorkingDirectory=$repo;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$method=if($ApplyManual){'CampMind.Editor.NewWorldGameInstaller.InstallSavedManualAndBuild'}else{'CampMind.Editor.NewWorldGameInstaller.BuildGame'}
foreach($arg in @('-batchmode','-quit','-projectPath',$project,'-executeMethod',$method,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
$code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 1800 -GuardBuildReportPort
@{run=$run;exitCode=$code}|ConvertTo-Json
if($code -ne 0){throw "New world build failed, inspect $run"}
