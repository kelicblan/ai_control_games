#Requires -Version 7.2
param([ValidateSet('IL2CPP','Mono')][string]$Backend='IL2CPP',[switch]$Probe,[switch]$AiProbe)
$ErrorActionPreference='Stop'
if($Probe -and $AiProbe){throw 'Choose Probe or AiProbe, not both'}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$villageJson=& node (Join-Path $PSScriptRoot 'village-launch.mjs')
if($LASTEXITCODE -ne 0){throw 'Verified village launch manifest is invalid'}
$village=$villageJson|ConvertFrom-Json
if($village -and -not $Probe -and -not $AiProbe){
    $villageArguments=@((Join-Path $PSScriptRoot 'start-native-slice.mjs'),'--exe',$village.executable,'--layout',$village.layout,'--village-default')
    if($village.externalBuild){$villageArguments+='--external-build'}
    & node @villageArguments
    if($LASTEXITCODE -ne 0){throw 'Village game exited with failure; inspect its native/Artifacts/slice-* report'}
    exit 0
}
$newWorld=Join-Path $repository "native/Builds/NewWorld-IL2CPP/CampMind.exe"
$newMarker=Join-Path $repository "native/Builds/NewWorld-IL2CPP/world-layout.json"
$currentManifest=Join-Path $repository 'native/Builds/new-world-current.json'
if(Test-Path -LiteralPath $currentManifest){
    $current=Get-Content -LiteralPath $currentManifest -Raw|ConvertFrom-Json
    $candidate=[IO.Path]::GetFullPath($current.executable)
    $buildRoot=[IO.Path]::GetFullPath((Join-Path $repository 'native/Builds'))+[IO.Path]::DirectorySeparatorChar
    if($current.layout -ne 'new-world-v1' -or -not $candidate.StartsWith($buildRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($candidate) -ne 'CampMind.exe'){throw 'Invalid current new-world build manifest'}
    $candidateMarker=Join-Path ([IO.Path]::GetDirectoryName($candidate)) 'world-layout.json'
    if(-not(Test-Path -LiteralPath $candidate) -or -not(Test-Path -LiteralPath $candidateMarker)){throw 'Current new-world package is incomplete'}
    $newWorld=$candidate;$newMarker=$candidateMarker
}
$fixed=if((Test-Path -LiteralPath $newWorld) -and (Test-Path -LiteralPath $newMarker)){$newWorld}else{Join-Path $repository "native/Builds/Camp-$Backend/CampMind.exe"}
$build=if(Test-Path -LiteralPath $fixed){[pscustomobject]@{executable=$fixed}}else{Get-ChildItem (Join-Path $repository 'native/Artifacts/builds') -Filter build.json -Recurse |
    Sort-Object LastWriteTime -Descending | ForEach-Object {Get-Content $_.FullName -Raw | ConvertFrom-Json} |
    Where-Object {$_.kind -eq 'native-presentation-preview' -and $_.backend -eq $Backend -and (Test-Path -LiteralPath $_.executable)} | Select-Object -First 1}
if(-not $build){throw "No valid Camp $Backend build found. Run scripts/unity/build.ps1 -Scene Camp -Backend $Backend first."}
$arguments=@((Join-Path $PSScriptRoot 'start-native-slice.mjs'),'--exe',$build.executable)
if($Probe){$arguments+='--probe'}
if($AiProbe){$arguments+='--ai-probe'}
if($Probe -or $AiProbe){$arguments+='--fresh'}
& node @arguments
if($LASTEXITCODE -ne 0){throw 'Native slice exited with failure; inspect its unique native/Artifacts/slice-* report'}
