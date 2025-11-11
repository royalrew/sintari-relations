# Test Golden Tests - Enkel PowerShell Script
# Kor golden tests via API
#
# Anvandning:
#   .\scripts\test-golden.ps1

$apiUrl = "http://localhost:3000"

Write-Host "Kor golden tests..." -ForegroundColor Cyan
Write-Host "API: $apiUrl/api/coach/test-golden" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/api/coach/test-golden" -Method Get
    
    Write-Host "Resultat:" -ForegroundColor Cyan
    Write-Host "  Passerade: $($response.summary.passed)/$($response.summary.total)" -ForegroundColor Green
    Write-Host "  Misslyckade: $($response.summary.failed)/$($response.summary.total)" -ForegroundColor $(if ($response.summary.failed -gt 0) { "Red" } else { "Gray" })
    Write-Host ""
    
    foreach ($result in $response.results) {
        $status = if ($result.passed) { "[OK]" } else { "[FAIL]" }
        $color = if ($result.passed) { "Green" } else { "Red" }
        Write-Host "$status $($result.test.name)" -ForegroundColor $color
        
        if (-not $result.passed) {
            foreach ($err in $result.errors) {
                Write-Host "    - $err" -ForegroundColor Red
            }
        }
    }
    
    if ($response.summary.failed -gt 0) {
        exit 1
    }
} catch {
    Write-Host "Fel: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Starta servern forst:" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor White
    exit 1
}

