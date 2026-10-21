#Requires -Version 7.2
param([ValidateSet('Build','BuildSample','BuildStage2','BuildStage3','Capture')][string]$Action='Build',[string]$Editor='D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe',[switch]$UseExistingBuildReportGuard,[switch]$SkipStudio)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'process.ps1')
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repository){throw 'Run from the Unity checkout'}
$project=Join-Path $repository 'native/CampMind.Unity'
$run=Join-Path $repository ('native/Artifacts/new-world-'+$Action.ToLower()+'-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new();$start.WorkingDirectory=$repository;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
if($Action -ne 'Capture'){
    foreach($inputName in @('layout.json','vegetation-observations.json')){Copy-Item -LiteralPath (Join-Path $repository ('docs/new-world/'+$inputName)) -Destination (Join-Path $run $inputName)}
    $active=Get-CimInstance Win32_Process -Filter "name='Unity.exe'" | Where-Object {$_.CommandLine -like "*$project*" -or $_.CommandLine -like "*$($project.Replace('\','/'))*"}
    if($active){throw 'This Unity project is in use; no process was stopped'}
    $start.FileName=$Editor
    $method=if($Action -eq 'BuildStage3'){'CampMind.Editor.NewWorldCalibrationBuilder.BuildStage3Player'}elseif($Action -eq 'BuildStage2'){'CampMind.Editor.NewWorldCalibrationBuilder.BuildStage2Player'}elseif($Action -eq 'BuildSample'){'CampMind.Editor.NewWorldCalibrationBuilder.BuildSamplePlayer'}else{'CampMind.Editor.NewWorldCalibrationBuilder.BuildPlayer'}
    foreach($arg in @('-batchmode','-quit','-projectPath',$project,'-executeMethod',$method,'-logFile',(Join-Path $run 'editor.log'))){$start.ArgumentList.Add($arg)}
    if($UseExistingBuildReportGuard){
        $guard=Get-NetTCPConnection -LocalPort 38000 -State Listen -ErrorAction SilentlyContinue
        if(-not($guard | Where-Object LocalAddress -eq '127.0.0.1') -or -not($guard | Where-Object LocalAddress -eq '::1')){throw 'Existing loopback guard is absent; use the default owned guard'}
        $owners=@($guard | Select-Object -ExpandProperty OwningProcess -Unique)
        if($owners.Count -ne 1){throw 'Existing guard has ambiguous ownership'}
        $owner=Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
        if($owner.Name -ne 'pwsh.exe' -or $owner.CommandLine -notlike '*Invoke-CampMindTestProcess*' -or $owner.CommandLine -notlike '*GuardBuildReportPort*'){throw 'Existing listener is not a known CampMind build guard'}
        @{owner=$owners[0];policy='Borrow existing loopback reservation; do not stop or modify its owner'} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $run 'shared-guard.json')
    }
    $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 900 -GuardBuildReportPort:(-not $UseExistingBuildReportGuard)
    foreach($inputName in @('layout.json','vegetation-observations.json')){if((Get-FileHash -LiteralPath (Join-Path $repository ('docs/new-world/'+$inputName))).Hash -ne (Get-FileHash -LiteralPath (Join-Path $run $inputName)).Hash){throw "Reference layout changed during build; do not treat $run as a current-input build"}}
}else{
    $start.FileName=Join-Path $repository 'native/Builds/NewWorldCalibration/NewWorldCalibration.exe'
    if(-not(Test-Path -LiteralPath $start.FileName)){throw 'Build the new world calibration player first'}
    foreach($arg in @('-windowed','-screen-width','1672','-screen-height','941','-logFile',(Join-Path $run 'player.log'),'-new-world-capture',$run)){$start.ArgumentList.Add($arg)}
    if($SkipStudio){$start.ArgumentList.Add('-new-world-capture-skip-studio')}
    $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory $run -TimeoutSeconds 90
    foreach($name in @('perspective-greybox.png','perspective-overlay.png','orthographic-unfitted.png')){if(-not(Test-Path -LiteralPath (Join-Path $run $name))){throw "Missing capture $name; inspect $run"}}
}
if($code -ne 0){throw "New world $Action failed, exit $code; inspect $run"}
@{action=$Action;run=$run;visualAccepted=$false;authorityConnected=$false}|ConvertTo-Json
