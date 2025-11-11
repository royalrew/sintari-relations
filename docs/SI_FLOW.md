# Self-Improvement (SI) Flow

## Steg 1 – Shadow Run
- Workflow: `.github/workflows/si_nightly.yml`
- Kör 50 fall (shadow) varje natt → `reports/si/nightly_YYYY-MM-DD.jsonl`
- Loggar KPIs till `reports/worldclass_live.jsonl`
- Admin-knapp: **Starta Self-Learning (Shadow 50)** (`/api/admin/si-start`)

## Steg 2 – Auto-PR av förslag
- Nightly genererar `reports/si/forlag_YYYY-MM-DD.json`
- `scripts/si/apply_si_proposals.mjs` läser filen, patchar JSON-konfig och öppnar PR
- Workflow: `.github/workflows/si_propose.yml` (manuell + beroende på Step 1)
- Admin-knapp: **Öppna PR av förslag (SI)** (`/api/admin/si-apply`)
- Tasks kräver `GH_TOKEN` med repo-rättigheter

### Kör manuellt
```bash
# Dry-run (ingen ändring)
node scripts/si/apply_si_proposals.mjs --in reports/si/forlag_dev.json --dry 1

# Skarpt (lokalt)
GH_TOKEN=... node scripts/si/apply_si_proposals.mjs --in reports/si/forlag_dev.json

# GitHub Actions
gh workflow run "SI Apply Proposals"
```

## Steg 3 – Canary rollout (kommande)
- Aktivera 5–10% canary via env/tenant flaggor
- Automatisk rollback vid regression
- Kommer efter att steg 2 är stabilt
