import json
import os
from datetime import datetime


def main() -> None:
    counts = {
        "bronze": 0,
        "silver": 0,
        "gold": 0,
        "platinum": 0,
        "diamond": 0,
    }
    out_dir = os.path.join("reports")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "case_counts.json")
    payload = {
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "counts": counts,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(path)


if __name__ == "__main__":
    main()


