@echo off
pwsh -NoProfile -File "%~dp0scripts\unity\preview-unified-ui.ps1"
if errorlevel 1 pause
