"""Hand-count Overview metrics from formulas.json + assessment_runs.json."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def main() -> None:
    formulas = json.loads((DATA / "formulas.json").read_text(encoding="utf-8-sig"))
    runs_doc = json.loads((DATA / "assessment_runs.json").read_text(encoding="utf-8-sig"))
    runs = runs_doc.get("runs") or []

    total = len(formulas)
    awaiting = sum(1 for f in formulas if f.get("reviewStatus") == "awaiting-review")
    missing_ev = sum(1 for f in formulas if (f.get("missingEvidenceCount") or 0) > 0)

    status_counts = {"green": 0, "amber": 0, "red": 0, "not-screened": 0}
    for f in formulas:
        s = f.get("screeningStatus") or "not-screened"
        if s in status_counts:
            status_counts[s] += 1
        else:
            status_counts["not-screened"] += 1

    changed = 0
    for f in formulas:
        cur = f.get("screeningCurrent") or {}
        if cur.get("outdated"):
            changed += 1

    print("hand_total", total)
    print("hand_awaiting_review", awaiting)
    print("hand_missing_evidence_rows", missing_ev)
    print("hand_screening", status_counts)
    print("hand_changed_since_screening", changed)
    print("runs_count", len(runs))


if __name__ == "__main__":
    main()
