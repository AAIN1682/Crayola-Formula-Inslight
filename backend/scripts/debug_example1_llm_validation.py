"""Capture prompt context, raw Azure output, and schema validation errors for Example 1 payload."""
from __future__ import annotations

import json
from pathlib import Path

from app import llm
from app.engine import build_context

REPORT = Path(__file__).resolve().parents[2] / "docs" / "screenshots" / "example1-precheck-report.json"


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    body = report["assessmentRequestBody"]
    context = build_context(body)
    prompt_user = json.dumps({"assessment_context": llm._public_context(context)}, ensure_ascii=False)
    print("=== PROMPT USER MESSAGE (first 4000 chars, secrets masked) ===")
    print(llm.sanitize(Exception(prompt_user[:4000])) if False else prompt_user[:4000])
    print(f"... total_chars={len(prompt_user)}")
    print("\n=== MATERIAL IDS IN CONTEXT ===")
    materials = {m["material_id"]: m.get("name") for m in context.get("materials") or []}
    print(json.dumps(materials, indent=2))
    print("\n=== CALCULATED CHECK material_ids ===")
    for check in context.get("calculated_checks") or []:
        print(check.get("check_id"), check.get("material_id"), check.get("status"), check.get("actual"))

    try:
        result = llm.explain(context)
        print("\n=== LLM SUCCEEDED ===")
        print(json.dumps(result.get("assessment", {}).get("assessment_summary", "")[:200], indent=2))
    except llm.AzureExplanationError as error:
        print("\n=== LLM FAILED ===")
        print("code:", error.code)
        print("message:", error.message)
    except Exception as error:
        print("\n=== ERROR ===")
        print(llm.sanitize(error))

    # Dry-run: validate a minimal compliant payload for this context
    legacy = [c for c in context.get("calculated_checks") or [] if c.get("reason_code") == "unmatched_identity"]
    benzoate = "s_sodium_benzoate_532321"
    check_ids = [c["check_id"] for c in context.get("calculated_checks") or []]
    evidence_ids = [c["check_id"] for c in context.get("evidence_checks") or []]
    print("\n=== LEGACY CHECK material_ids (should be declared names) ===")
    print([c.get("material_id") for c in legacy])

    bad_payload = {
        "assessment_summary": "Water is unmatched and sodium benzoate is pending verification in the supplied files.",
        "screening_outcome": "additional_information_required",
        "preliminary_prediction": {
            "outcome": "indeterminate",
            "basis": "Gaps remain.",
            "analysis_confidence": "low",
            "confidence_reason": "Missing rules and pending verification.",
            "numeric_estimate": None,
            "estimate_kind": "not_available",
            "blocking_uncertainties": ["catalog gaps"],
            "source_ids": [check_ids[0]] if check_ids else [],
        },
        "findings": [
            {
                "finding_id": "F-bad",
                "ingredient_id": "row-1",
                "status": "unresolved_identity",
                "severity": "low",
                "risk_level": "low",
                "title": "bad",
                "observed_value": 78.5,
                "unit": "%",
                "rule_id": None,
                "reason": "test",
                "source_ids": [legacy[0]["check_id"]] if legacy else [],
                "required_action": "fix",
            }
        ],
        "missing_documents": [],
        "source_conflicts": [],
        "recommendations": [],
        "alerts": [],
        "next_actions": [],
        "version_comparison": None,
        "limitations": [],
    }
    _, bad_errors = llm.validate_assessment(bad_payload, context)
    print("\n=== VALIDATION ERRORS (row-1 ingredient_id) ===")
    print(bad_errors)


if __name__ == "__main__":
    main()
