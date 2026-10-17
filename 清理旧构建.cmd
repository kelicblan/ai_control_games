@echo off
chcp 65001 >nul
cd /d "%~dp0"
pwsh.exe -NoProfile -File "%~dp0scripts\unity\clean-builds.ps1"
echo.
pause
