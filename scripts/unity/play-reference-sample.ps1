#Requires -Version 7.2
param([switch]$Probe)
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$exe=Join-Path $repository 'native/Builds/ReferenceSample/CampMindSample.exe'
if(-not(Test-Path -LiteralPath $exe)){throw 'Build the reference sample first: scripts/unity/build-reference-sample.ps1'}
$run=Join-Path $repository ('native/Artifacts/reference-sample-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $run|Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$exe;$start.WorkingDirectory=[IO.Path]::GetDirectoryName($exe);$start.UseShellExecute=$false
foreach($arg in @('-windowed','-screen-width','1672','-screen-height','941','-logFile',(Join-Path $run 'player.log'))){$start.ArgumentList.Add($arg)}
if($Probe){
    . (Join-Path $PSScriptRoot 'process.ps1')
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.ArgumentList.Add('-reference-sample-probe');$start.ArgumentList.Add($run)
    $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 180
    if(-not(Test-Path -LiteralPath (Join-Path $run 'result.json'))){throw "No rendered probe report: $run (exit $code)"}
    $report=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw|ConvertFrom-Json
    if($code -ne 0 -or -not $report.passed){throw "Sample traversal probe failed. Inspect $run"}
    foreach($name in @('overview','manor','dwelling','gate','watchtower','riverbank','walk')){if(-not(Test-Path -LiteralPath (Join-Path $run "$name.png"))){throw "Missing screenshot $name"}}
    @{run=$run;result=$report}|ConvertTo-Json -Depth 8
}else{$process=[Diagnostics.Process]::Start($start);@{processId=$process.Id;run=$run}|ConvertTo-Json}
