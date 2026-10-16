#Requires -Version 7.2
param([Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$executable=[IO.Path]::GetFullPath($Executable)
if(-not $executable.StartsWith((Join-Path $repository 'native/Builds')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or-not(Test-Path -LiteralPath $executable)){throw 'Use an existing native/Builds Player'}
$run=Join-Path $repository ('native/Artifacts/scene-probe-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Force $run|Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$executable;$start.WorkingDirectory=[IO.Path]::GetDirectoryName($executable);$start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-windowed','-screen-width','1280','-screen-height','720','-campmind-scene-probe',$run,'-logFile',(Join-Path $run 'player.log'))){$start.ArgumentList.Add($arg)}
$exitCode=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 90
if($exitCode -ne 0){throw "Scene Player failed: $run"}
$report=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw|ConvertFrom-Json
if($report.characters -ne 10 -or $report.animatedBones -lt 3 -or $report.moved -lt 1 -or -not $report.interiorVisible -or -not $report.exteriorRestored){throw "Scene acceptance failed: $run"}
foreach($name in @('camp-overview.png','lord-view.png','storm.png','night.png','interior.png')){if(-not(Test-Path -LiteralPath (Join-Path $run $name))){throw "Missing scene screenshot $name"}}
@{run=$run;report=$report}|ConvertTo-Json -Depth 5
