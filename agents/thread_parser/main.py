import json
import sys


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        description = payload.get("data", {}).get("description") or ""

        # Minimal placeholder: create a single-message thread if text exists
        thread = []
        if description:
            thread.append({"speaker": "UNKNOWN", "text": description, "ts": 0})

        emits = {
            "thread": thread,
            "thread_ok": bool(thread),
        }

        out = {
            "ok": True,
            "version": "thread_parser@0.1.0",
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


