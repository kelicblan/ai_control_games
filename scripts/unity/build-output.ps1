#Requires -Version 7.2
# Delete only recognized generated build directories, never project/save folders.
function Get-CampMindBuildRoot {
    $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $root=Join-Path $repo 'native/Builds'
    foreach($ancestor in @($repo,(Join-Path $repo 'native'),$root)){
        if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Refusing linked build ancestor: $ancestor"}
    }
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Builds must not be a junction or symbolic link'}
    return $root
}
function Assert-CampMindBuildDirectory {
    param([Parameter(Mandatory)][string]$Path)
    $root=Get-CampMindBuildRoot
    $target=[IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
    if(-not [string]::Equals([IO.Path]::GetDirectoryName($target),$root,[StringComparison]::OrdinalIgnoreCase) -or
       [IO.Path]::GetFileName($target) -notmatch '^(?:\.building-)?(?:Camp|Compatibility)-(?:Mono|IL2CPP)(?:-[a-f0-9]{32})?$'){
        throw "Refusing non-build target: $target"
    }
    if(Test-Path -LiteralPath $target){
        if((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Refusing linked build: $target"}
        if(Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1){throw "Refusing build containing a link: $target"}
        $prefix=$target+[IO.Path]::DirectorySeparatorChar
        if(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1){throw "Game is running; close it first: $target"}
    }
    return $target
}
function Remove-CampMindBuildDirectory {
    param([Parameter(Mandatory)][string]$Path)
    $checked=Assert-CampMindBuildDirectory -Path $Path
    if(Test-Path -LiteralPath $checked){Remove-Item -LiteralPath $checked -Recurse -Force -ErrorAction Stop}
}
function Remove-CampMindBuildDebugFiles {
    param([Parameter(Mandatory)][string]$Path)
    $checked=Assert-CampMindBuildDirectory -Path $Path
    if(-not(Test-Path -LiteralPath $checked)){return}
    $prefix=$checked+[IO.Path]::DirectorySeparatorChar
    foreach($folder in Get-ChildItem -LiteralPath $checked -Directory | Where-Object { $_.Name -eq 'CampMind_BackUpThisFolder_ButDontShipItWithYourGame' -or $_.Name -like '*_BurstDebugInformation_DoNotShip' }){
        $target=[IO.Path]::GetFullPath($folder.FullName)
        if(-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Debug cleanup escaped its build'}
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
    }
}
