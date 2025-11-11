# Test Golden Tests - PowerShell Script
# Kör golden tests för coach-pipelinen

Write-Host "🧪 Kör golden tests för coach-pipelinen...`n" -ForegroundColor Cyan

# Kör Node.js script
node sintari-relations/scripts/test-golden-tests.js

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Alla golden tests passerade!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Några golden tests misslyckades" -ForegroundColor Red
    exit $LASTEXITCODE
}

