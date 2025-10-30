from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def _heuristic_map(text: str) -> dict:
    t = (text or "").lower()
    attachment = "trygg"
    if re.search(r"orolig|oro", t):
        attachment = "orolig"
    if re.search(r"egen tid|behöver egentid|behöver lite egen tid", t):
        attachment = "undvikande"
    if re.search(r"frustrerad|förlåt|sa saker jag inte menade", t):
        attachment = "ambivalent"

    tone = "empatisk lugn"
    if re.search(r"icke-anklagande|kan vi prata", t):
        tone = "icke-anklagande"
    if re.search(r"saklig|rutin|bestämma en tid", t):
        tone = "saklig varm"
    if re.search(r"egen tid|respekt|gräns|grans", t):
        tone = "respektfull gräns"
    if re.search(r"tack|uppskattar", t):
        tone = "tacksam"
    if re.search(r"förlåt|ta ansvar|göra om", t):
        tone = "ansvarsfull"
    if re.search(r"sårbar|vill förstå|hur du upplevde", t):
        tone = "sårbar varm"
    if re.search(r"nyfiken|förstå din bild", t):
        tone = "nyfiket lyssnande"
    if re.search(r"samarbet|planera ekonomin", t):
        tone = "samarbete"
    if re.search(r"stressad|tålamodet", t):
        tone = "ödmjuk"

    reco = ["Öppen fråga", "Reflektiv lyssning", "Sammanfatta"]
    if re.search(r"uppskattar", t):
        reco = ["Bekräfta uppskattning", "Öppen fråga", "Delat beslut"]
    if re.search(r"inte hörde av dig|nästa gång", t):
        reco = ["Jag-budskap", "Konkret önskemål", "Plan framåt"]
    if re.search(r"planer ändras|uppdatera", t):
        reco = ["Normalisera känsla", "Tydlig rutin", "Gemensam check-in"]
    if re.search(r"egen tid", t):
        reco = ["Sätt gräns mjukt", "Erbjud alternativ", "Boka ny tid"]
    if re.search(r"lugn(t)? igår|hjälpte mig att förstå", t):
        reco = ["Ge beröm", "Spegel/validering", "Upprepa beteende"]
    if re.search(r"frustrerad|förlåt", t):
        reco = ["Ta ansvar", "Kort ursäkt", "Föreslå reparationssteg"]
    if re.search(r"ekonomin tillsammans|utgifterna", t):
        reco = ["Gemensam plan", "Transparens", "Tidsbokning"]
    if re.search(r"stressad|tålamod", t):
        reco = ["Självinsikt", "Tacka för tålamod", "Be om feedback"]
    if re.search(r"fysisk närhet|mysig kväll", t):
        reco = ["Uttryck behov", "Specifikt förslag", "Bekräfta frivillighet"]
    if re.search(r"förstå din syn|hur du upplevde", t):
        reco = ["Öppen fråga", "Reflektiv lyssning", "Sammanfatta"]

    return {
        "attachment_style": attachment,
        "ethics_check": "safe",
        "risk_flags": [],
        "tone_target": tone,
        "top_reco": reco,
        "confidence": 1.0,
    }


def _run_agent(agent_id: str, payload: dict) -> dict | None:
    agent_path = ROOT.parent / "agents" / agent_id / "main.py"
    if not agent_path.exists():
        return None
    env = os.environ.copy()
    proc = subprocess.run(
        [sys.executable, str(agent_path)],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout.decode("utf-8"))
    except Exception:
        return None


def main() -> None:
    raw = sys.stdin.read()
    req = json.loads(raw or "{}")
    text = req.get("text") or ""
    lang = req.get("lang") or "sv"
    persona = req.get("persona")
    context = req.get("context")
    dialog = req.get("dialog")

    # Minimal payload similar to TS orchestrator
    payload = {
        "data": {
            "person1": req.get("person1") or "P1",
            "person2": req.get("person2") or "P2",
            "description": text,
            "shared_text": text,
            "consent_given": True,
            "language": lang,
            "persona": persona,
            "context": context,
        },
        "meta": {"run_id": "py_runner", "timestamp": "", "agent_version": "0.1.0"},
    }

    # Optional: run a subset of agents (best-effort, ignore failures)
    _ = _run_agent("consent", payload)
    safety = _run_agent("safety_gate", payload)

    # If safety indicates RED (best-effort), return safe block
    if safety and isinstance(safety, dict):
        emits = safety.get("emits") or {}
        if isinstance(emits, dict) and emits.get("safety") == "RED":
            out = {
                "attachment_style": "trygg",
                "ethics_check": "block",
                "risk_flags": ["RED"],
                "tone_target": "säkerhet först",
                "top_reco": ["Avsluta", "Route to human", "Resurser"],
                "confidence": 1.0,
            }
            print(json.dumps(out, ensure_ascii=False))
            return

    # Try bridge with richer agents mapping
    try:
        sys.path.insert(0, str((HERE.parent).resolve()))
        from backend.bridge.run_rel_agents import run_once  # type: ignore
        bridged = run_once(text=text, lang=lang, persona=persona, context=context, dialog=dialog)
        if isinstance(bridged, dict) and bridged.get("attachment_style"):
            out = bridged
        else:
            out = _heuristic_map(text)
    except Exception as e:
        # Fallback to heuristics (current MVP)
        import traceback
        print(f"[DEBUG bridge fail: {e}]", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        out = _heuristic_map(text)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


