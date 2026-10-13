"""LLM assessment schema checks. These do not call Azure."""

from app.llm import clean_demo_decisions, validate_assessment


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
    assert validated["findings"][0]["risk_level"] == "high"
    assert validated["findings"][0]["score_points"] == 12
    assert validated["risk_score"]["score"] == 88
    assert validated["risk_score"]["band"] == "ap"
    assert validated["recommendations"][0]["score_points"] == 12
    assert validated["recommendations"][0]["fix_kind"] == "review"


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


def test_overall_score_is_the_sum_of_critical_high_and_low_ratings():
    context = _context()
    context["calculated_checks"].append({
        "check_id": "US:s_toluene_108883:R2",
        "material_id": "s_toluene_108883",
        "rule_id": "R2",
        "status": "fail",
        "actual": 8,
        "message": "Above the supplied limit.",
    })
    payload = _payload()
    payload["findings"][0]["risk_level"] = "low"
    payload["findings"].append({
        "finding_id": "F-2",
        "ingredient_id": "s_toluene_108883",
        "status": "does_not_meet_rule",
        "severity": "critical",
        "risk_level": "critical",
        "title": "Toluene above the supplied limit",
        "observed_value": 8,
        "unit": "%",
        "rule_id": "R2",
        "reason": "The supplied calculation failed.",
        "source_ids": ["R2"],
        "required_action": "Review the concentration against the supplied limit.",
    })
    payload["screening_outcome"] = "changes_indicated"
    payload["preliminary_prediction"]["outcome"] = "cl_leaning"
    payload["recommendations"].append({
        "priority": "high",
        "action": "Review the concentration",
        "reason": "The calculation failed.",
        "related_finding_id": "F-2",
        "fix_kind": "review",
    })
    payload["recommendations"].append({
        "priority": "medium",
        "action": "Upload the missing certificate for this ingredient.",
        "reason": "The batch record is not on file.",
        "related_finding_id": "F-2",
        "fix_kind": "supplier_request",
    })
    validated, errors = validate_assessment(payload, context)
    assert errors == []
    assert validated["findings"][0]["risk_level"] == "critical"
    assert validated["findings"][0]["score_points"] == 26
    assert validated["risk_score"]["score"] == 69
    assert validated["risk_score"]["band"] == "at_risk"
    assert validated["risk_score"]["open_issues"] == 2
    matched = [item for item in validated["recommendations"] if item["related_finding_id"] == "F-2"]
    assert [item["score_points"] for item in matched] == [26, 0]


def test_model_knowledge_can_compare_a_concentration_when_no_threshold_was_supplied():
    payload = _payload()
    payload["findings"][0]["status"] = "does_not_meet_rule"
    payload["findings"][0]["rule_id"] = None
    payload["findings"][0]["source_ids"] = []
    payload["findings"][0]["limit_basis"] = "model_knowledge"
    payload["findings"][0]["reason"] = "Entered: 8%.\nLimit: 1% from model knowledge, not a supplied threshold file.\nComparison: above the limit.\nPointer: lower the concentration."
    payload["screening_outcome"] = "changes_indicated"
    payload["preliminary_prediction"]["outcome"] = "cl_leaning"
    payload["preliminary_prediction"]["source_ids"] = []
    validated, errors = validate_assessment(payload, _context())
    assert errors == []
    assert validated["findings"][0]["limit_basis"] == "model_knowledge"


def test_model_knowledge_cannot_override_a_supplied_pass_or_fail():
    context = _context()
    context["calculated_checks"][0]["status"] = "fail"
    context["calculated_checks"][0]["actual"] = 8
    payload = _payload()
    payload["findings"][0]["status"] = "meets_rule"
    payload["findings"][0]["limit_basis"] = "model_knowledge"
    payload["findings"][0]["reason"] = "Entered: 8%.\nLimit: 10% from model knowledge.\nComparison: within the limit."
    validated, errors = validate_assessment(payload, context)
    assert validated is None
    assert any("model knowledge" in item for item in errors)


def test_spaced_model_knowledge_basis_is_accepted():
    payload = _payload()
    payload["findings"][0]["status"] = "does_not_meet_rule"
    payload["findings"][0]["rule_id"] = None
    payload["findings"][0]["source_ids"] = []
    payload["findings"][0]["limit_basis"] = "model knowledge"
    payload["findings"][0]["reason"] = "Entered: 8%.\nLimit: 1% from model knowledge.\nComparison: above the limit."
    payload["screening_outcome"] = "changes_indicated"
    payload["preliminary_prediction"]["outcome"] = "cl_leaning"
    payload["preliminary_prediction"]["source_ids"] = []
    validated, errors = validate_assessment(payload, _context())
    assert errors == []
    assert validated["findings"][0]["limit_basis"] == "model_knowledge"


def test_a_mismatched_observed_value_uses_the_backend_number():
    context = _context()
    context["calculated_checks"][0]["status"] = "fail"
    context["calculated_checks"][0]["actual"] = 8
    payload = _payload()
    payload["findings"][0]["status"] = "does_not_meet_rule"
    payload["findings"][0]["observed_value"] = "9.5%"
    payload["findings"][0]["reason"] = "The supplied calculation failed."
    payload["screening_outcome"] = "changes_indicated"
    payload["preliminary_prediction"]["outcome"] = "cl_leaning"
    validated, errors = validate_assessment(payload, context)
    assert errors == []
    assert validated["findings"][0]["observed_value"] == 8


def test_demo_past_decisions_keep_four_review_rows():
    cleaned = clean_demo_decisions({
        "reviewed_count": 14,
        "comment": {
            "quote": "Isothiazolinone preservatives at this level are a sensitization concern for products used by young children.",
            "attribution": "Toxicologist comment on PS-0876 (2021)",
        },
        "decisions": [
            {"similarity": 75, "code": "FX-1730", "name": "Washable Marker – Berry", "year": 2020, "note": "No isothiazolinone preservative.", "outcome": "AP", "matched_on": "Washable marker, ages 3+"},
            {"similarity": 94, "code": "FX-2245", "name": "Washable Marker – Hot Magenta", "year": 2023, "note": "Same ink base. Used BIT at 0.01% instead of MIT.", "outcome": "AP", "matched_on": "Washable ink base, preservative, under 12"},
            {"similarity": 91, "code": "FX-1987", "name": "Washable Neon Marker – Flame Orange", "year": 2022, "note": "Reviewer asked for soluble barium data on Pigment Red 57:1.", "outcome": "AP, 2nd round", "matched_on": "Neon pigment, washable marker"},
            {"similarity": 78, "code": "PS-0876", "name": "Washable Paint Stick – Fuchsia", "year": 2021, "note": "MIT at 0.015% flagged as a sensitizer for ages 3+.", "outcome": "CL", "matched_on": "Preservative level, ages 3+"},
            {"similarity": 70, "code": "FX-0001", "name": "Certified Seal Marker", "year": 2024, "note": "This formula is certified and guaranteed safe for children.", "outcome": "AP", "matched_on": "Marker, under 12"},
        ],
    })
    assert cleaned is not None
    assert cleaned["reviewed_count"] == 14
    assert [item["code"] for item in cleaned["decisions"]] == ["FX-2245", "FX-1987", "PS-0876"]
    assert cleaned["decisions"][2]["outcome"] == "CL"
    second = clean_demo_decisions({
        "reviewed_count": 14,
        "comment": cleaned["comment"],
        "decisions": [
            {**item, "outcome": "2nd round"} if item["code"] == "FX-1987" else item
            for item in cleaned["decisions"]
        ],
    })
    assert second is not None
    assert second["decisions"][1]["outcome"] == "AP, 2nd round"
    assert "PS-0876" in cleaned["comment"]["attribution"]


def test_default_half_estimate_is_rejected_when_evidence_is_missing():
    payload = _payload()
    payload["preliminary_prediction"]["numeric_estimate"] = 0.5
    payload["preliminary_prediction"]["estimate_kind"] = "uncalibrated_ai_estimate"
    validated, errors = validate_assessment(payload, _context())
    assert validated is None
    assert any("0.5" in item or "indeterminate" in item for item in errors)
