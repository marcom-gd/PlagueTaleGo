@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "WORKSHOP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Node.js 20 or newer is required. Install it from https://nodejs.org then run this file again.
    pause
    exit /b 1
  )
) else (
  set "WORKSHOP_NODE=node"
)
echo Starting the workshop. Open http://localhost:3000 in your browser.
echo Keep this window open while students are connected. Press Ctrl+C to stop.
"%WORKSHOP_NODE%" server.mjs
pause
