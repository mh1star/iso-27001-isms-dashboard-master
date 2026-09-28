@echo off
setlocal
cd /d "%~dp0"
set "PORT=4000"

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo The ISO 27001 ISMS Dashboard is already running on http://localhost:%PORT%
  start "" "http://localhost:%PORT%"
  exit /b 0
)

echo Starting ISO 27001 ISMS Dashboard on http://localhost:%PORT%
node server.js
if errorlevel 1 (
  echo.
  echo The platform stopped with an error.
  pause
)
endlocal
