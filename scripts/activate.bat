@echo off
set "YOURCRUSH_PROJECT_ROOT=%~dp0.."
for %%I in ("%YOURCRUSH_PROJECT_ROOT%") do set "YOURCRUSH_PROJECT_ROOT=%%~fI"
for /f "usebackq delims=" %%V in ("%YOURCRUSH_PROJECT_ROOT%\.nvmrc") do set "YOURCRUSH_NODE_VERSION=%%V"
set "YOURCRUSH_NODE_HOME=%YOURCRUSH_PROJECT_ROOT%\.runtime\node-v%YOURCRUSH_NODE_VERSION%-win-x64"

if not exist "%YOURCRUSH_NODE_HOME%\node.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%YOURCRUSH_PROJECT_ROOT%\scripts\setup-node-env.ps1"
  if errorlevel 1 exit /b 1
)

set "PATH=%YOURCRUSH_NODE_HOME%;%PATH%"
echo Activated yourcrush project-local Node.js environment: %YOURCRUSH_NODE_VERSION%
node --version
npm --version
