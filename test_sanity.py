#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import subprocess
import sys
import io

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

tests = [
    {"text": "Jag är trött men hoppfull; ett steg i taget.", "lang": "sv", "expected": "plus"},
    {"text": "I don't want to go on; no way out.", "lang": "en", "expected": "red"},
]

for test in tests:
    request = json.dumps({
        "agent": "micro_mood",
        "text": test["text"],
        "lang": test["lang"],
        "trace_id": "sanity"
    })
    
    result = subprocess.run(
        [sys.executable, "agents/emotion/micro_mood.py"],
        input=request,
        capture_output=True,
        text=True,
        timeout=5
    )
    
    if result.returncode == 0:
        try:
            resp = json.loads(result.stdout.strip().split('\n')[-1])
            level = resp.get("level", "unknown")
            status = "[OK]" if level == test["expected"] else "[FAIL]"
            print(f"{status} Text: {test['text'][:50]}...")
            print(f"   Expected: {test['expected']}, Got: {level}")
        except Exception as e:
            print(f"[ERROR] Parse error: {e}")
    else:
        print(f"[ERROR] Error: {result.stderr[:200]}")

