@echo off
echo Launching server in new window...
start "Sintari Relations Server" cmd /k "cd /d %~dp0 && npm run dev"
echo.
echo Server window opened!
echo Check the new window for server status.
timeout /t 3 >nul

