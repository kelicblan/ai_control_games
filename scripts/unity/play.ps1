#Requires -Version 7.2
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repository
# 用户已指定二维客户端为默认版本；不再读取任何旧3D构建指针或诊断包。
& node (Join-Path $PSScriptRoot '../pixel-world/launch.mjs')
if($LASTEXITCODE -ne 0){throw '二维游戏启动失败。请查看上方原因；源码更新后需要重新生成游戏EXE。'}
