#!/usr/bin/env python3
"""Rotate reports/worldclass_live.jsonl when size exceeds threshold."""
import argparse
import gzip
import json
import os
import shutil
import time

ap = argparse.ArgumentParser()
ap.add_argument("--file", default="reports/worldclass_live.jsonl")
ap.add_argument("--max-mb", type=int, default=50)
args = ap.parse_args()

path = args.file
summary = {
    "file": path,
    "max_mb": args.max_mb,
    "timestamp": int(time.time()),
}

if not os.path.exists(path):
    summary.update({"exists": False, "action": "skip", "reason": "missing"})
    print(json.dumps(summary))
    raise SystemExit(0)

size_bytes = os.path.getsize(path)
size_mb = size_bytes / (1024 * 1024)
summary.update({
    "exists": True,
    "size_mb_before": round(size_mb, 3),
})

if size_mb < args.max_mb:
    summary.update({
        "action": "skip",
        "reason": "below_threshold",
    })
    print(json.dumps(summary))
    raise SystemExit(0)

stamp = time.strftime("%Y%m%d-%H%M%S")
rotated = f"{path}.{stamp}.gz"
os.makedirs(os.path.dirname(rotated), exist_ok=True)

with open(path, "rb") as src, gzip.open(rotated, "wb") as dst:
    shutil.copyfileobj(src, dst)

open(path, "w").close()
summary.update({
    "action": "rotated",
    "rotated_path": rotated,
    "size_mb_after": 0.0,
})
print(json.dumps(summary))
