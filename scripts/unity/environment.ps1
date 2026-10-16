#Requires -Version 7.2
Set-StrictMode -Version Latest

function Get-CampMindEditorVersion {
    param([string]$ProductVersion)
    if ($ProductVersion -match '^(\d+\.\d+\.\d+[abfp]\d+)(?:_[0-9a-fA-F]{12}| \([0-9a-fA-F]{12}\))?$') { return $Matches[1] }
    return $null
}

function Get-CampMindUnityEnvironment {
    param([string]$Editor)
    $repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $toolchain = Get-Content -LiteralPath (Join-Path $repository 'native/toolchain.json') -Raw | ConvertFrom-Json
    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($Editor) { $candidates.Add($Editor) }
    elseif ($env:UNITY_EDITOR) { $candidates.Add($env:UNITY_EDITOR) }
    else {
        foreach ($base in @('C:/Program Files/Unity/Hub/Editor', 'C:/Program Files/Unity')) {
            if (Test-Path -LiteralPath $base) {
                Get-ChildItem -Path (Join-Path $base '*/Editor/Unity.exe'), (Join-Path $base 'Editor/Unity.exe') -ErrorAction SilentlyContinue |
                    ForEach-Object { $candidates.Add($_.FullName) }
            }
        }
        $onPath = Get-Command Unity.exe -ErrorAction SilentlyContinue
        if ($onPath) { $candidates.Add($onPath.Source) }
    }
    $found = $null
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $file = Get-Item -LiteralPath $candidate
        if ($file.Name -ne 'Unity.exe' -or $file.VersionInfo.ProductName -notlike '*Unity*') { continue }
        $found = $file
        if ((Get-CampMindEditorVersion $file.VersionInfo.ProductVersion) -eq $toolchain.editorVersion) { break }
    }
    $editorFound = $null -ne $found
    $version = if ($editorFound) { Get-CampMindEditorVersion $found.VersionInfo.ProductVersion } else { $null }
    $matches = $editorFound -and $version -eq $toolchain.editorVersion
    $il2cpp = $editorFound -and (Test-Path -LiteralPath (Join-Path $found.Directory.FullName 'Data/il2cpp/build/deploy/il2cpp.exe'))
    [pscustomobject]@{
        editorFound = $editorFound
        editorPath = if ($editorFound) { $found.FullName } else { $null }
        editorVersion = $version
        expectedVersion = $toolchain.editorVersion
        versionMatches = $matches
        il2cppExecutableFound = $il2cpp
        licenseStatus = 'not-validated-by-editor'
        readyForUnityValidation = [bool]$matches
        nextAction = if (-not $editorFound) { "Install Unity $($toolchain.editorVersion) and Windows IL2CPP support through Unity Hub; activate your license." }
            elseif (-not $matches) { "Use Unity $($toolchain.editorVersion); validate any toolchain version change explicitly." }
            else { 'Run EditMode tests, then Windows IL2CPP compatibility smoke; license and C++ toolchain remain unverified.' }
    }
}
