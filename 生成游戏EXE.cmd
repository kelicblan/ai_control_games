@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "CAMPMIND_EXIT=1"
call "%~dp0scripts\unity\resolve-runtime.cmd"
if errorlevel 1 goto done
"%CAMPMIND_PWSH%" -NoProfile -File "%~dp0scripts\unity\build-game.ps1" %*
set "CAMPMIND_EXIT=%ERRORLEVEL%"
:done
echo.
pause
exit /b %CAMPMIND_EXIT%
