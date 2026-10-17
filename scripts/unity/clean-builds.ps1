#Requires -Version 7.2
param([switch]$Preview)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-output.ps1')
$root=Get-CampMindBuildRoot
$directories=@(Get-ChildItem -LiteralPath $root -Directory | Where-Object Name -Match '^(Camp|Compatibility)-(Mono|IL2CPP)-[a-f0-9]{32}$')
# Adopt the newest IL2CPP player without copying gigabytes, then remove old builds.
if(-not $Preview -and -not(Test-Path -LiteralPath (Join-Path $root 'Camp-IL2CPP/CampMind.exe'))){
    $latest=$directories | Where-Object { $_.Name -match '^Camp-IL2CPP-' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'CampMind.exe')) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if($latest){
        $source=Assert-CampMindBuildDirectory -Path $latest.FullName
        $destination=Assert-CampMindBuildDirectory -Path (Join-Path $root 'Camp-IL2CPP')
        if(-not(Test-Path -LiteralPath $destination)){
            Move-Item -LiteralPath $source -Destination $destination
            Write-Output 'Latest IL2CPP build moved to native/Builds/Camp-IL2CPP (no duplicate copy).'
            $directories=@($directories | Where-Object FullName -NE $source)
        }
    }
}
# Until a fixed build exists, preserve the most recent playable legacy build.
$keep=$null
if(-not(Test-Path -LiteralPath (Join-Path $root 'Camp-IL2CPP/CampMind.exe'))){
    $keep=$directories | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'CampMind.exe') } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
$removed=0L
foreach($directory in $directories){
    if($keep -and $directory.FullName -eq $keep.FullName){Write-Output "Keep latest playable build: $($directory.Name)";continue}
    try{
        $checked=Assert-CampMindBuildDirectory -Path $directory.FullName
        $bytes=(Get-ChildItem -LiteralPath $checked -File -Recurse | Measure-Object Length -Sum).Sum
        if($Preview){Write-Output ("Would remove {0} ({1:N2} GB)" -f $directory.Name,($bytes/1GB));continue}
        Remove-CampMindBuildDirectory -Path $checked;$removed+=$bytes
        Write-Output "Removed $($directory.Name)"
    }catch{Write-Warning $_.Exception.Message}
}
if(-not $Preview){Write-Output ("Freed {0:N2} GB. Fixed builds and saves were preserved." -f ($removed/1GB))}
