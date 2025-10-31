# PowerShell script to start batch runner in new window
Write-Host "Launching Sintari batch runner in new window..." -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batchWindow = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$scriptDir'; Write-Host 'Starting Batch Runner...' -ForegroundColor Cyan; Write-Host 'Running 200 cases with live-mix...' -ForegroundColor Yellow; Write-Host ''; node scripts/batch_run_sample.mjs --n=200 --shadow --mix=live --trivial=datasets/trivial_pool.jsonl --golden=tests/golden/relations/seed.jsonl"
) -PassThru

Write-Host "Batch runner window opened (PID: $($batchWindow.Id))" -ForegroundColor Green
Write-Host "Check the new window for progress and results." -ForegroundColor Gray
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

