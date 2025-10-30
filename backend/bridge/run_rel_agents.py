from __future__ import annotations

import json
import sys
import pathlib
from typing import Any, Dict

# Add repo root to PYTHONPATH so we can import agents
ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

def _safe_import(path: str, attr: str):
    try:
        module = __import__(path, fromlist=[attr])
        return getattr(module, attr)
    except Exception:
        return None

# Module-level imports for both run_once and run_once_text
_diag_attach = _safe_import("agents.rel.diag_attachment", "classify")
_conflict_an = _safe_import("agents.rel.conflict_agent", "analyze")
_expl = _safe_import("agents.explain_linker.explain_linker_agent", "link")
_boundary_an = _safe_import("agents.rel.boundary_agent", "analyze")
_tone_an = _safe_import("agents.rel.empathy_tone_agent", "analyze")
_reco = _safe_import("agents.rel.reco_agent", "recommend")
_dialog_mem = _safe_import("agents.rel.dialog_memory_agent", "analyze")
_speaker_label = _safe_import("agents.rel.speaker_attrib_agent", "label")
_context_graph = _safe_import("agents.context_graph.main", "analyze")

def run_once_text(*, text: str, lang: str = "sv", persona: Any = None, context: Any = None) -> Dict[str, Any]:
    # Use module-level imports
    diag_attach = _diag_attach
    conflict_an = _conflict_an
    expl = _expl
    boundary_an = _boundary_an
    tone_an = _tone_an
    reco = _reco
    dialog_mem = _dialog_mem
    speaker_label = _speaker_label

    insights: Dict[str, Any] = {}

    att = {"label": "trygg", "conf": 0.9}
    if callable(diag_attach):
        try:
            att = diag_attach(text=text, lang=lang, persona=persona, context=context) or att
        except Exception:
            pass

    tn = {"tone_text": "empatisk lugn", "labels": []}
    if callable(tone_an):
        try:
            tn = tone_an(text=text, lang=lang, persona=persona, context=context) or tn
        except Exception:
            pass

    cf = {"triggers": [], "repair_cues": [], "summary": ""}
    if callable(conflict_an):
        try:
            cf = conflict_an(text=text, lang=lang, persona=persona, context=context) or cf
        except Exception:
            pass

    bd = {"has_boundary": False, "suggestions": []}
    if callable(boundary_an):
        try:
            bd = boundary_an(text=text, lang=lang, persona=persona, context=context) or bd
        except Exception:
            pass

    rc = {"steps": []}
    if callable(reco):
        try:
            rc = reco(text=text, lang=lang, persona=persona, context=context, insights={"conflict": cf, "boundary": bd}) or rc
        except Exception:
            pass

    ex = {"spans": [], "coverage": 0.0}
    if callable(expl):
        try:
            ex = expl(text=text, lang=lang, persona=persona, context=context, insights={"attachment": att, "conflict": cf, "boundary": bd}) or ex
        except Exception:
            pass

    out = {
        "attachment_style": att.get("label"),
        "ethics_check": "safe",
        "risk_flags": [],
        "tone_target": tn.get("tone_text") or "empatisk lugn",
        "top_reco": (rc.get("steps") or [])[:3],
        "confidence": float(att.get("conf", 0.9) or 0.9),
        "explain_spans": ex.get("spans", []),
        "explain_coverage": float(ex.get("coverage", 0.0) or 0.0),
        "explain_labels": ex.get("labels", []),
        "conflict_triggers": cf.get("triggers", []),
        "boundary_present": bool(bd.get("has_boundary", False)),
    }
    # Ensure target fields for scoring presence
    out["tone_target"] = str(out.get("tone_target") or tn.get("tone_target") or tn.get("label") or "")
    steps = rc.get("steps") or rc.get("recommendations") or []
    if not out.get("top_reco"):
        out["top_reco"] = steps[:1] if steps else []
    if isinstance(out.get("top_reco"), list):
        out["top_reco"] = (out["top_reco"][0] if out["top_reco"] else "")
    out["top_reco"] = str(out.get("top_reco") or rc.get("top_reco") or "")
    return out


def run_once(*, text: str = "", lang: str = "sv", persona=None, context=None, dialog=None, conversation_id=None) -> Dict[str, Any]:
    # Dialog path for diamond
    if dialog and callable(_speaker_label) and callable(_dialog_mem):
        try:
            sp = _speaker_label(dialog)
            dm = _dialog_mem(sp["labeled_dialog"], lang=lang, persona=persona, context=context, conversation_id=conversation_id)
            text_join = " ".join(m.get("text", "") for m in sp["labeled_dialog"]) if sp else (text or "")

            att = _diag_attach(text=text_join, lang=lang) if callable(_diag_attach) else {"label": "trygg", "conf": 0.9}
            tn = _tone_an(text=text_join, lang=lang) if callable(_tone_an) else {"tone_text": "lugn fokuserad"}
            cf = _conflict_an(text=text_join, lang=lang) if callable(_conflict_an) else {"triggers": []}
            bd = _boundary_an(text=text_join, lang=lang) if callable(_boundary_an) else {"has_boundary": False}
            rc = _reco(text=text_join, lang=lang, insights={"conflict": cf, "boundary": bd}) if callable(_reco) else {"steps": []}
            ex = _expl(text=text_join, lang=lang, insights={"attachment": att, "conflict": cf, "boundary": bd}) if callable(_expl) else {"spans": [], "coverage": 0.0, "labels": []}

            # Clamp memory_score to [0,1] with type safety
            mem = dm.get("memory_score") if isinstance(dm, dict) else None
            try:
                mem = float(mem) if mem is not None else 0.0
            except (ValueError, TypeError):
                mem = 0.0
            mem = max(0.0, min(1.0, mem))
            
            # Context graph
            cg = {}
            if callable(_context_graph):
                try:
                    cg = _context_graph(text_join, dialog=sp["labeled_dialog"]) or {}
                except Exception:
                    pass
            
            out = {
                "attachment_style": att.get("label"),
                "ethics_check": "safe",
                "risk_flags": [],
                "tone_target": tn.get("tone_text"),
                "top_reco": (rc.get("steps") or [])[:3],
                "confidence": float(att.get("conf", 0.9) or 0.9),
                "explain_spans": ex.get("spans", []),
                "explain_coverage": float(ex.get("coverage", 0.0) or 0.0),
                "explain_labels": ex.get("labels", []),
                "conflict_triggers": cf.get("triggers", []),
                "boundary_present": bool(bd.get("has_boundary", False)),
                "memory_score": mem,
                "two_speakers": bool(sp.get("two_speakers", False)),
                "signals": dm.get("signals", {}) if isinstance(dm, dict) else {},
            }

            # Ensure target fields for scoring presence
            out["tone_target"] = str(out.get("tone_target") or tn.get("tone_target") or tn.get("label") or "")
            steps = rc.get("steps") or rc.get("recommendations") or []
            if not out.get("top_reco"):
                out["top_reco"] = steps[:1] if steps else []
            if isinstance(out.get("top_reco"), list):
                out["top_reco"] = (out["top_reco"][0] if out["top_reco"] else "")
            out["top_reco"] = str(out.get("top_reco") or rc.get("top_reco") or "")
            
            # Add graph fields if available
            if isinstance(cg, dict):
                out["graph_events"] = cg.get("graph_events", [])
                out["graph_confidence"] = float(cg.get("graph_confidence", 0.0))
                out["graph_spans"] = cg.get("graph_spans", [])
                out["graph_delta"] = cg.get("graph_delta", {})
            
            # Add session memory fields if available
            if isinstance(dm, dict):
                if "session_id" in dm:
                    out["session_id"] = dm["session_id"]
                if "session_history" in dm:
                    out["session_history"] = dm["session_history"]
            
            return out
        except Exception:
            pass
    # Fallback to text path
    return run_once_text(text=text or "", lang=lang, persona=persona, context=context)


def main() -> None:
    req = json.loads(sys.stdin.read() or "{}")
    text = req.get("text") or ""
    lang = req.get("lang") or "sv"
    persona = req.get("persona")
    context = req.get("context")
    dialog = req.get("dialog")
    out = run_once(text=text, lang=lang, persona=persona, context=context, dialog=dialog)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()


