#Requires -Version 7.2
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$local=Join-Path $repository 'native/LocalData/pixel-world-v1'
New-Item -ItemType Directory -Force $local | Out-Null
# 已打开的Unity不会重新执行启动方法；由编辑器侧消费请求并尊重未保存场景。
[IO.File]::WriteAllText((Join-Path $local 'open-editor.request'),[DateTime]::UtcNow.ToString('O'))
& (Join-Path $PSScriptRoot 'open-editor.ps1') -Editor $Editor
