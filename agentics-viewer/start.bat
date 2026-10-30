@echo off
rem Starts the agentics viewer and opens it in the default browser. If it already runs, only opens it.
rem The server runs in the console; close it or press Ctrl+C to stop the viewer.
rem Opened from Explorer or a file manager, cmd runs it as `cmd /c "<this file>"`, and that window
rem closes the moment the server stops. So it reopens itself in a console of its own that stays open.
echo %cmdcmdline% | find /i "%~f0" >nul
if not errorlevel 1 if not "%~1"=="--console" (
  start "agentics viewer" cmd /k ""%~f0" --console"
  exit /b 0
)
cd /d "%~dp0"
if not exist node_modules (
  call npm install || exit /b 1
)
node server\main.ts --open
