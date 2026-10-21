@echo off
setlocal
cd /d "%~dp0"
call scripts\unity\resolve-runtime.cmd
if errorlevel 1 goto failed
"%CAMPMIND_PWSH%" -NoProfile -ExecutionPolicy Bypass -File scripts\unity\play-reference-sample.ps1
if errorlevel 1 goto failed
exit /b 0
:failed
echo Reference sample could not start. See the message above.
pause
exit /b 1
