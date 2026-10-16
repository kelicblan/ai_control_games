#Requires -Version 7.2
param([ValidateSet('IL2CPP','Mono')][string]$Backend='IL2CPP',[switch]$Probe,[switch]$AiProbe)
$ErrorActionPreference='Stop'
if($Probe -and $AiProbe){throw 'Choose Probe or AiProbe, not both'}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$build=Get-ChildItem (Join-Path $repository 'native/Artifacts/builds') -Filter build.json -Recurse |
    Sort-Object LastWriteTime -Descending | ForEach-Object {Get-Content $_.FullName -Raw | ConvertFrom-Json} |
    Where-Object {$_.kind -eq 'native-presentation-preview' -and $_.backend -eq $Backend -and (Test-Path -LiteralPath $_.executable)} | Select-Object -First 1
if(-not $build){throw "No valid Camp $Backend build found. Run scripts/unity/build.ps1 -Scene Camp -Backend $Backend first."}
$arguments=@((Join-Path $PSScriptRoot 'start-native-slice.mjs'),'--exe',$build.executable)
if($Probe){$arguments+='--probe'}
if($AiProbe){$arguments+='--ai-probe'}
& node @arguments
if($LASTEXITCODE -ne 0){throw 'Native slice exited with failure; inspect its unique native/Artifacts/slice-* report'}
