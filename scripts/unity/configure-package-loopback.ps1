#Requires -Version 7.2
param([switch]$Apply,[switch]$Undo)
$ErrorActionPreference='Stop'
if($Apply -and $Undo){throw 'Choose Apply or Undo'}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath((Get-Location).Path) -ne $repository){throw 'Run from the current Unity checkout'}
$metadata=Get-Content (Join-Path $repository native/Artifacts/village/P6/package.json) -Raw|ConvertFrom-Json
$directory=[IO.Path]::GetFullPath($metadata.directory)
$allowedRoots=@((Join-Path $repository native/Releases),(Join-Path $env:LOCALAPPDATA CampMindReleases))
if(-not($allowedRoots|Where-Object {$directory.StartsWith([IO.Path]::GetFullPath($_)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)})){throw 'Package must be in an owned release directory'}
$manifestFile=Join-Path $directory $metadata.manifestFile
if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash -ne $metadata.manifestHash){throw 'Package manifest changed'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
$plans=@(foreach($relative in @('runtime/node.exe','gamesoul/runtime/llama-server.exe')){
    $program=Join-Path $directory $relative
    $hash=(Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant()
    if(($manifest.files|Where-Object file -eq $relative).sha256 -ne $hash){throw "Package executable changed: $relative"}
    $key=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($program.ToLowerInvariant()))).Substring(0,16).ToLowerInvariant()
    [pscustomobject]@{Name="CampMindVillagePackageLoopback-$key";Program=$program;Sha256=$hash;Direction='Inbound';Protocol='TCP';LocalAddress='127.0.0.1';RemoteAddress='127.0.0.1';Action='Allow'}
})
$auditFile=Join-Path $repository native/Artifacts/village/P6/package-loopback-audit.json
if($Undo){
    $audit=Get-Content -LiteralPath $auditFile -Raw|ConvertFrom-Json
    foreach($entry in $audit.rules|Where-Object created){
        $plan=$plans|Where-Object Name -eq $entry.Name
        if(-not $plan -or $plan.Program -ne $entry.Program){throw 'Rollback does not match the current verified package'}
        $rule=Get-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue
        if($rule){if(($rule|Get-NetFirewallApplicationFilter).Program -ne $entry.Program){throw 'Rule program changed; preserve it'};Remove-NetFirewallRule -Name $entry.Name}
    }
    Write-Output 'Removed only rules created for this package';exit 0
}
if(-not $Apply){$plans|ConvertTo-Json -Depth 4;exit 0}
$results=@();try{
    foreach($plan in $plans){
        $existing=Get-NetFirewallRule -Name $plan.Name -ErrorAction SilentlyContinue
        if($existing){throw 'A rule with this package identity already exists; inspect it before changing it'}
        New-NetFirewallRule -Name $plan.Name -DisplayName 'CampMind village package - loopback only' -Program $plan.Program -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 127.0.0.1 -RemoteAddress 127.0.0.1 -Profile Any -Enabled True -EdgeTraversalPolicy Block|Out-Null
        $results+=[pscustomobject]@{Name=$plan.Name;Program=$plan.Program;Sha256=$plan.Sha256;created=$true}
    }
    [pscustomobject]@{package=$directory;createdUtc=[DateTime]::UtcNow.ToString('o');rules=$results}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $auditFile -Encoding utf8
    $results|ConvertTo-Json -Depth 3
}catch{foreach($entry in $results){Remove-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue};throw}
