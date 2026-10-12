param([int]$Port = 5173, [switch]$Preview)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonCommand = (Get-Command python -ErrorAction Stop).Source
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$ownedServer = $null
$env:PYTHONIOENCODING = 'utf-8'

Push-Location $projectRoot
try {
    & $pythonCommand minimind3/setup_assets.py --check-only
    if ($LASTEXITCODE -ne 0) { throw 'MiniMind assets missing. Run: python minimind3/setup_assets.py' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
        & $npmCommand ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    $health = $null
    try { $health = Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 2 } catch { }
    if ($health -and ($health.model -ne 'minimind-3-q8' -or -not $health.ready)) {
        throw 'Port 8765 belongs to another service.'
    }
    if (-not $health) {
        $serverPath = Join-Path $projectRoot 'minimind3/npc_server.py'
        $ownedServer = Start-Process -FilePath $pythonCommand -ArgumentList @('-u', ('"' + $serverPath + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'minimind3/npc-server.stdout.log') -RedirectStandardError (Join-Path $projectRoot 'minimind3/npc-server.stderr.log')
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            if ($ownedServer.HasExited) { throw 'MiniMind startup failed; see minimind3/npc-server.stderr.log' }
            Start-Sleep -Milliseconds 200
            try { $health = Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 1 } catch { }
        } until ($health -or [DateTime]::UtcNow -ge $deadline)
        if (-not $health -or -not $health.ready -or $health.model -ne 'minimind-3-q8') { throw 'MiniMind startup timed out' }
    }
    Write-Host "MiniMind3 ready. Game: http://localhost:$Port (Ctrl+C stops services started here)"
    if ($Preview) {
        & $npmCommand run build
        if ($LASTEXITCODE -ne 0) { throw 'Game build failed' }
        & $npmCommand run preview -- --port $Port --strictPort
    } else {
        & $npmCommand run dev -- --port $Port --strictPort
    }
} finally {
    if ($ownedServer -and -not $ownedServer.HasExited) { Stop-Process -Id $ownedServer.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
