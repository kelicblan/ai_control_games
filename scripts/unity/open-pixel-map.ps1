#Requires -Version 7.2
# 复用现有Unity启动器和BuildReport端口保护，不改系统网络或正式启动指针。
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$local=Join-Path $root 'native/LocalData/pixel-map-preview'
New-Item -ItemType Directory -Force $local | Out-Null
[DateTime]::UtcNow.ToString('o') | Set-Content -LiteralPath (Join-Path $local 'open-editor.request') -Encoding utf8
& (Join-Path $PSScriptRoot 'open-editor.ps1') -Editor $Editor
