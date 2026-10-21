#Requires -Version 7.2
param(
    [string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe',
    [string]$PublishSpecies='Wolf'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repository){throw 'Run from the current Unity checkout'}
if($PublishSpecies -notin @('Tiger','Bear','Boar','Pheasant','Rabbit','Deer','Wolf')){throw 'Unknown species'}
$runId=[guid]::NewGuid().ToString('N')
$run=Join-Path $repository ('native/Artifacts/animals/isolated/'+$runId)
# Unity's Mono importers still fail on some long package-cache paths on Windows.
$project=Join-Path $repository ('native/.wv-'+$runId.Substring(0,8))
$reports=Join-Path $run 'Results'
$source=Join-Path $repository 'native/CampMind.Unity'
foreach($folder in @('Assets/CampMind/Content','Assets/Editor','Packages','ProjectSettings')){
    New-Item -ItemType Directory -Force (Join-Path $project $folder) | Out-Null
}
New-Item -ItemType Directory -Force $reports | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'Assets/CampMind/Content/Animals') -Destination (Join-Path $project 'Assets/CampMind/Content/Animals') -Recurse
Copy-Item -LiteralPath (Join-Path $source 'Assets/CampMind/Editor/WildlifeAssetAudit.cs') -Destination (Join-Path $project 'Assets/Editor/WildlifeAssetAudit.cs')
Copy-Item -LiteralPath (Join-Path $source 'ProjectSettings/ProjectVersion.txt') -Destination (Join-Path $project 'ProjectSettings/ProjectVersion.txt')
$manifest=Get-Content -LiteralPath (Join-Path $source 'Packages/manifest.json') -Raw | ConvertFrom-Json
$manifest.dependencies.PSObject.Properties.Remove('com.campmind.foundation')
if($manifest.PSObject.Properties.Name -contains 'testables'){$manifest.PSObject.Properties.Remove('testables')}
[IO.File]::WriteAllText((Join-Path $project 'Packages/manifest.json'),($manifest|ConvertTo-Json -Depth 8))
. (Join-Path $PSScriptRoot 'process.ps1')
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Editor;$start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-batchmode','-quit','-projectPath',$project,'-executeMethod','CampMind.Editor.WildlifeAssetAudit.ValidateAll','-wildlife-audit-root',$reports,'-logFile',(Join-Path $reports 'editor.log'))){$start.ArgumentList.Add($arg)}
# An open project may already reserve the optional REST port; do not disturb it.
$occupied=@(Get-NetTCPConnection -LocalPort 38000 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
$code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $reports -TimeoutSeconds 900 -GuardBuildReportPort:(!$occupied)
if($code -ne 0){throw "Wildlife validation failed with exit $code; see $reports"}
$audit=Get-Content -LiteralPath (Join-Path $reports 'wildlife-import-audit.json') -Raw | ConvertFrom-Json
$playback=Get-Content -LiteralPath (Join-Path $reports 'animator-playback-audit.json') -Raw | ConvertFrom-Json
if(!$audit.passed -or !$playback.passed -or $audit.animals.Count -ne 7 -or $playback.animals.Count -ne 7){throw "Incomplete wildlife audit; see $reports"}
$verified=Join-Path $project ('Assets/CampMind/Content/Animals/'+$PublishSpecies)
$destination=Join-Path $source ('Assets/CampMind/Content/Animals/'+$PublishSpecies)
foreach($file in Get-ChildItem -LiteralPath $verified -File){Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destination $file.Name) -Force}
[pscustomobject]@{passed=$true;reports=$reports;animals=$audit.animals.Count;playedStates=($playback.animals|ForEach-Object{$_.states.Count}|Measure-Object -Sum).Sum;publishedSpecies=$PublishSpecies}|ConvertTo-Json
