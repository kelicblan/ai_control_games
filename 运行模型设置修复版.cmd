@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\unity\resolve-runtime.cmd"
if errorlevel 1 goto failed
node "%~dp0scripts\unity\start-native-slice.mjs" --exe "%~dp0native\Builds\Village-20261019-095430\CampMind.exe" --layout new-world-v1 --village-default %*
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
