#Requires -Version 7.2
param([string]$Name='before')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repo){throw 'Run from current Unity checkout'}
$run=Join-Path $repo ('native/Artifacts/actor-audit-'+$Name)
New-Item -ItemType Directory -Force -Path $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe';$start.WorkingDirectory=$repo;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-batchmode','-quit','-projectPath',(Join-Path $repo 'native/CampMind.Unity'),'-executeMethod','CampMind.Editor.ActorPresentationAudit.Audit','-actor-audit-output',$run,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
$code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 300 -GuardBuildReportPort
if($code -ne 0){throw "Actor audit failed: $run"}
Write-Output $run
