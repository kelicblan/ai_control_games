#Requires -Version 7.2
param([string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe',[switch]$LocalOutput,[switch]$ReuseUnverified,[switch]$ReuseUiPreview)
$ErrorActionPreference='Stop'
$villageRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $villageRepo){throw 'Run from the current Unity checkout'}
. (Join-Path $PSScriptRoot 'process.ps1')
$villageProject=Join-Path $villageRepo 'native/CampMind.Unity'
if(Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" | Where-Object {$_.CommandLine -match '-projectPath' -and $_.CommandLine -notmatch 'AssetImportWorker'}){throw 'A Unity project process is active; preserve it and wait for completion'}
$villageRun=Join-Path $villageRepo ('native/Artifacts/village/P6/build-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $villageRun | Out-Null
$villageStart=[Diagnostics.ProcessStartInfo]::new()
$villageStart.FileName=$Editor;$villageStart.WorkingDirectory=$villageRepo;$villageStart.UseShellExecute=$false;$villageStart.CreateNoWindow=$true;$villageStart.RedirectStandardOutput=$true;$villageStart.RedirectStandardError=$true
if($LocalOutput){$villageStart.Environment['CAMP_VILLAGE_LOCAL_BUILD']='1'}
if($ReuseUiPreview){
    if(-not $LocalOutput -or $ReuseUnverified){throw 'UI preview reuse requires LocalOutput and cannot combine with ReuseUnverified'}
    $uiReceipt=Get-Content (Join-Path $villageRepo 'native/Artifacts/ui-unified/verification.json') -Raw|ConvertFrom-Json
    $uiFolder=[IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($uiReceipt.executable))
    $uiAllowedRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CampMindBuilds'))+[IO.Path]::DirectorySeparatorChar
    if(-not $uiReceipt.uiVerified -or -not $uiFolder.StartsWith($uiAllowedRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'The existing local UI receipt is required'}
    if((Get-FileHash -LiteralPath (Join-Path $uiFolder 'GameAssembly.dll') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $uiReceipt.gameAssemblyHash){throw 'UI preview changed since its receipt was recorded'}
    $villageStart.Environment['CAMP_VILLAGE_REUSE_UNVERIFIED']=$uiFolder
    $villageStart.Environment['CAMP_VILLAGE_UI_PREVIEW_REUSE']='1'
}
if($ReuseUnverified){
    if(-not $LocalOutput){throw 'ReuseUnverified requires LocalOutput'}
    $pendingBuild=Get-Content (Join-Path $villageRepo 'native/Artifacts/village/P6/build.json') -Raw|ConvertFrom-Json
    $reusePath=[IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($pendingBuild.executable))
    $localBuildRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CampMindBuilds'))+[IO.Path]::DirectorySeparatorChar
    if(-not $pendingBuild.modelsPending -or -not $reusePath.StartsWith($localBuildRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Only the latest local unverified build can be reused'}
    $villageStart.Environment['CAMP_VILLAGE_REUSE_UNVERIFIED']=$reusePath
}
foreach($villageArg in @('-batchmode','-quit','-projectPath',$villageProject,'-executeMethod','CampMind.Editor.VillageBuildEntry.Build','-logFile',(Join-Path $villageRun 'editor.log'))){$villageStart.ArgumentList.Add($villageArg)}
$villageCode=Invoke-CampMindTestProcess -StartInfo $villageStart -RunDirectory $villageRun -TimeoutSeconds 1800 -GuardBuildReportPort
if($villageCode -ne 0){throw "Village build failed ($villageCode); inspect $villageRun"}
Get-Content (Join-Path $villageRepo 'native/Artifacts/village/P6/build.json')
