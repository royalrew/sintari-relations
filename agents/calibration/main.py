#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CalibrationAgent - Förbättrad drift-detektering och skalstabilitet
Detekterar och korrigerar drift i agent-resultat över tid.

Förbättringar:
- Mer robust drift-detektering
- Bättre skalstabilitet
- Integration med golden tests
- Statistik över tid
"""
import sys, json, time, argparse
from typing import Any, Dict, List, Optional
from collections import defaultdict

AGENT_VERSION = "1.1.0"
AGENT_ID = "calibration"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="CalibrationAgent – drift-detektering och skalstabilitet.")
    p.add_argument("--payload", type=str, default=None)
    p.add_argument("--window-size", type=int, default=None, help="Fönsterstorlek för drift-detektering")
    p.add_argument("--threshold", type=float, default=None, help="Tröskel för drift-detektering")
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def nb_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

# -------------------- Drift-detektering -------------------- #
def calculate_statistics(values: List[float]) -> Dict[str, float]:
    """Beräknar statistiska mått."""
    if not values:
        return {"mean": 0.0, "std": 0.0, "min": 0.0, "max": 0.0, "median": 0.0}
    
    sorted_vals = sorted(values)
    n = len(values)
    mean = sum(values) / n
    
    # Standardavvikelse
    variance = sum((x - mean) ** 2 for x in values) / n
    std = variance ** 0.5
    
    # Median
    median = sorted_vals[n // 2] if n % 2 == 1 else (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    
    return {
        "mean": round(mean, 3),
        "std": round(std, 3),
        "min": round(min(values), 3),
        "max": round(max(values), 3),
        "median": round(median, 3)
    }

def detect_drift(
    current_values: List[float],
    historical_values: List[float],
    window_size: int = 20,
    threshold: float = 0.15
) -> Dict[str, Any]:
    """Detekterar drift genom att jämföra nuvarande värden med historiska."""
    
    if not current_values or not historical_values:
        return {
            "drift_detected": False,
            "drift_magnitude": 0.0,
            "drift_direction": "none",
            "confidence": 0.0
        }
    
    # Beräkna statistiker
    current_stats = calculate_statistics(current_values)
    historical_stats = calculate_statistics(historical_values[-window_size:])
    
    # Jämför medelvärden
    mean_diff = abs(current_stats["mean"] - historical_stats["mean"])
    drift_detected = mean_diff > threshold
    
    # Bestäm riktning
    drift_direction = "none"
    if drift_detected:
        if current_stats["mean"] > historical_stats["mean"]:
            drift_direction = "up"
        else:
            drift_direction = "down"
    
    # Confidence baserat på storlek av skillnad och antal värden
    confidence = min(1.0, mean_diff / threshold)
    if len(current_values) < 5:
        confidence *= 0.7  # Lägre confidence med få värden
    
    return {
        "drift_detected": drift_detected,
        "drift_magnitude": round(mean_diff, 3),
        "drift_direction": drift_direction,
        "confidence": round(confidence, 2),
        "current_stats": current_stats,
        "historical_stats": historical_stats
    }

def normalize_scores(scores: Dict[str, float], target_mean: float = 0.5, target_std: float = 0.2) -> Dict[str, float]:
    """Normaliserar scores för skalstabilitet."""
    if not scores:
        return scores
    
    values = list(scores.values())
    if not values:
        return scores
    
    current_stats = calculate_statistics(values)
    
    # Om standardavvikelsen är för hög eller låg, justera
    if current_stats["std"] > target_std * 2 or current_stats["std"] < target_std * 0.5:
        # Normalisera till target_mean och target_std
        normalized = {}
        for key, value in scores.items():
            # Z-score normalisering
            z_score = (value - current_stats["mean"]) / max(current_stats["std"], 0.001)
            normalized_value = target_mean + z_score * target_std
            normalized[key] = max(0.0, min(1.0, normalized_value))  # Clamp till [0, 1]
        return normalized
    
    return scores

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    
    # Hämta input
    current_scores = data.get("current_scores", {}) or {}
    historical_scores = data.get("historical_scores", []) or []
    golden_tests = data.get("golden_tests", []) or []
    
    # Konfiguration
    window_size = meta.get("window_size", 20)
    threshold = meta.get("threshold", 0.15)
    
    # Konvertera scores till listor för analys
    current_values = [v for v in current_scores.values() if isinstance(v, (int, float))]
    historical_values = []
    
    # Samla historiska värden från tidigare körningar
    for hist_entry in historical_scores:
        if isinstance(hist_entry, dict):
            hist_values = [v for v in hist_entry.get("scores", {}).values() if isinstance(v, (int, float))]
            historical_values.extend(hist_values)
        elif isinstance(hist_entry, list):
            historical_values.extend([v for v in hist_entry if isinstance(v, (int, float))])
    
    # Detektera drift
    drift_result = detect_drift(current_values, historical_values, window_size, threshold)
    
    # Normalisera scores för skalstabilitet
    normalized_scores = normalize_scores(current_scores)
    
    # Jämför med golden tests om de finns
    golden_comparison = {}
    if golden_tests:
        golden_scores = []
        for test in golden_tests:
            if isinstance(test, dict) and "expected_score" in test:
                golden_scores.append(test["expected_score"])
        
        if golden_scores:
            golden_mean = sum(golden_scores) / len(golden_scores)
            current_mean = calculate_statistics(current_values)["mean"]
            deviation = abs(current_mean - golden_mean)
            
            golden_comparison = {
                "golden_mean": round(golden_mean, 3),
                "current_mean": round(current_mean, 3),
                "deviation": round(deviation, 3),
                "within_tolerance": deviation < threshold
            }
    
    # Skapa kalibreringsrekommendationer
    recommendations = []
    if drift_result["drift_detected"]:
        recommendations.append(
            f"Drift detekterad ({drift_result['drift_direction']}): "
            f"justera trösklar eller omträna modeller."
        )
    
    if normalized_scores != current_scores:
        recommendations.append("Scores normaliserade för skalstabilitet.")
    
    if golden_comparison and not golden_comparison.get("within_tolerance", True):
        recommendations.append(
            f"Avvikelse från golden tests: {golden_comparison['deviation']:.3f}. "
            f"Överväg omträning eller justering."
        )
    
    emits = {
        "drift_detection": drift_result,
        "normalized_scores": normalized_scores,
        "original_scores": current_scores,
        "golden_comparison": golden_comparison,
        "recommendations": recommendations,
        "calibration_status": "ok" if not drift_result["drift_detected"] else "drift_detected"
    }
    
    checks = {
        "CHK-CALIBRATION-01": {
            "pass": not drift_result["drift_detected"],
            "reason": ("Ingen drift detekterad" if not drift_result["drift_detected"] else "Drift detekterad")
        },
        "CHK-CALIBRATION-02": {
            "pass": len(current_values) >= 5,
            "reason": f"{len(current_values)} värden analyserade"
        }
    }
    
    return {"ok": True, "emits": emits, "checks": checks}

# -------------------- Main -------------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        meta = payload.get("meta", {}) or {}
        
        # Överstyr från CLI
        if args.window_size:
            meta["window_size"] = args.window_size
        if args.threshold:
            meta["threshold"] = args.threshold
        
        res = run(payload, meta)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.001}
        
        if args.explain_verbose or meta.get("explain_verbose", False):
            res["rationales"] = [{
                "cue": "calibration",
                "detail": {
                    "drift_detected": res["emits"]["drift_detection"]["drift_detected"],
                    "drift_magnitude": res["emits"]["drift_detection"]["drift_magnitude"],
                    "calibration_status": res["emits"]["calibration_status"]
                }
            }]
        
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
