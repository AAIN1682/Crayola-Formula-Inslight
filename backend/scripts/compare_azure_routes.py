"""Compare LLM outcome on legacy vs formula-scoped assessment routes."""
from __future__ import annotations

import json
import urllib.request

from app.formula_conversion import formula_to_assessment_payload
from app.formula_store import Formula

BASE = "http://127.0.0.1:8000"


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    import json as js
    from pathlib import Path

    raw = js.loads((Path(__file__).resolve().parents[1] / "data" / "formulas.json").read_text(encoding="utf-8-sig"))
    formula = Formula.model_validate(raw[0])
    payload = formula_to_assessment_payload(formula, generate_explanation=True, assessment_mode="evidence")
    payload["generate_explanation"] = True

    legacy = post("/api/assessments", payload)
    scoped = post(f"/api/formulas/{formula.id}/assessments", {"generate_explanation": True})

    for label, result in [("legacy /api/assessments", legacy), (f"scoped /api/formulas/{formula.id}/assessments", scoped)]:
        exec_info = result.get("execution") or {}
        expl = result.get("explanation") or {}
        content = expl.get("content")
        snippet = ""
        if isinstance(content, dict):
            snippet = json.dumps(content)[:300]
        elif isinstance(content, str):
            snippet = content[:300]
        print(f"--- {label} ---")
        print("llm_status", exec_info.get("llm_status"))
        print("explanation.status", expl.get("status"))
        print("error_code", exec_info.get("error_code"))
        print("error_message", exec_info.get("error_message"))
        print("output_snippet", snippet.replace(payload.get("name", "SECRET")[:3], "***") if snippet else "")


if __name__ == "__main__":
    main()
