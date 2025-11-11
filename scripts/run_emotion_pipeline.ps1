# Emotion Core Pipeline (PowerShell)
# Körordning för kalibrering och testning

Write-Host "🧪 Emotion Core Pipeline" -ForegroundColor Cyan
Write-Host ""

# 1) Validera golden data
Write-Host "1️⃣ Validerar golden data..." -ForegroundColor Yellow
python scripts/check_emotion_golden.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Validering misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2️⃣ Kör kalibrering (grid search)..." -ForegroundColor Yellow
Write-Host "   (Detta kan ta lite tid...)" -ForegroundColor Gray
node scripts/emotion_grid_calibrate.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Kalibrering misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "3️⃣ Kör worldclass emotion test-suite..." -ForegroundColor Yellow
pytest -q tests/worldclass/test_emotion_suite.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Test-suite misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "4️⃣ Uppdaterar worldclass_live.json..." -ForegroundColor Yellow
python backend/metrics/worldclass_live.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ worldclass_live misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "5️⃣ Kör CI-gate (validerar KPI-trösklar)..." -ForegroundColor Yellow
pytest -q tests/metrics/test_worldclass_live_json.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CI-gate misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Allt klart! Emotion Core pipeline passerade." -ForegroundColor Green

