@echo off
title ISO 27001 ISMS Dashboard
cd /d "D:\iso-27001-isms-dashboard-master\iso-27001-isms-dashboard-master"

set "PORT=5000"
set "URL=http://localhost:%PORT%"

rem --- resolve node.exe: PATH first, then known copies ---------------------
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "D:\AegisX_Analysis_Pipeline_v2\AegisX_Foundation\frontend\node.exe" set "NODE_EXE=D:\AegisX_Analysis_Pipeline_v2\AegisX_Foundation\frontend\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

echo ================================================
echo   ISO 27001 ISMS Dashboard
echo ================================================
echo.

if not defined NODE_EXE goto nonode

netstat -ano | findstr "LISTENING" | findstr ":%PORT% " >nul
if not errorlevel 1 goto already

if not exist node_modules goto install

goto start

:install
echo Installing dependencies (first time only)...
set "NPM_EXE=npm"
if exist "%APPDATA%\npm\npm.cmd" set "NPM_EXE=%APPDATA%\npm\npm.cmd"
call "%NPM_EXE%" install
if errorlevel 1 goto npmfail
if not exist node_modules goto npmfail

:start
echo Node    : %NODE_EXE%
echo Port    : %PORT%
echo URL     : %URL%
echo.
echo Keep this window OPEN while using the tool.
echo Press Ctrl+C to stop the server.
echo.
rem Open the browser only after the port is really listening, otherwise the
rem browser shows "connection refused" and the app looks broken.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){ if(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue){ Start-Process '%URL%'; break }; Start-Sleep -Milliseconds 500 }"
"%NODE_EXE%" server.js
echo.
echo Server stopped.
goto done

:already
echo Server is ALREADY running on port %PORT%.
echo Opening the browser...
start "" "%URL%"
echo.
echo If the page is not open, paste this in the browser:
echo    %URL%
goto done

:nonode
echo [ERROR] Node.js was not found.
echo.
echo   Install Node.js 18 or newer from https://nodejs.org
echo   or copy node.exe into this folder as "node.exe".
goto done

:npmfail
echo [ERROR] Dependency installation failed.
goto done

:done
echo.
pause
