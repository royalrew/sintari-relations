# PowerShell script to start server in new window
Write-Host "Launching Sintari Relations server in new window..." -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverWindow = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$scriptDir'; Write-Host 'Starting Sintari Relations Server...' -ForegroundColor Cyan; Write-Host 'Server: http://localhost:3000' -ForegroundColor Yellow; Write-Host 'Dashboard: http://localhost:3000/dashboard' -ForegroundColor Yellow; Write-Host ''; npm run dev"
) -PassThru

Write-Host "Server window opened (PID: $($serverWindow.Id))" -ForegroundColor Green
Write-Host "Check the new window for server status." -ForegroundColor Gray
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

