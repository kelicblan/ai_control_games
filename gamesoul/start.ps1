param([int]$Port = 18080, [int]$Threads = 20)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$exe = Join-Path $root 'runtime\llama-server.exe'
$config = Get-Content -LiteralPath (Join-Path $root 'model-config.json') -Raw | ConvertFrom-Json
$model = Join-Path $root $config.model
foreach ($file in @($exe, $model)) { if (!(Test-Path -LiteralPath $file)) { throw "Missing asset: $file" } }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use" }
New-Item -ItemType Directory -Force (Join-Path $root 'logs'), (Join-Path $root 'cache\tmp') | Out-Null
$env:TEMP = Join-Path $root 'cache\tmp'
$env:TMP = $env:TEMP
$argsList = @('-m', ('"' + $model + '"'), '--alias', $config.alias, '--host', '127.0.0.1', '--port', $Port, '-c', '4096', '-np', '1', '-t', $Threads, '-tb', $Threads, '-ngl', '0', '--jinja', '--reasoning-budget', '0', '--no-webui')
$process = Start-Process -FilePath $exe -ArgumentList $argsList -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'logs\server.stdout.log') -RedirectStandardError (Join-Path $root 'logs\server.stderr.log') -PassThru
@{ pid = $process.Id; port = $Port; executable = $exe; started = $process.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'logs\server.json') -Encoding UTF8
for ($i = 0; $i -lt 20; $i++) {
    $process.Refresh()
    if ($process.HasExited) { Get-Content (Join-Path $root 'logs\server.stderr.log') -Tail 25; throw 'Qwen3 server exited' }
    try { $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($health.status -eq 'ok') { Write-Output "$($config.alias) ready: http://127.0.0.1:$Port/v1 (PID $($process.Id))"; exit 0 } } catch {}
    Start-Sleep -Seconds 1
}
Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
throw 'Health check timed out. Process stopped; inspect gamesoul/logs/server.stderr.log and local network policy.'
