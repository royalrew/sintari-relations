# PowerShell script to start backend in new window
Write-Host "Launching Sintari Relations backend in new window..." -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendWindow = Start-Process cmd -ArgumentList @(
    "/k",
    "cd /d `"$scriptDir`" && echo Starting Python Backend Orchestrator... && echo Server ready for stdin input && echo. && python backend/orchestrator_runner.py"
) -PassThru

Write-Host "Backend window opened (PID: $($backendWindow.Id))" -ForegroundColor Green
Write-Host "Backend is waiting for input via stdin" -ForegroundColor Gray
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

