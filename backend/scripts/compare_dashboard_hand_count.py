"""Compare GET /api/dashboard metrics to hand rules on live API."""
from __future__ import annotations

import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def get(path: str) -> dict | list:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    dash = get("/api/dashboard")
    listed = get("/api/formulas?page=1&pageSize=1000")
    items = listed["items"]
    hand_total = listed["total"]
    hand_awaiting = sum(1 for i in items if i.get("reviewStatus") == "awaiting-review")
    hand_gaps = sum(1 for i in items if (i.get("missingEvidenceCount") or 0) > 0)
    hand_status = {"green": 0, "amber": 0, "red": 0, "not-screened": 0}
    for i in items:
        s = i.get("screeningStatus") or "not-screened"
        hand_status[s] = hand_status.get(s, 0) + 1
    hand_changed = sum(1 for i in items if not i.get("screeningCurrent"))

    metrics = {m["key"]: m["value"] for m in dash["metrics"]}
    print("api", json.dumps(metrics))
    print("hand_total", hand_total)
    print("hand_awaiting", hand_awaiting)
    print("hand_gaps", hand_gaps)
    print("hand_status", hand_status)
    print("hand_outdated", hand_changed)


if __name__ == "__main__":
    main()
