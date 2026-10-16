#Requires -Version 7.2
param([string]$Editor,[switch]$GuardBuildReportPort,[int]$TimeoutSeconds=180)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$environment=Get-CampMindUnityEnvironment -Editor $Editor
if(-not $environment.readyForUnityValidation){throw $environment.nextAction}
$run=Join-Path $repository ('native/Artifacts/editor-play-smoke/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$environment.editorPath
$start.WorkingDirectory=$repository
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
foreach($argument in @('-batchmode','-projectPath',(Join-Path $repository 'native/CampMind.Unity'),'-executeMethod','CampMind.Editor.EditorPlaySmoke.Run','-campmind-editor-world-smoke',$run,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($argument)}
$exit=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds $TimeoutSeconds -GuardBuildReportPort:$GuardBuildReportPort
if($exit -ne 0){throw "Editor Play smoke failed ($exit): $run"}
$result=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw | ConvertFrom-Json
if(-not $result.success -or -not $result.serverStopped -or $result.npcCount -ne 9){throw "Editor Play smoke did not pass: $run"}
Write-Output "Actual Editor Play host lifecycle passed: $run"
