@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "WORKSHOP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Node.js 20 or newer is required. Install it from https://nodejs.org then try again.
    pause
    exit /b 1
  )
) else (
  set "WORKSHOP_NODE=node"
)
title Plague Tale GO - User Test
"%WORKSHOP_NODE%" launcher.mjs --user-test
if errorlevel 1 pause

