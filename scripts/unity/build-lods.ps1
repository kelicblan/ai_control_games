#Requires -Version 7.2
param([string]$Editor,[switch]$GuardBuildReportPort)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$environment=Get-CampMindUnityEnvironment -Editor $Editor
if(-not $environment.readyForUnityValidation){throw $environment.nextAction}
$run=Join-Path $repository ('native/Artifacts/lods/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $run | Out-Null
$inputFile=Join-Path $run 'input.json'
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$environment.editorPath;$start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($argument in @('-batchmode','-quit','-projectPath',(Join-Path $repository 'native/CampMind.Unity'),'-executeMethod','CampMind.Editor.NativeMeshLod.Export','-campmind-lod-input',$inputFile,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($argument)}
$exitCode=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 300 -GuardBuildReportPort:$GuardBuildReportPort
if($exitCode -ne 0 -or -not(Test-Path -LiteralPath $inputFile)){throw "LOD geometry export failed: $run"}
Push-Location $repository
try{& node scripts/unity/simplify-lods.mjs $inputFile (Join-Path $repository 'native/CampMind.Unity/Assets/CampMind/Content/Lod/indices.json');if($LASTEXITCODE -ne 0){throw 'LOD simplification failed'}}finally{Pop-Location}
