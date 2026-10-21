#Requires -Version 7.2
param([ValidateSet('Audit','Repair','ValidateInstalled','FinalizeAndBuild','PolishAndBuild','ClearPorch','FinishPorch','CorrectionInspect','CorrectionRepair','CorrectionRebuild','CorrectionBuild','CorrectionAudit','CorrectionSeam','CorrectionGateTerrain','CorrectionOriginalOpening','CorrectionFinishOpening','CorrectionApronBuild','CorrectionPolishBuild','CorrectionGroundBuild','CorrectionLandingBuild','CorrectionOpenHeadBuild','CorrectionExtendContactBuild','CorrectionBridgeVisualBuild','CorrectionRiverUvBuild','RepairAndBuild')][string]$Action='Audit')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repo){throw 'Run from current Unity checkout'}
$active=Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" | Where-Object {$_.CommandLine -match '-projectPath' -and $_.CommandLine -notmatch 'AssetImportWorker'}
if($active){throw 'Preserve open Unity Editor; do not run a second Editor'}
$run=Join-Path $repo ('native/Artifacts/stair-'+$Action+'-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe';$start.WorkingDirectory=$repo;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-batchmode','-quit','-projectPath',(Join-Path $repo 'native/CampMind.Unity'),'-executeMethod',('CampMind.Editor.NewWorldStairRepair.'+$Action),'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
$code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 1800 -GuardBuildReportPort
@{run=$run;exitCode=$code}|ConvertTo-Json
if($code -ne 0){throw "Stair operation failed: $run"}
