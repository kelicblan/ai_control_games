$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $PSScriptRoot 'logs\server.json'
if (!(Test-Path -LiteralPath $stateFile)) { Write-Output 'No recorded GameSoul process'; exit 0 }
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if ($process) {
    if ($process.Path -ne $state.executable -or $process.StartTime.ToUniversalTime().ToString('o') -ne $state.started) { throw 'Process identity changed; refusing to stop another process' }
    Stop-Process -Id $process.Id
}
Remove-Item -LiteralPath $stateFile
Write-Output 'GameSoul stopped'
