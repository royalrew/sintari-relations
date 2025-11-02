import json
import sys


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        description = payload.get("data", {}).get("description") or ""

        # Minimal placeholder: assign single utterance alternately to P1
        labeled_thread = []
        if description:
            labeled_thread.append({"speaker": "P1", "text": description, "ts": 0})

        emits = {
            "labeled_thread": labeled_thread,
            "speaker_confidence": 1.0 if labeled_thread else 0.0,
        }

        out = {
            "ok": True,
            "version": "speaker_attrib@0.1.0",
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


