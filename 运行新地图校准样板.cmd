@echo off
setlocal
cd /d "%~dp0"
if not exist "native\Builds\NewWorldCalibration\NewWorldCalibration.exe" (
  echo New world calibration player has not been built.
  pause
  exit /b 1
)
start "" "%~dp0native\Builds\NewWorldCalibration\NewWorldCalibration.exe" -windowed -screen-width 1672 -screen-height 941 -logFile "%~dp0native\Artifacts\new-world-calibration\interactive-player.log"
