# Deploy Now - Quick Reference

## 🚀 Instant Deployment

### 1. Set Production Environment Variables
```bash
# In your production environment (Railway/VM/Container)
export CALIBRATION_MODE=false
export FEATURE_RESOLVE=false
export FEATURE_MUTUAL=false
export FEATURE_TENSION_LITE=false
```

Or create `.env.local` in `sintari-relations/`:
```
CALIBRATION_MODE=false
FEATURE_RESOLVE=false
FEATURE_MUTUAL=false
FEATURE_TENSION_LITE=false
```

### 2. Ensure Python Works
```bash
python --version  # Should be Python 3.8+
python agents/emotion/micro_mood.py "Test"
# Should return valid JSON
```

### 3. Create Writable Directories
```bash
mkdir -p reports/emotion_events reports
chmod 755 reports reports/emotion_events
```

### 4. Deploy Code
```bash
# Tag current version
git tag 2025-11-02-emotion-core

# Push to main
git checkout main
git merge feature/emotion-core  # or your branch
git push origin main --tags

# Deploy (your method)
# For Railway: auto-deploys on push
# For VM: git pull && restart service
```

### 5. Start Aggregator (Hourly Cron)
```bash
# Add to crontab
0 * * * * cd /path/to/sintari-relations && node scripts/agg_emotion_events.mjs >> logs/agg.log 2>&1

# Or run manually for testing
node sintari-relations/scripts/agg_emotion_events.mjs
```

### 6. Smoke Tests

**A. Python Direct Test**
```bash
python agents/emotion/micro_mood.py "Jag orkar inte mer, allt känns hopplöst"
# Expected: {"ok":true,"level":"red","score":0.9...}
```

**B. Via UI**
1. Open `/dashboard` 
2. Navigate to "Micro-Mood Live"
3. Run 3-5 analyses on `/analyze`
4. Click 🔄 refresh
5. Verify events counter increases

**C. API Check**
```bash
curl https://<your-domain>/api/emotion/summary
# Expected: JSON with p95_latency_ms, red_rate, sv_en_gap
```

**D. Check Logs**
```bash
tail -f reports/emotion_events/$(date +%Y-%m-%d).jsonl
# Should show events as users analyze
```

### 7. Set Alerts

Monitor these metrics:
- RED-FP > 0.05 (2 consecutive runs)
- Gap ≥ 0.02 (2 consecutive runs)  
- Accuracy < 0.52 (2 consecutive runs)

### 8. Rollback Plan

If issues occur:
```bash
# Quick rollback
git checkout 2025-11-02-emotion-core
git push origin main --force

# Or tag previous working version
git tag rollback-emotion-YYYY-MM-DD
```

## ✅ Expected Results

| Test | Expected |
|------|----------|
| Python direct | Returns JSON with ok:true |
| UI refresh | Events counter increases |
| API summary | JSON with latency/metrics |
| Log file | Grows with new events |
| RED detection | Flagged as red (score 0.9) |
| Neutral detection | Flagged as neutral (score 0.45) |

## 🚨 Common Issues

**Issue:** Python not found in production  
**Fix:** Install Python 3.8+ or use Docker with Python base image

**Issue:** Reports directory not writable  
**Fix:** `chmod 755 reports` and `chmod 755 reports/emotion_events`

**Issue:** Different results than expected  
**Fix:** Check ENV vars are set (especially CALIBRATION_MODE=false)

**Issue:** Aggregator not updating dashboard  
**Fix:** Run `agg_emotion_events.mjs` manually, check cron job

**Issue:** Vercel frontend can't call Python  
**Fix:** Must run backend on Railway/VM/Docker (not Vercel)

## 📞 Support

If issues persist:
1. Check logs: `reports/emotion_events/*.jsonl`
2. Run golden eval: `node sintari-relations/scripts/emotion_golden_eval.mjs`
3. Compare to baseline: See `EMOTION_CORE_STATUS.md`

---

**You're ready! Deploy and monitor. 🚀**

