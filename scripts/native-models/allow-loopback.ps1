param([switch]$Remove)
$ErrorActionPreference = 'Stop'

# Run only after the user approves the Windows firewall change.
# Scope: this project's executable, TCP, IPv4 loopback at both ends.
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nativeExe = (Resolve-Path (Join-Path $projectRoot 'gamesoul\runtime\llama-server.exe')).Path
$ruleName = 'Campmind-Native-Llama-Loopback'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    $existingProgram = ($existing | Get-NetFirewallApplicationFilter).Program
    if ($existingProgram -ne $nativeExe) {
        throw "The named rule belongs to a different executable; no changes made: $existingProgram"
    }
    if ($Remove) {
        $existing | Remove-NetFirewallRule
        Write-Output 'Removed the Campmind native loopback rule.'
    } else {
        Write-Output 'The Campmind native loopback rule already exists; no changes made.'
    }
    exit 0
}
if ($Remove) { Write-Output 'No Campmind native loopback rule exists.'; exit 0 }

New-NetFirewallRule -Name $ruleName -DisplayName 'Campmind native llama.cpp - loopback only' `
    -Description 'Allow this project native model service only from IPv4 loopback. No LAN or Internet inbound access.' `
    -Direction Inbound -Action Allow -Enabled True -Profile Any -Protocol TCP `
    -Program $nativeExe -LocalAddress 127.0.0.1 -RemoteAddress 127.0.0.1 `
    -EdgeTraversalPolicy Block | Select-Object Name,Enabled,Direction,Action
