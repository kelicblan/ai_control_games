#Requires -Version 7.2
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repository
if(Test-Path -LiteralPath (Join-Path $repository 'native/Builds/village-current.json')){
    & (Join-Path $PSScriptRoot 'build-village.ps1') -Editor $Editor -LocalOutput
    $villageBuild=Get-Content (Join-Path $repository 'native/Artifacts/village/P6/build.json') -Raw|ConvertFrom-Json
    if(-not $villageBuild.success){throw 'Village build failed'}
    $villageProbeOutput=& node (Join-Path $PSScriptRoot 'start-native-slice.mjs') --exe $villageBuild.executable --external-build --layout new-world-v1 --village-default --village-probe --with-startup --fresh --timeout 360
    $villageProbeOutput|ForEach-Object{Write-Host $_}
    if($LASTEXITCODE -ne 0){throw 'Default village native verification failed; previous verified build retained'}
    $villageProbe=$villageProbeOutput|ForEach-Object{try{$_|ConvertFrom-Json}catch{}}|Where-Object {$_.kind -eq 'TS-authoritative-native-slice'}|Select-Object -First 1
    if(-not $villageProbe.run){throw 'Native village probe receipt missing'}
    & node --import tsx (Join-Path $PSScriptRoot '../village/verify-native-resume.ts') $villageProbe.run
    if($LASTEXITCODE -ne 0){throw 'Village save restart verification failed; previous verified build retained'}
    $upgradeData=Join-Path $repository ('native/LocalData/automatic-upgrade-build-'+[Guid]::NewGuid().ToString('N'))
    & node --import tsx (Join-Path $PSScriptRoot '../village/prepare-upgrade-probe.ts') $upgradeData
    if($LASTEXITCODE -ne 0){throw 'Automatic upgrade fixture preparation failed'}
    $upgradeProbePrevious=$env:CAMP_VILLAGE_UPGRADE_PROBE
    try{
        $env:CAMP_VILLAGE_UPGRADE_PROBE='1'
        $upgradeOutput=& node (Join-Path $PSScriptRoot 'start-native-slice.mjs') --exe $villageBuild.executable --external-build --layout new-world-v1 --village-default --village-probe --with-startup --data-dir $upgradeData --timeout 240
        $upgradeOutput|ForEach-Object{Write-Host $_}
        if($LASTEXITCODE -ne 0){throw 'Automatic upgrade native verification failed'}
    }finally{$env:CAMP_VILLAGE_UPGRADE_PROBE=$upgradeProbePrevious}
    $upgradeProbe=$upgradeOutput|ForEach-Object{try{$_|ConvertFrom-Json}catch{}}|Where-Object {$_.kind -eq 'TS-authoritative-native-slice'}|Select-Object -First 1
    & node --import tsx (Join-Path $PSScriptRoot '../village/verify-automatic-upgrade.ts') $upgradeProbe.run
    if($LASTEXITCODE -ne 0){throw 'Automatic source archive verification failed'}
    & node --import tsx (Join-Path $PSScriptRoot '../village/verify-native-resume.ts') $upgradeProbe.run
    if($LASTEXITCODE -ne 0){throw 'Upgraded world restart verification failed'}
    & node --import tsx (Join-Path $PSScriptRoot '../village/promote.ts') $villageProbe.run $upgradeProbe.run
    if($LASTEXITCODE -ne 0){throw 'Village promotion failed; previous verified build retained'}
    Write-Host '新玩法构建和默认入口验证完成，双击“运行游戏.cmd”即可游玩。' -ForegroundColor Green
    exit 0
}
if(Test-Path -LiteralPath (Join-Path $repository 'native/CampMind.Unity/Assets/CampMind/NewWorldGame/Camp.unity')){
    & (Join-Path $PSScriptRoot 'build-new-world.ps1') -Editor $Editor
    Write-Host "新地图游戏已生成：$repository\native\Builds\NewWorld-IL2CPP\CampMind.exe" -ForegroundColor Green
    exit 0
}
Write-Host '正在生成 Windows 游戏（IL2CPP）。请先关闭 Unity 编辑器和游戏窗口。'
Write-Host '输出固定为 native\Builds\Camp-IL2CPP；成功后替换上一版，失败保留上一版。'
try{
    & (Join-Path $PSScriptRoot 'build.ps1') -Editor $Editor -Scene Camp -Backend IL2CPP -GuardBuildReportPort
    Write-Host "生成完成：$repository\native\Builds\Camp-IL2CPP\CampMind.exe" -ForegroundColor Green
    Write-Host '双击项目根目录的“运行游戏.cmd”即可游玩。'
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
