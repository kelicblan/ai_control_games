#Requires -Version 7.2
param([string]$Editor='D:\Program Files\unity\Unity 6000.3.26f1\Editor\Unity.exe')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$project=Join-Path $repository 'native/CampMind.Unity'
$run=Join-Path $repository ('native/Artifacts/editor/'+[guid]::NewGuid().ToString('N'))
$listeners=[Collections.Generic.List[Net.Sockets.TcpListener]]::new()
$owned=$null
function Find-ProjectEditor([string]$Receipt='') {
    foreach($candidate in (Get-CimInstance Win32_Process -Filter "Name='Unity.exe'")){
        if(-not(Test-CampMindInteractiveEditor -Process $candidate -EditorPath $environment.editorPath -ProjectPath $project -Receipt $Receipt)){continue}
        return [Diagnostics.Process]::GetProcessById($candidate.ProcessId)
    }
    return $null
}
try {
    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    New-Item -ItemType Directory -Force $run | Out-Null
    . (Join-Path $PSScriptRoot 'environment.ps1')
    $environment=Get-CampMindUnityEnvironment -Editor $Editor
    if(-not $environment.readyForUnityValidation){throw $environment.nextAction}
    foreach($required in @('Assets','Packages/manifest.json','ProjectSettings/ProjectVersion.txt')){
        if(-not(Test-Path -LiteralPath (Join-Path $project $required))){throw "Incomplete Unity project: $project"}
    }
    $alreadyOpen=Find-ProjectEditor
    if($null -ne $alreadyOpen){
        @{pid=$alreadyOpen.Id;project=$project;attachedExisting=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $run 'process.json') -Encoding utf8
        $alreadyOpen.Dispose();Write-Output 'This Unity project is already open.';return
    }
    # Reserve the optional BuildReport REST port only while this Editor lives.
    # Both loopback families must be guarded; VPN/TUN and global routes stay intact.
    foreach($address in @([Net.IPAddress]::Loopback,[Net.IPAddress]::IPv6Loopback)){
        $listener=[Net.Sockets.TcpListener]::new($address,38000)
        $listener.Server.ExclusiveAddressUse=$true
        $listeners.Add($listener);$listener.Start()
    }
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$environment.editorPath;$start.WorkingDirectory=$repository
    $start.UseShellExecute=$true
    foreach($argument in @('-projectPath',$project,'-logFile',(Join-Path $run 'editor.log'),'-executeMethod','CampMind.Editor.EditorLaunch.OpenCamp','-campmind-editor-ready',(Join-Path $run 'ready.json'))){$start.ArgumentList.Add($argument)}
    $owned=[Diagnostics.Process]::Start($start)
    @{pid=$owned.Id;project=$project;editor=$environment.editorPath;buildReportGuard=$true;attachedExisting=$false;launcherElevated=$admin}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $run 'process.json') -Encoding utf8
    Write-Output "Unity Editor opening. Logs: $run"
    # Interactive lifetime: no automation timeout and no forced Editor shutdown.
    while($true){
        while(-not $owned.WaitForExit(1000)){}
        $code=$owned.ExitCode;$replacement=$null
        # A restart from Unity's privilege dialog/Hub can drop custom arguments.
        # Keep the loopback guard during that transition and follow only this
        # exact executable/project, excluding asset import workers.
        for($attempt=0;$attempt -lt 60;$attempt++){
            $replacement=Find-ProjectEditor
            if($null -ne $replacement){break}
            Start-Sleep -Milliseconds 500
        }
        if($null -ne $replacement){
            $owned.Dispose();$owned=$replacement
            @{pid=$owned.Id;project=$project;editor=$environment.editorPath;buildReportGuard=$true;handoff=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $run 'process.json') -Encoding utf8
            continue
        }
        if($null -ne $code -and $code -ne 0){throw "Unity Editor exited $code. Logs: $run"};break
    }
} catch {
    # A failed Editor must release its guard before showing a modal error.
    foreach($listener in $listeners){$listener.Stop()};$listeners.Clear()
    if(Test-Path -LiteralPath $run){$_|Out-String|Set-Content -LiteralPath (Join-Path $run 'launcher-error.txt') -Encoding utf8}
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'CampMind Unity launcher')
    exit 1
} finally {
    foreach($listener in $listeners){$listener.Stop()}
    if($null -ne $owned){$owned.Dispose()}
}
