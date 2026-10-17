@echo off
set "CAMPMIND_PWSH="
for %%P in ("%ProgramFiles%\PowerShell\7\pwsh.exe" "%LOCALAPPDATA%\Microsoft\PowerShell\7\pwsh.exe" "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe") do if not defined CAMPMIND_PWSH if exist "%%~P" set "CAMPMIND_PWSH=%%~P"
if not defined CAMPMIND_PWSH for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined CAMPMIND_PWSH set "CAMPMIND_PWSH=%%P"
if not defined CAMPMIND_PWSH (
    echo PowerShell 7 was not found. Install PowerShell 7 or restore its installation.
    exit /b 1
)
for %%P in ("%CAMPMIND_PWSH%") do set "PATH=%%~dpP;%PATH%"
where node.exe >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
    if exist "D:\Program Files\nodejs\node.exe" set "PATH=D:\Program Files\nodejs;%PATH%"
)
exit /b 0
