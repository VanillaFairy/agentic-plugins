@echo off
rem Starts the agentics viewer and opens it in the default browser. If it already runs, only opens it.
rem The server runs in this window; close it or press Ctrl+C to stop the viewer.
cd /d "%~dp0"
if not exist node_modules (
  call npm install || exit /b 1
)
node server\main.ts --open
