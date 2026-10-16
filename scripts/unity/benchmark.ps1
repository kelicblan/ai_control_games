#Requires -Version 7.2
param([Parameter(Mandatory)][string]$Executable,[ValidateSet('god-clear','god-storm','lord-clear','lord-storm')][string]$Scenario='god-clear',[ValidateRange(0,600)][int]$WarmupSeconds=90,[ValidateRange(1,7200)][int]$DurationSeconds=300,[ValidateSet('none','shadows','rain','forest')][string]$Isolation='none')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'));$executable=[IO.Path]::GetFullPath($Executable)
if(-not $executable.StartsWith((Join-Path $repository 'native/Builds')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or-not(Test-Path -LiteralPath $executable)){throw 'Use an existing native/Builds Player'}
$run=Join-Path $repository ('native/Artifacts/frames-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Force $run|Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$executable;$start.WorkingDirectory=[IO.Path]::GetDirectoryName($executable);$start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-windowed','-screen-width','1920','-screen-height','1080','-campmind-frame-probe',$run,$Scenario,"$WarmupSeconds","$DurationSeconds",'-logFile',(Join-Path $run 'player.log'))){$start.ArgumentList.Add($arg)}
if($Isolation -ne 'none'){$start.ArgumentList.Add('-campmind-render-isolation');$start.ArgumentList.Add($Isolation)}
$exitCode=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds ($WarmupSeconds+$DurationSeconds+60)
if($exitCode -ne 0){throw "Frame diagnostic Player failed: $run"}
$report=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw|ConvertFrom-Json
if(-not $report.success -or $report.kind -ne $(if($Isolation -eq 'none'){'typescript-full-state-render-replay'}else{'native-render-cost-diagnostic'}) -or $report.isolation -ne $Isolation -or $report.resources -ne 84 -or $report.animals -ne 43 -or $report.width -ne 1920 -or $report.height -ne 1080 -or $report.measuredSeconds -lt $DurationSeconds -or -not(Test-Path -LiteralPath (Join-Path $run 'frames.csv'))){throw "Invalid frame evidence: $run"}
@{run=$run;report=$report;acceptance=if($Isolation -eq 'none'){'Recorded full-source render replay; excludes live rules/bridge/AI and alone does not pass G2'}else{'Render cost isolation with an excluded visual pass; NEVER valid fidelity/FPS acceptance'}}|ConvertTo-Json -Depth 5
