@echo off
call "%~dp0scripts\unity\resolve-runtime.cmd"
if errorlevel 1 goto failed
start "" "%CAMPMIND_PWSH%" -NoProfile -WindowStyle Hidden -File "%~dp0scripts\unity\open-editor.ps1"
exit /b
:failed
pause
exit /b 1
