@echo off
chcp 65001 >nul
cd /d "%~dp0"
pwsh.exe -NoProfile -File "%~dp0scripts\unity\play.ps1"
if errorlevel 1 pause
