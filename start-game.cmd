@echo off
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8899"

echo.
echo   GRAND THEFT BAYOU: Louisiana Stories
echo   -----------------------------------
echo   Serving on http://localhost:%PORT%/
echo.
echo   Keep this window open while you play.
echo   Close it (or press Ctrl+C) to stop the server.
echo.

REM The game CANNOT be opened by double-clicking index.html: browsers block ES
REM modules on file:// . Avoiding that is the whole point of this launcher.
if not "%GTB_NO_BROWSER%"=="1" (
  start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"
)

node serve.mjs %PORT%
