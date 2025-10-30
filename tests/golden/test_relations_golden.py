import json, pathlib, sys, importlib.util, hashlib
import os, time

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "runs" / "cache"

def _load(name, rel_path):
    p = ROOT / rel_path
    spec = importlib.util.spec_from_file_location(name, str(p))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)  # type: ignore
    return m

_bridge = _load("orchestrator_bridge", "tests/_helpers/orchestrator_bridge.py")
_scoring = _load("scoring_relations", "tests/_helpers/scoring_relations.py")
orchestrator_analyze = _bridge.orchestrator_analyze
total_score = _scoring.total_score
evaluate_case = _scoring.evaluate_case
compute_cache_version = _scoring.compute_cache_version

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEVELS = ["bronze", "silver", "gold", "platinum", "diamond"]
FILENAMES = ["seed.jsonl", "more.jsonl", "edge.jsonl", "edge3.jsonl", "edge4.jsonl"]

THRESH = {
    "bronze":   {"total": 0.95, "tone": 0.85, "reco": 0.85, "expl": 0.00},
    "silver":   {"total": 0.92, "tone": 0.85, "reco": 0.85, "expl": 0.80},
    "gold":     {"total": 0.90, "tone": 0.85, "reco": 0.85, "expl": 0.90},
    "platinum": {"total": 0.91, "tone": 0.86, "reco": 0.86, "expl": 0.92},
    "diamond":  {"total": 0.92, "tone": 0.87, "reco": 0.87, "expl": 0.94},
}

# Bump thresholds (CI gate) per request
THRESH.update({
    "silver":   {"total": 0.93, "tone": 0.85, "reco": 0.85, "expl": 0.80},
    "gold":     {"total": 0.91, "tone": 0.85, "reco": 0.85, "expl": 0.90},
    "platinum": {"total": 0.92, "tone": 0.86, "reco": 0.86, "expl": 0.92},
    "diamond":  {"total": 0.93, "tone": 0.87, "reco": 0.87, "expl": 0.94},
})

# Optional central thresholds file
try:
    import json as _json
    _cfg_path = ROOT / "tests/_helpers/thresholds.json"
    if _cfg_path.exists():
        THRESH.update(_json.loads(_cfg_path.read_text(encoding="utf-8")))
except Exception:
    pass


def _iter_cases():
    # Read golden relations from repository-level tests directory
    base = ROOT.parent / "tests" / "golden" / "relations"
    for lvl in LEVELS:
        for fname in FILENAMES:
            p = base / lvl / fname
            if not p.exists():
                continue
            for line in p.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                yield lvl, obj


def _pull_text(inp: dict) -> tuple[str, str]:
    lang = inp.get("lang", "sv")
    if "dialog" in inp:
        text = " ".join(m.get("text", "") for m in inp["dialog"])
    else:
        text = inp["text"]
    return lang, text


def test_golden_levels_end_to_end():
    for lvl, case in _iter_cases():
        lang, text = _pull_text(case["input"])
        expected = case["expected"]
        dialog = case["input"].get("dialog")

        pred = orchestrator_analyze(text=text, lang=lang, dialog=dialog)

        # Single source of truth: evaluate and assert
        eval_res = evaluate_case(pred, expected, lvl, THRESH)

        # Dumpa debug endast vid fail (eller om DEBUG_REL=1)
        need_debug = (not eval_res["passed"]) or os.getenv("DEBUG_REL") == "1"
        if need_debug:
            DBG_DIR = CACHE / "debug"
            DBG_DIR.mkdir(parents=True, exist_ok=True)

            # kort textprov för snabbare läsning i Cursor
            _, input_text = _pull_text(case["input"])
            input_text = (input_text or "")[:2000]

            dbg = {
                "ts": time.time(),
                "level": lvl,
                "id": case["id"],
                "input_text": input_text,
                "pred": {
                    "tone_target": pred.get("tone_target"),
                    "tone": pred.get("tone"),
                    "top_reco": pred.get("top_reco"),
                    "recommendation": pred.get("recommendation"),
                    "tone_sim": pred.get("tone_sim"),
                    "tone_sim_cal": pred.get("tone_sim_cal"),
                    "reco_sim": pred.get("reco_sim"),
                    "reco_sim_cal": pred.get("reco_sim_cal"),
                    "confidence": pred.get("confidence"),
                    "risk_flags": pred.get("risk_flags"),
                    "attachment_style": pred.get("attachment_style"),
                    "ethics_check": pred.get("ethics_check"),
                },
                "expected": {
                    "tone_target": expected.get("tone_target") or expected.get("tone"),
                    "top_reco": expected.get("top_reco") or expected.get("recommendation"),
                    "risk_flags": expected.get("risk_flags"),
                    "attachment_style": expected.get("attachment_style"),
                    "ethics_check": expected.get("ethics_check"),
                },
                "eval": eval_res,
                "thresholds": THRESH.get(lvl, {}),
            }

            fpath = DBG_DIR / f"{lvl}_{case['id']}.json"
            fpath.write_text(json.dumps(dbg, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[REL-DEBUG] Wrote {fpath} total={eval_res['total']:.3f} need={THRESH[lvl]['total']}")

        # Assert sist (så debug skrivs ut före fail)
        assert eval_res["passed"], f"{lvl}:{case['id']} total={eval_res['total']:.3f} (need {THRESH[lvl]['total']})"

        # Dump cache med eval för summary (absolut path under sintari-relations)
        CACHE.mkdir(parents=True, exist_ok=True)
        cid = case['id']
        key = hashlib.sha256(f"{lvl}:{cid}".encode()).hexdigest()[:16]
        ver = compute_cache_version(THRESH)
        (CACHE / f"{ver}_{lvl}_{key}.json").write_text(
            json.dumps({
                "level": lvl,
                "id": cid,
                "pred": pred,
                "expected": expected,
                "eval": eval_res,
            }, ensure_ascii=False),
            encoding="utf-8",
        )
