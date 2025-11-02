# Production Deployment Checklist - Emotion Core

## ✅ Pre-Deployment Verification

### A. Python Agent Test (Local)
```bash
# Test 1: Basic functionality
python agents/emotion/micro_mood.py "Ibland blir tonen lite kort på kvällen."

# Expected: {"ok":true,"level":"neutral"...}

# Test 2: RED detection
python agents/emotion/micro_mood.py "Jag orkar inte mer, allt känns hopplöst"

# Expected: {"ok":true,"level":"red","score":0.9,"red_hint":"Critical mood detected"}

# Test 3: Neutral
python agents/emotion/micro_mood.py "Allt känns ganska neutralt just nu."

# Expected: {"ok":true,"level":"neutral","score":0.45}
```

### B. Py-Bridge Test (Node.js → Python)
```bash
cd sintari-relations
node scripts/test_py_bridge_micro_mood.mjs
```

Expected: 20/20 tests pass, P95 latency <150ms, error rate 0%

### C. Golden Evaluation
```bash
cd sintari-relations
node scripts/emotion_golden_eval.mjs
```

Expected: Accuracy ~0.549, Light 32.9%, Plus 48.8%, Red 84%, Neutral 100%, gap 0.014, RED-FP 0.00

## 🚀 Production Environment Setup

### 1. Environment Variables

Create/update `.env` in production:

```bash
# Emotion Core Configuration
CALIBRATION_MODE=false
FEATURE_RESOLVE=false
FEATURE_MUTUAL=false
FEATURE_TENSION_LITE=false

# Python Configuration
PYTHON_BIN=python
PY_AGENT_PATH=agents/emotion/micro_mood.py

# Logging
EMOTION_LOG_DIR=reports/emotion_events

# Optional (for enhanced features)
# FEATURE_MUTUAL=true          # Boost Plus recall +5pp
# FEATURE_TENSION_LITE=true    # Slight Light boost +2pp
# WX_TENSION_LITE=0.8
# Z_LIGHT=0.46
```

### 2. Python Environment

**On Railway/VM/Docker:**
```bash
python --version  # Should work
pip install -r agents/emotion/requirements.txt  # If any
```

**⚠️ Warning:**
- Vercel serverless does NOT support spawning Python processes
- If frontend is on Vercel, backend MUST be on Railway/VM/Docker

### 3. File Permissions

Create writable directories:
```bash
mkdir -p reports/emotion_events reports
chmod 755 reports reports/emotion_events
```

### 4. Cron/Agregator (Auto-updates KPI panel)

**On Railway/VM:**
```bash
# Add to crontab
0 * * * * cd /path/to/sintari-relations && node scripts/agg_emotion_events.mjs
```

**On GitHub Actions:**
If using GitHub Actions for CI, ensure workflow has correct repo paths.

## 🔍 Post-Deployment Verification

### A. Python Bridge Check
```bash
# In production shell
echo '{"agent":"micro_mood","text":"Ibland blir tonen lite kort på kvällen."}' | python agents/emotion/micro_mood.py
```

Expected: Valid JSON with `ok:true`, `level`, `score`

### B. API Check
```bash
curl https://<your-prod-domain>/api/emotion/summary
```

Expected: JSON with `events`, `p95_latency_ms`, `red_rate`, `sv_en_gap`

### C. UI Dashboard
1. Open `/dashboard`
2. Navigate to "Micro-Mood Live" panel
3. Verify numbers are displayed
4. Test `/analyze` with 3-5 sample cases
5. Click 🔄 refresh button
6. Verify events counter increases

### D. Log File Verification
```bash
# Check log file growth
ls -lh reports/emotion_events/$(date +%Y-%m-%d).jsonl

# Tail to see live events
tail -f reports/emotion_events/$(date +%Y-%m-%d).jsonl
```

Expected: File grows as users analyze content

## ⚠️ Common Pitfalls to Avoid

### 1. Python in Vercel
**Problem:** Can't spawn Python in serverless environment  
**Solution:** Backend MUST be on Railway/VM/Docker, not Vercel

### 2. Write Permissions
**Problem:** Reports directory not writable  
**Solution:** Ensure `reports/*` has write permissions in production

### 3. Missing ENV Variables
**Problem:** Without `CALIBRATION_MODE=false`, different levels than baseline  
**Solution:** Set all ENV variables explicitly in production `.env`

### 4. Missing Cron
**Problem:** KPI panel doesn't update even though analyses run  
**Solution:** Configure hourly cron job to run `agg_emotion_events.mjs`

### 5. Split Deployment
**Problem:** Frontend on Vercel, backend needs Python  
**Solution:** 
- Frontend (Next.js) on Vercel
- Backend (Node + Python bridge) on Railway/VM
- Set `BACKEND_URL` in frontend
- Proxy `/api/emotion/*` to backend

## 📊 Expected Performance

| Metric | Baseline Target | Current |
|--------|----------------|---------|
| Accuracy | ≥0.70 | 0.549 |
| Light Recall | ≥55% | 32.9% |
| Plus Recall | ≥65% | 48.8% |
| Red Recall | ≥80% | 84% ✅ |
| Neutral Recall | ≥90% | 100% ✅ |
| Gap (SV/EN) | <0.02 | 0.014 ✅ |
| RED-FP | ≤0.10 | 0.00 ✅ |
| P95 Latency | <150ms | ~45ms ✅ |

**Note:** Baseline is production-ready but below ideal targets. Light classification needs more data/features to reach 55% recall.

## 🔗 Key Files

- **Core:** `agents/emotion/micro_mood.py`
- **Bridge:** `sintari-relations/backend/ai/py_bridge.ts`
- **Orchestrator:** `sintari-relations/lib/agents/agent_orchestrator.ts`
- **Golden:** `tests/golden/emotion/micro_mood_golden.jsonl` (240 cases)
- **Eval:** `sintari-relations/scripts/emotion_golden_eval.mjs`
- **Status:** `sintari-relations/EMOTION_CORE_STATUS.md`

## 📝 Git Tag for Golden Set

```bash
# Tag current golden set
git tag tests/golden/VERSION=2025-11-02-emotion-core

# Merge to main
git checkout main
git merge feature/emotion-core

# Deploy
# ... your deployment process ...
```

## ✅ Final Checklist

- [ ] Python works in production environment
- [ ] `.env` configured with all required variables
- [ ] File permissions set correctly
- [ ] Cron job configured (or manual aggregation)
- [ ] Py-bridge test passes (local)
- [ ] Golden eval returns expected baseline
- [ ] API endpoint responds correctly
- [ ] UI dashboard shows numbers
- [ ] Log files are being written
- [ ] Git tagged and merged to main
- [ ] Deployed to production
- [ ] Live checks completed successfully

---

**Status:** ✅ Ready for production deployment  
**Baseline:** 0.549 accuracy, 0 RED-FP, gap 0.014  
**Next milestone:** 0.70+ with Light ≥55% (requires data boost or feature work)

