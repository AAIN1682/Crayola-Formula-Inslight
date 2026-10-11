"""LLM assessment schema checks. These do not call Azure."""

from app.llm import validate_assessment


def _context() -> dict:
    return {
        "formula": {"formula_id": "FML-1", "version_id": "v1", "ingredients": [{"material_id": "s_toluene_108883", "concentration_percent": 8}]},
        "materials": [{"material_id": "s_toluene_108883", "name": "Toluene"}],
        "calculated_checks": [
            {
                "check_id": "US:s_toluene_108883:R1",
                "material_id": "s_toluene_108883",
                "rule_id": "R1",
                "status": "needs_test_data",
                "actual": None,
                "message": "A measurement is required.",
            }
        ],
        "evidence_checks": [
            {
                "check_id": "E:US:REQ:coa",
                "requirement_id": "REQ:US:s_toluene_108883:coa",
                "document_type": "coa",
                "status": "missing",
                "material_id": "s_toluene_108883",
            }
        ],
        "applicable_verified_rules": [{"rule_id": "R1"}],
    }


def _payload(**overrides) -> dict:
    body = {
        "assessment_summary": "Toluene is listed at 8% and the CoA for that batch is not on file, so the direction stays unresolved.",
        "screening_outcome": "additional_information_required",
        "preliminary_prediction": {
            "outcome": "indeterminate",
            "basis": "The content limit cannot be closed without a reviewed measurement.",
            "analysis_confidence": "low",
            "confidence_reason": "The CoA is missing and the calculation was not a pass or a fail.",
            "numeric_estimate": None,
            "estimate_kind": "not_available",
            "blocking_uncertainties": ["Missing CoA"],
            "source_ids": ["R1"],
        },
        "findings": [
            {
                "finding_id": "F-1",
                "ingredient_id": "s_toluene_108883",
                "status": "testing_required",
                "severity": "medium",
                "title": "Toluene measurement missing",
                "observed_value": None,
                "unit": None,
                "rule_id": "R1",
                "reason": "The supplied calculation needs test data. That is not a measured failure.",
                "source_ids": ["R1"],
                "required_action": "Upload a CoA or laboratory result for this material.",
            }
        ],
        "missing_documents": [{"title": "Toluene CoA", "document_type": "coa", "reason": "No batch CoA is linked.", "ingredient_id": "s_toluene_108883"}],
        "source_conflicts": [],
        "recommendations": [{"priority": "high", "action": "Upload document", "reason": "The CoA is absent.", "related_finding_id": "F-1"}],
        "alerts": [],
        "next_actions": [{"priority": "high", "action": "Upload document", "reason": "The CoA is absent.", "related_finding_id": "F-1"}],
        "version_comparison": None,
        "limitations": ["State-specific rules are outside this assessment."],
    }
    body.update(overrides)
    return body


def test_indeterminate_assessment_is_accepted_when_evidence_is_missing():
    validated, errors = validate_assessment(_payload(), _context())
    assert errors == []
    assert validated["preliminary_prediction"]["outcome"] == "indeterminate"
    assert validated["preliminary_prediction"]["numeric_estimate"] is None


def test_missing_evidence_cannot_be_described_as_a_failure():
    payload = _payload()
    payload["findings"][0]["status"] = "does_not_meet_rule"
    payload["screening_outcome"] = "changes_indicated"
    payload["preliminary_prediction"]["outcome"] = "cl_leaning"
    validated, errors = validate_assessment(payload, _context())
    assert validated is None
    assert any("does_not_meet_rule" in item or "cl_leaning" in item for item in errors)


def test_unknown_citation_is_rejected():
    payload = _payload()
    payload["findings"][0]["source_ids"] = ["invented-source"]
    validated, errors = validate_assessment(payload, _context())
    assert validated is None
    assert any("unknown source" in item for item in errors)


def test_default_half_estimate_is_rejected_when_evidence_is_missing():
    payload = _payload()
    payload["preliminary_prediction"]["numeric_estimate"] = 0.5
    payload["preliminary_prediction"]["estimate_kind"] = "uncalibrated_ai_estimate"
    validated, errors = validate_assessment(payload, _context())
    assert validated is None
    assert any("0.5" in item or "indeterminate" in item for item in errors)
