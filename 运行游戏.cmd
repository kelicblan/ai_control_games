@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\unity\resolve-runtime.cmd"
if errorlevel 1 goto failed
"%CAMPMIND_PWSH%" -NoProfile -File "%~dp0scripts\unity\play.ps1" %*
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
