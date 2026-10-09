@echo off
rem Starts the agent tree viewer and opens it in the default browser. If it already runs, only opens it.
rem Arguments pass through, so `agent-tree-viewer.bat --port 5190` serves on another port.
rem The server runs in the console; close it or press Ctrl+C to stop the viewer.
rem Opened from Explorer, cmd runs it as `cmd /c "<this file>"`, and that window closes the moment
rem the server stops. So it reopens itself in a console of its own that stays open.
echo %cmdcmdline% | find /i "%~f0" >nul
if not errorlevel 1 if not "%~1"=="--console" (
  start "agent tree viewer" cmd /k ""%~f0" --console %*"
  exit /b 0
)
if "%~1"=="--console" shift
cd /d "%~dp0"
if not exist node_modules (
  call npm install || exit /b 1
)
node server\main.ts --open %1 %2 %3 %4 %5 %6 %7 %8
