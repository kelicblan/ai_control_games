$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$targets = @()
# One-time transition from the old detached world/Vite launcher. Never match all Node processes.
foreach ($gamePort in @(5173, 18081)) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $gamePort -ErrorAction SilentlyContinue | Sort-Object -Property OwningProcess -Unique)
    foreach ($gameConnection in $connections) {
        $gamePid = $gameConnection.OwningProcess
        $gameProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$gamePid"
        $commandText = $gameProcess.CommandLine
        $owned = $false
        if ($gamePort -eq 18081 -and $commandText -match 'scripts[/\\]world[/\\]server\.ts') {
            $health = Invoke-RestMethod "http://127.0.0.1:$gamePort/game-api/health" -TimeoutSec 2
            $owned = $health.service -eq 'campmind-world-v1' -and [IO.Path]::GetFullPath($health.root) -eq $projectRoot
        } elseif ($gamePort -eq 5173) {
            $normalized = $commandText.Replace('/', [char]92)
            $ownedPrefix = $projectRoot + [char]92 + 'node_modules' + [char]92
            $owned = $normalized.IndexOf($ownedPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $normalized -match 'vite[/\\].*vite\.js'
        }
        if (-not $owned -or $gameProcess.Name -ne 'node.exe') { throw "Port $gamePort belongs to an unverified process; leaving it running." }
        $targets += [PSCustomObject]@{ Port = $gamePort; ProcessId = $gamePid }
    }
}
foreach ($target in $targets | Sort-Object -Property ProcessId -Unique) {
    $current = @(Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue)
    if (-not ($current.OwningProcess -contains $target.ProcessId)) { throw 'Service ownership changed; stop cancelled.' }
    Stop-Process -Id $target.ProcessId -ErrorAction Stop
    Write-Host "Stopped old project service on port $($target.Port)."
}
