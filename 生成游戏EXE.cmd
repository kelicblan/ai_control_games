@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "CAMPMIND_EXIT=1"
call "%~dp0scripts\unity\resolve-runtime.cmd"
if errorlevel 1 goto done
"%CAMPMIND_PWSH%" -NoProfile -File "%~dp0scripts\unity\build-game.ps1" %*
set "CAMPMIND_EXIT=%ERRORLEVEL%"
if not "%CAMPMIND_EXIT%"=="0" goto failed
if exist "%~dp0native\Builds\NewWorld-IL2CPP\world-layout.json" (
  explorer.exe "%~dp0native\Builds\NewWorld-IL2CPP"
) else (
  explorer.exe "%~dp0native\Builds\Camp-IL2CPP"
)
goto done
:failed
echo 生成失败。请查看上方错误，以及 native\Artifacts\builds 中的构建日志。
:done
echo.
pause
exit /b %CAMPMIND_EXIT%
