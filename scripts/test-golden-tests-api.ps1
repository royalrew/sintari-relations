# Test Golden Tests - PowerShell Script
# Kor golden tests via API (kraver att servern kors)
#
# Anvandning:
#   1. Starta servern: npm run dev
#   2. Kor detta script: .\scripts\test-golden-tests-api.ps1

Write-Host "Kor golden tests for coach-pipelinen via API..." -ForegroundColor Cyan
Write-Host ""

$apiUrl = if ($env:COACH_API_URL) { $env:COACH_API_URL } else { "http://localhost:3000" }
Write-Host "API URL: $apiUrl" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/api/coach/test-golden" -Method Get -ContentType "application/json"
    
    Write-Host ""
    Write-Host "Resultat:" -ForegroundColor Cyan
    $passedColor = if ($response.summary.failed -gt 0) { "Yellow" } else { "Green" }
    Write-Host "Passerade: $($response.summary.passed)/$($response.summary.total)" -ForegroundColor $passedColor
    Write-Host "Misslyckade: $($response.summary.failed)/$($response.summary.total)" -ForegroundColor $(if ($response.summary.failed -gt 0) { "Red" } else { "Gray" })
    Write-Host ""
    
    # Visa detaljerade resultat
    foreach ($result in $response.results) {
        $status = if ($result.passed) { "[OK]" } else { "[FAIL]" }
        $color = if ($result.passed) { "Green" } else { "Red" }
        
        Write-Host "$status $($result.test.name)" -ForegroundColor $color
        Write-Host "   $($result.test.description)" -ForegroundColor Gray
        
        if (-not $result.passed -and $result.errors.Count -gt 0) {
            Write-Host "   Fel:" -ForegroundColor Red
            foreach ($err in $result.errors) {
                Write-Host "   - $err" -ForegroundColor Red
            }
        }
        
        if ($result.actual.reply) {
            $replyPreview = if ($result.actual.reply.Length -gt 60) { 
                $result.actual.reply.Substring(0, 60) + "..." 
            } else { 
                $result.actual.reply 
            }
            Write-Host "   Svar: `"$replyPreview`"" -ForegroundColor Gray
        }
        
        if ($result.actual.teacherReview.feedback.overallScore) {
            $score = [math]::Round($result.actual.teacherReview.feedback.overallScore, 1)
            Write-Host "   Teacher Score: $score/10" -ForegroundColor Gray
        }
        
        Write-Host ""
    }
    
    # Exit code baserat pa resultat
    if ($response.summary.failed -gt 0) {
        exit 1
    } else {
        exit 0
    }
} catch {
    Write-Host "Fel vid korning av golden tests: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tips: Se till att Next.js-servern kors pa port 3000:" -ForegroundColor Yellow
    Write-Host "   npm run dev" -ForegroundColor Yellow
    exit 1
}
