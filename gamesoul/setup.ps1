param([string]$Python = 'python', [switch]$IncludeGameSoul)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $root 'cache\tmp'), (Join-Path $root 'logs') | Out-Null
$env:TEMP = Join-Path $root 'cache\tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $root 'cache\pip'
$env:HF_HOME = Join-Path $root 'cache\huggingface'
$env:TORCH_HOME = Join-Path $root 'cache\torch'
$env:PYTHONPYCACHEPREFIX = Join-Path $root 'cache\pycache'
$venv = Join-Path $root '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $venv)) { & $Python -m venv (Join-Path $root '.venv'); if ($LASTEXITCODE -ne 0) { throw 'Cannot create local Python environment' } }
$downloadArgs = @((Join-Path $root 'scripts\download.py'))
if ($IncludeGameSoul) { $downloadArgs += '--include-gamesoul' }
& $venv @downloadArgs
if ($LASTEXITCODE -ne 0) { throw 'Asset download failed' }
if (!$IncludeGameSoul) { Write-Output 'Configured Qwen model setup complete. Run gamesoul/start.ps1.'; exit 0 }
& $venv -m pip install 'torch==2.14.1+cpu' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'CPU conversion dependencies failed' }
& $venv -m pip install -r (Join-Path $root 'requirements-lock.txt') --extra-index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'Conversion dependencies failed' }
& $venv (Join-Path $root 'vendor\llama.cpp-b11577\convert_lora_to_gguf.py') --base (Join-Path $root 'models\base-config') --outtype f16 --outfile (Join-Path $root 'models\gamesoul-f16.gguf') (Join-Path $root 'models\adapter')
if ($LASTEXITCODE -ne 0) { throw 'LoRA conversion failed' }
Write-Output 'GameSoul setup complete. Run gamesoul/start.ps1.'
