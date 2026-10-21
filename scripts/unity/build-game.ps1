#Requires -Version 7.2
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repository
. (Join-Path $PSScriptRoot 'environment.ps1')
$environment=Get-CampMindUnityEnvironment -Editor $Editor
if(-not $environment.readyForUnityValidation){throw $environment.nextAction}
$project=Join-Path $repository 'native/CampMind.Unity'
foreach($candidate in (Get-CimInstance Win32_Process -Filter "Name='Unity.exe'")){
    if(Test-CampMindInteractiveEditor -Process $candidate -EditorPath $environment.editorPath -ProjectPath $project -Receipt ''){throw '请先保存并关闭本工程Unity编辑器，再生成游戏EXE。'}
}
$id=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$output=Join-Path $repository ('native/Builds/PixelGame-'+$id+'/CampMind.exe')
$run=Join-Path $repository ('native/Artifacts/pixel-build-'+$id)
New-Item -ItemType Directory -Force $run | Out-Null
$report=Join-Path $run 'build.json'
$manifestScript=Join-Path $PSScriptRoot '../pixel-world/build-manifest.mjs'
$sourceHash=& node $manifestScript fingerprint
if($LASTEXITCODE -ne 0 -or $sourceHash -notmatch '^[a-f0-9]{64}$'){throw '无法读取二维源码指纹'}
$listeners=[Collections.Generic.List[Net.Sockets.TcpListener]]::new()
$owned=$null
try{
    # 和现有交互启动器一致，只保护本机可选BuildReport端口，不修改系统网络。
    foreach($address in @([Net.IPAddress]::Loopback,[Net.IPAddress]::IPv6Loopback)){
        $listener=[Net.Sockets.TcpListener]::new($address,38000);$listener.Server.ExclusiveAddressUse=$true
        $listeners.Add($listener);$listener.Start()
    }
    $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$environment.editorPath
    $start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    foreach($argument in @('-batchmode','-quit','-projectPath',$project,'-buildTarget','Win64','-executeMethod','CampMind.PixelWorld.Editor.PixelGameBuild.Build','-pixel-build-output',$output,'-pixel-build-report',$report,'-pixel-source-hash',$sourceHash,'-logFile',(Join-Path $run 'unity.log'))){$start.ArgumentList.Add($argument)}
    Write-Host '正在生成默认二维像素游戏（Windows IL2CPP），不会覆盖旧构建或旧存档。'
    $owned=[Diagnostics.Process]::Start($start)
    if(-not $owned.WaitForExit(3600000)){$owned.Kill($true);throw "Unity构建超时，日志：$run"}
    if($owned.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $report)){throw "Unity构建失败，原构建指针未改。日志：$run"}
    & node $manifestScript publish $report
    if($LASTEXITCODE -ne 0){throw '构建产物或源码一致性校验失败，原构建指针未改。'}
    Write-Host '二维游戏EXE已生成。双击“运行游戏.cmd”启动当前地图版本。' -ForegroundColor Green
    Write-Host '本次是编译与产物校验，不是画面、性能或完整NPC玩法验收。'
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
finally{foreach($listener in $listeners){$listener.Stop()};if($null -ne $owned){$owned.Dispose()}}
