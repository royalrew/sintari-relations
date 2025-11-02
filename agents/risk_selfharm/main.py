import json
import sys


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        _ = payload.get("data", {}).get("description") or ""

        emits = {
            "selfharm_flag": False,
            "selfharm_risk": "LOW",
        }

        out = {
            "ok": True,
            "version": "risk_selfharm@0.1.0",
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


