param([int]$Port = 5173, [switch]$Preview)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
        & $npmCommand ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    & $npmCommand run npc:setup
    if ($LASTEXITCODE -ne 0) { throw 'MiniMind static assets preparation failed' }
    Write-Host "Game: http://localhost:$Port - MiniMind3 is the default; native llama.cpp starts on model selection. No Python service."
    if ($Preview) {
        & $npmCommand run build
        if ($LASTEXITCODE -ne 0) { throw 'Game build failed' }
        & $npmCommand run preview -- --port $Port --strictPort
    } else {
        & $npmCommand start -- --port=$Port
    }
} finally { Pop-Location }
