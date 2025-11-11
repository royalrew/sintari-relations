#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test missed plus cases manually with debug"""
import json
import subprocess
import sys
import os
import io

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Set ENV vars for debug
os.environ["CALIBRATION_MODE"] = "true"
os.environ["DEBUG_EMO"] = "1"
os.environ["Z_RED"] = "1.05"
os.environ["Z_PLUS"] = "0.80"
os.environ["Z_LIGHT"] = "0.45"

test_cases = [
    {"text": "Jag är trött men hoppfull; ett litet steg i taget räcker idag.", "lang": "sv", "expected": "plus"},
    {"text": "I'm tired but okay—one tiny win is still a win.", "lang": "en", "expected": "plus"},
    {"text": "Jag vågade be om hjälp—känns faktiskt lite lättare nu.", "lang": "sv", "expected": "plus"},
    {"text": "I asked for support and felt heard; that helps.", "lang": "en", "expected": "plus"},
    {"text": "Grateful for small steps; it's not perfect, but it's progress.", "lang": "en", "expected": "plus"},
]

script_path = "agents/emotion/micro_mood.py"

print("=" * 80)
print("Testing missed PLUS cases with DEBUG enabled")
print("=" * 80)
print()

for i, case in enumerate(test_cases, 1):
    request = json.dumps({
        "agent": "micro_mood",
        "text": case["text"],
        "lang": case["lang"],
        "trace_id": f"test_{i}"
    })
    
    print(f"\n{'='*80}")
    print(f"Test {i}: {case['text'][:60]}...")
    print(f"Expected: {case['expected']}")
    print("-" * 80)
    
    result = subprocess.run(
        [sys.executable, script_path],
        input=request,
        capture_output=True,
        text=True,
        env=os.environ
    )
    
    if result.returncode == 0:
        try:
            resp = json.loads(result.stdout.strip().split('\n')[-1])
            print(f"\n[OK] Result: level={resp.get('level', 'unknown')}, score={resp.get('score', 0):.3f}")
            
            # Show debug output
            if result.stderr:
                print("\n[DEBUG OUTPUT]")
                for line in result.stderr.strip().split('\n'):
                    if line.startswith('[DEBUG]') or line.startswith('{"'):
                        print(f"  {line}")
        except Exception as e:
            print(f"[ERROR] Parse error: {e}")
            print(f"stdout: {result.stdout[-200:]}")
    else:
        print(f"❌ Error: {result.stderr}")
    
    print()

