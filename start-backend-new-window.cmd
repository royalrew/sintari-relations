@echo off
echo Launching backend orchestrator in new window...
start "Sintari Relations Backend" cmd /k "cd /d %~dp0 && echo Starting Python backend orchestrator... && echo. && python backend/orchestrator_runner.py"
echo.
echo Backend window opened!
echo The orchestrator is waiting for input via stdin.
timeout /t 3 >nul

