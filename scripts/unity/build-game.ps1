#Requires -Version 7.2
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repository
Write-Host '正在生成 Windows 游戏（IL2CPP）。请先关闭 Unity 编辑器和游戏窗口。'
Write-Host '输出固定为 native\Builds\Camp-IL2CPP；成功后替换上一版，失败保留上一版。'
try{
    & (Join-Path $PSScriptRoot 'build.ps1') -Editor $Editor -Scene Camp -Backend IL2CPP -GuardBuildReportPort
    Write-Host "生成完成：$repository\native\Builds\Camp-IL2CPP\CampMind.exe" -ForegroundColor Green
    Write-Host '双击项目根目录的“运行游戏.cmd”即可游玩。'
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
