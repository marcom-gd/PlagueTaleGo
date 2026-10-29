@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "WORKSHOP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Install Node.js 20 or newer from https://nodejs.org then try again.
    pause
    exit /b 1
  )
) else (
  set "WORKSHOP_NODE=node"
)
if not exist "tools\cloudflared.exe" (
  echo Downloading the official Cloudflare tunnel tool for Windows...
  powershell -NoProfile -Command "$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force tools | Out-Null; $arch=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'arm64'}else{'amd64'}; Invoke-WebRequest -UseBasicParsing ('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-'+$arch+'.exe') -OutFile 'tools\cloudflared.download'; Move-Item -LiteralPath 'tools\cloudflared.download' -Destination 'tools\cloudflared.exe' -Force"
  if errorlevel 1 (
    echo Download failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
"%WORKSHOP_NODE%" online.mjs
pause
