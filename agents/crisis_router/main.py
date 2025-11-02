import json
import sys


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        text = (
            payload.get("data", {}).get("description")
            or payload.get("data", {}).get("shared_text")
            or ""
        )

        # Minimal heuristic placeholder: route only if explicitly flagged RED upstream
        crisis_plan = {
            "status": "OK",
            "actions": [],
            "resources": [],
        }

        emits = {
            "crisis_required": False,
            "crisis_plan": crisis_plan,
        }

        out = {
            "ok": True,
            "version": "crisis_router@0.1.0",
            "emits": emits,
            "checks": {},
            "latency_ms": 0,
            "cost": {"usd": 0},
        }
        print(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        err = {"ok": False, "error": str(e)}
        print(json.dumps(err, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()


