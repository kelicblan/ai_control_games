#Requires -Version 7.2
$ErrorActionPreference='Stop'
$uiRepository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $uiRepository
$uiRecord=Join-Path $uiRepository 'native/Artifacts/ui-unified/verification.json'
if(-not(Test-Path -LiteralPath $uiRecord)){throw 'UI verification receipt is missing'}
$uiProof=Get-Content -LiteralPath $uiRecord -Raw|ConvertFrom-Json
if(-not $uiProof.uiVerified -or -not(Test-Path -LiteralPath $uiProof.executable)){throw 'Verified UI build is unavailable'}
if((Get-FileHash -LiteralPath $uiProof.executable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $uiProof.executableHash){throw 'UI build changed after verification'}
$uiAssembly=Join-Path ([IO.Path]::GetDirectoryName($uiProof.executable)) 'GameAssembly.dll'
if((Get-FileHash -LiteralPath $uiAssembly -Algorithm SHA256).Hash.ToLowerInvariant() -ne $uiProof.gameAssemblyHash){throw 'UI assembly changed after verification'}
Write-Host '界面验收版：使用独立预览存档。完整模型校验状态请见验收记录。'
& node (Join-Path $PSScriptRoot 'start-native-slice.mjs') --exe $uiProof.executable --external-build --layout new-world-v1 --village-default --data-dir (Join-Path $uiRepository 'native/LocalData/ui-unified-preview')
exit $LASTEXITCODE
