#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import subprocess
import sys

test_cases = [
    {"text": "Jag är trött men hoppfull; ett steg i taget.", "lang": "sv", "expected": "plus"},
    {"text": "I don't want to go on; no way out.", "lang": "en", "expected": "red"},
]

for case in test_cases:
    request = json.dumps({
        "agent": "micro_mood",
        "text": case["text"],
        "lang": case["lang"],
        "trace_id": "test"
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
            print(f"Text: {case['text'][:50]}...")
            print(f"  Expected: {case['expected']}, Got: {level}")
            print(f"  {'✅' if level == case['expected'] else '❌'}\n")
        except Exception as e:
            print(f"Parse error: {e}")
            print(f"Output: {result.stdout[-200:]}")
    else:
        print(f"Error: {result.stderr}")

