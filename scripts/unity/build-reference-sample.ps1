#Requires -Version 7.2
param([string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$project=Join-Path $repository 'native/CampMind.Unity'
$active=Get-CimInstance Win32_Process -Filter "name='Unity.exe'" | Where-Object {$_.CommandLine -like "*$project*" -or $_.CommandLine -like "*$($project.Replace('\','/'))*"}
if($active){throw 'This Unity project is already open or building. Wait for it to release the project; no process was stopped.'}
$run=Join-Path $repository ('native/Artifacts/reference-sample-build-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $run|Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Editor;$start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('-batchmode','-quit','-projectPath',$project,'-executeMethod','CampMind.Editor.ReferenceSampleBuilder.BuildPlayer','-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
$code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 900 -GuardBuildReportPort
if($code -ne 0){throw "Sample build failed, exit $code. Inspect $run"}
$exe=Join-Path $repository 'native/Builds/ReferenceSample/CampMindSample.exe'
if(-not(Test-Path -LiteralPath $exe)){throw 'Sample executable was not produced'}
@{executable=$exe;logDirectory=$run}|ConvertTo-Json
