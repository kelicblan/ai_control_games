#Requires -Version 7.2
param([ValidateSet('Build','BuildTerrain','Capture')][string]$Action='Build',[string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$project=Join-Path $repository 'native/CampMind.Unity'
$run=Join-Path $repository ('native/Artifacts/reference-region-'+$Action.ToLower()+'-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
if($Action -eq 'Build' -or $Action -eq 'BuildTerrain'){
    $active=Get-CimInstance Win32_Process -Filter "name='Unity.exe'" | Where-Object {$_.CommandLine -like "*$project*" -or $_.CommandLine -like "*$($project.Replace('\','/'))*"}
    if($active){throw 'This Unity project is in use; no process was stopped'}
    $start.FileName=$Editor
    $method=if($Action -eq 'BuildTerrain'){'CampMind.Editor.ReferenceRegionCalibrationBuilder.BuildTerrainPlayer'}else{'CampMind.Editor.ReferenceRegionCalibrationBuilder.BuildPlayer'}
    foreach($arg in @('-batchmode','-quit','-projectPath',$project,'-executeMethod',$method,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
    $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 900 -GuardBuildReportPort
}else{
    $start.FileName=Join-Path $repository 'native/Builds/ReferenceRegionCalibration/ReferenceRegionCalibration.exe'
    if(-not(Test-Path -LiteralPath $start.FileName)){throw 'Build calibration player first'}
    foreach($arg in @('-windowed','-screen-width','2048','-screen-height','1303','-logFile',(Join-Path $run 'player.log'),'-reference-region-capture',$run)){$start.ArgumentList.Add($arg)}
    $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 90
    if(-not(Test-Path -LiteralPath (Join-Path $run 'candidate-fit.png'))){throw "No rendered capture; inspect $run"}
}
if($code -ne 0){throw "Calibration $Action failed, exit $code; inspect $run"}
@{action=$Action;run=$run;visualAccepted=$false}|ConvertTo-Json
