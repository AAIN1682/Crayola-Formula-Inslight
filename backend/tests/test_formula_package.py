import copy

from fastapi.testclient import TestClient

from app.config import DATA
from app.engine import _metrics, assessment_support, build_context, constrain_analysis_confidence, load_scenario_store, load_store
from app.llm import validate_explanation
from app.main import STORE, app

client = TestClient(app)


def example(example_id: str) -> dict:
    return copy.deepcopy(next(item["input"] for item in STORE["examples"] if item["example_id"] == example_id))


def scenario_example(example_id: str) -> dict:
    return copy.deepcopy(next(item["input"] for item in load_scenario_store()["examples"] if item["example_id"] == example_id))


def test_catalog_and_examples():
    catalog = client.get("/api/catalog")
    assert catalog.status_code == 200
    body = catalog.json()
    assert body["product_categories"] == ["Markers", "Paints", "Crayons", "Modeling Compounds", "Future / Novelty Products"]
    assert body["regions"] == ["US", "EU"]
    assert "glow_purple" not in str(body["materials"])
    examples = client.get("/api/examples")
    assert examples.status_code == 200
    assert [item["example_id"] for item in examples.json()["examples"]] == ["SCN-A", "SCN-B", "SCN-C", "SCN-D"]
    assert all(item["input"]["assessment_mode"] == "scenario" for item in examples.json()["examples"])
    assert examples.json()["dataset_kind"] == "scenario"


def _live(**overrides) -> dict:
    payload = {
        "formula_id": "FML-T",
        "version_id": "v1",
        "name": "Partial marker screen",
        "product_category": "Markers",
        "age_group": "under_12",
        "regions": ["US"],
        "physical_form": "liquid",
        "intended_use": "Classroom marker on paper.",
        "composition_completeness": "partial",
        "ingredients": [{"material_id": "s_toluene_108883", "concentration_percent": 5, "batch_id": "LOT-9"}],
    }
    payload.update(overrides)
    return payload


def test_invalid_total_blocks_assessment():
    response = client.post("/api/assessments", json=_live(composition_completeness="complete"))
    assert response.status_code == 422
    assert "100%" in response.text


def test_unknown_material_is_not_substituted():
    response = client.post("/api/assessments", json=_live(ingredients=[{"material_id": "RM-103", "concentration_percent": 5}]))
    assert response.status_code == 422
    assert "not in the selected" in response.text
    assert "was not replaced" in response.text


def test_quantity_change_does_not_use_dummy_as_verdict():
    high = client.post("/api/assessments", json=_live(ingredients=[{"material_id": "s_toluene_108883", "concentration_percent": 10}])).json()
    low = client.post("/api/assessments", json=_live()).json()
    high_check = next(item for item in high["llm_context"]["calculated_checks"] if item.get("status") == "fail")
    low_check = next(item for item in low["llm_context"]["calculated_checks"] if item.get("rule_id") == high_check["rule_id"])
    assert low_check["status"] == "pass"
    assert high_check["illustrative_comparison"] if False else high_check["verified_limit_available"]
    assert "dummy" not in str(high_check.get("rule_provenance") or "")
    assert high["screening_status"] == "changes_required"
    assert high["assessment_mode"] == "evidence"
    assert high["acceptance_probability"] is None
    assert high["ap_acceptance_probability"] is None
    assert high["dataset_kind"] == "threshold_reference"


def test_matching_unverified_batch_needs_review_and_wrong_batch_does_not():
    assessed = client.post("/api/assessments", json=_live()).json()
    coa = next(item for item in assessed["llm_context"]["evidence_checks"] if item["document_type"] == "coa")
    assert coa["status"] == "missing"
    assert "DOC-GLOW" not in coa["document_ids"]


def test_region_without_rules_is_not_a_pass():
    response = client.post("/api/assessments", json=_live(regions=["UK"]))
    assert response.status_code == 422
    assert "US and EU only" in response.text


def test_regulatory_rows_stay_disabled():
    assert all(row.get("enabled_for_decisions") is False for row in STORE["regulatory_rows"])
    assert all(rule.get("provenance") == "dummy_editable" for rule in STORE["rules"])
    context = build_context(_live(), STORE)
    assert context["dataset_kind"] == "threshold_reference"
    assert all(rule.get("verification_status") == "Verified" for rule in context["applicable_verified_rules"])
    assert all(item.get("material_id") != "glow_purple" for item in context["calculated_checks"])


def test_finished_product_sds_does_not_satisfy_material_sds():
    context = build_context(_live(), STORE)
    assert all(item["document_type"] != "sds" or item["status"] != "satisfied" for item in context["evidence_checks"])
    assert "DOC-GLOW" not in {item["document_id"] for item in context["documents"]}


def test_context_is_document_grounded_and_bounded():
    context = build_context(_live(), STORE)
    for key in (
        "formula",
        "materials",
        "calculated_checks",
        "applicable_verified_rules",
        "reference_claims_pending_verification",
        "evidence_requirements",
        "evidence_matches",
        "missing_evidence",
        "source_conflicts",
        "source_excerpts",
        "version_changes",
        "documented_history",
        "assessment_limitations",
    ):
        assert key in context
    assert context["applicable_verified_rules"]
    assert all("file_path" not in document for document in context["documents"])
    assert len(context["source_excerpts"]) <= 12
    assert context["formula"]["catalog_coverage_incomplete"] is True


def test_compare_reports_percentage_point_change():
    response = client.post("/api/compare", json={
        "previous": _live(ingredients=[{"material_id": "s_toluene_108883", "concentration_percent": 10}]),
        "current": _live(),
    })
    assert response.status_code == 200
    body = response.json()
    change = next(item for item in body["changes"]["concentration_changes"] if item["material_id"] == "s_toluene_108883")
    assert change["delta_percentage_points"] == -5
    assert body["explanation"]["status"] == "not_requested"


def test_azure_failure_keeps_calculations_and_does_not_report_success(monkeypatch):
    from app.llm import AzureExplanationError

    def fail(_context):
        raise AzureExplanationError(
            "Azure OpenAI did not complete the assessment request.",
            code="request_failed",
            execution={
                "llm_status": "failed",
                "llm_provider": "azure_openai",
                "deployment": "test-deployment",
                "response_id": None,
                "request_id": None,
                "latency_ms": 12,
                "usage": None,
                "error_code": "request_failed",
                "error_message": "Azure OpenAI did not complete the assessment request.",
            },
        )

    monkeypatch.setattr("app.main.explain", fail)
    formula = _live()
    formula["generate_explanation"] = True
    assessed = client.post("/api/assessments", json=formula).json()
    assert assessed["explanation"]["source"] == "none"
    assert assessed["explanation"]["status"] == "failed"
    assert assessed["execution"]["llm_status"] == "failed"
    assert assessed["execution"]["execution_mode"] == "live"
    assert assessed["explanation"]["content"]["summary"] == ""
    assert any(item["material_id"] == "s_toluene_108883" for item in assessed["llm_context"]["calculated_checks"])
    assert "AI analysis failed" in " ".join(assessed["explanation"]["content"]["limitations"])


def test_missing_credentials_fail_explicitly(monkeypatch):
    from app.llm import AzureExplanationError

    def fail(_context):
        raise AzureExplanationError(
            "Azure OpenAI is not configured on the server.",
            code="missing_configuration",
            execution={
                "llm_status": "failed",
                "llm_provider": "azure_openai",
                "deployment": None,
                "response_id": None,
                "request_id": None,
                "latency_ms": 1,
                "usage": None,
                "error_code": "missing_configuration",
                "error_message": "Azure OpenAI is not configured on the server. Set the Azure endpoint, deployment, API version, and key.",
            },
        )

    monkeypatch.setattr("app.main.explain", fail)
    formula = _live()
    formula["generate_explanation"] = True
    assessed = client.post("/api/assessments", json=formula).json()
    assert assessed["execution"]["error_code"] == "missing_configuration"
    assert assessed["explanation"]["status"] == "failed"


def test_health_hides_secrets():
    body = client.get("/api/health").json()
    text = str(body)
    assert "api_key" not in text.lower()
    assert "AZURE_OPENAI_API_KEY" not in text
    assert body["data_dir"] == str(DATA)


def test_llm_rejects_unknown_ids():
    context = build_context(_live(), load_store())
    assert validate_explanation(
        {
            "summary": "x",
            "finding_explanations": [{"check_id": "nope", "explanation": "y", "source_ids": [], "limitations": []}],
            "evidence_gaps": [],
            "recommendations": [],
            "alerts": [],
            "analysis_confidence": {"level": "low", "basis": "none", "limiting_factors": [], "source_ids": []},
            "version_comparison_summary": None,
            "limitations": [],
        },
        context,
    ) is None


def test_llm_accepts_valid_payload():
    context = build_context(_live(), load_store())
    check_id = context["calculated_checks"][0]["check_id"]
    requirement_id = context["evidence_requirements"][0]["requirement_id"]
    validated = validate_explanation(
        {
            "summary": "No verified threshold is available for the entered materials.",
            "finding_explanations": [{"check_id": check_id, "explanation": "No verified applicable threshold available.", "source_ids": [], "limitations": []}],
            "evidence_gaps": [{
                "requirement_id": requirement_id,
                "status": "unverified",
                "explanation": "Matching documents are not verified for this identity and batch.",
                "required_action": "Obtain verified batch-specific evidence.",
                "source_ids": [],
            }],
            "recommendations": [{
                "priority": "high",
                "action": "Verify applicable limits before any regulatory conclusion.",
                "rationale": "The current dataset has no verified concentration rules.",
                "related_check_ids": [check_id],
                "source_ids": [],
                "requires_testing_or_review": True,
            }],
            "alerts": [{"severity": "medium", "title": "Unverified limits", "message": "No verified applicable threshold available.", "source_ids": []}],
            "analysis_confidence": {"level": "low", "basis": "Unverified evidence and no verified limits.", "limiting_factors": ["missing verified threshold"], "source_ids": []},
            "version_comparison_summary": None,
            "limitations": ["No AP/CL decision is issued."],
        },
        context,
    )
    assert validated is not None
    assert validated["analysis_confidence"]["level"] == "low"


def test_analysis_confidence_is_capped_without_verified_limits_or_evidence():
    context = build_context(_live(), load_store())
    metrics = _metrics(context["calculated_checks"], context["evidence_checks"])
    constrained = constrain_analysis_confidence(
        {
            "level": "high",
            "basis": "The assessment is strongly supported by internally consistent not-assessed statuses.",
            "limiting_factors": [],
            "source_ids": [],
        },
        context,
        metrics,
    )
    assert constrained is not None
    assert constrained["level"] == "low"
    assert constrained["assessment_support"] == "insufficient"
    assert "strongly supported" not in constrained["basis"].lower()


def test_azure_high_confidence_is_capped_on_live_assessment(monkeypatch):
    context = build_context(_live(), load_store())
    check_id = context["calculated_checks"][0]["check_id"]
    requirement_id = context["evidence_requirements"][0]["requirement_id"]
    validated = validate_explanation(
        {
            "summary": "All checks are not assessed.",
            "finding_explanations": [{"check_id": check_id, "explanation": "No verified applicable threshold available.", "source_ids": [], "limitations": []}],
            "evidence_gaps": [{
                "requirement_id": requirement_id,
                "status": "missing",
                "explanation": "Required documents are missing.",
                "required_action": "Obtain verified evidence.",
                "source_ids": [],
            }],
            "recommendations": [{
                "priority": "high",
                "action": "Obtain verified SDS documents.",
                "rationale": "Evidence coverage is 0%.",
                "related_check_ids": [check_id],
                "source_ids": [],
                "requires_testing_or_review": True,
            }],
            "alerts": [{"severity": "medium", "title": "Unverified limits", "message": "No verified applicable threshold available.", "source_ids": []}],
            "analysis_confidence": {
                "level": "high",
                "basis": "The assessment is strongly supported by explicit backend statuses.",
                "limiting_factors": [],
                "source_ids": [],
            },
            "version_comparison_summary": None,
            "limitations": ["No AP/CL decision is issued."],
        },
        context,
    )
    assert validated is not None
    assert validated["analysis_confidence"]["level"] == "high"

    monkeypatch.setattr(
        "app.main.explain",
        lambda _context: {
            "content": validated,
            "execution": {
                "llm_status": "succeeded",
                "llm_provider": "azure_openai",
                "deployment": "test",
                "response_id": "resp-test",
                "request_id": "req-test",
                "latency_ms": 1,
                "usage": None,
                "error_code": None,
                "error_message": None,
            },
        },
    )
    payload = _live()
    payload["generate_explanation"] = True
    assessed = client.post("/api/assessments", json=payload).json()
    assert assessed["explanation"]["status"] == "generated"
    assert assessed["analysis_confidence"]["level"] == "low"
    assert assessed["assessment_support"]["level"] == "insufficient"
    assert assessed["metrics"]["evidence_coverage_percent"] == 0.0


def test_document_route_rejects_unknown_id():
    assert client.get("/api/documents/NOT-A-DOCUMENT").status_code == 404
    listed = client.get("/api/documents/DOC-GLOW")
    assert listed.status_code == 200


def test_default_generate_explanation_does_not_call_azure(monkeypatch):
    called = {"value": False}

    def boom(_context):
        called["value"] = True
        raise AssertionError("Azure should not run when generate_explanation is false")

    monkeypatch.setattr("app.main.explain", boom)
    assessed = client.post("/api/assessments", json=_live()).json()
    assert called["value"] is False
    assert assessed["explanation"]["status"] == "not_requested"
    assert assessed["execution"]["llm_status"] == "not_requested"


def test_scenario_mode_evaluates_configured_pigment_threshold():
    high = scenario_example("SCN-A")
    low = scenario_example("SCN-B")
    high_result = client.post("/api/assessments", json=high).json()
    low_result = client.post("/api/assessments", json=low).json()
    high_glow = next(item for item in high_result["llm_context"]["calculated_checks"] if item["material_id"] == "glow_purple")
    low_glow = next(item for item in low_result["llm_context"]["calculated_checks"] if item["material_id"] == "glow_purple")
    assert high_glow["status"] == "fail"
    assert low_glow["status"] == "pass"
    assert high_glow["threshold"] == 5
    assert high_glow["rule_provenance"] == "synthetic_scenario"
    assert "Configured scenario limit exceeded" in high_glow["message"]
    assert high_result["screening_status"] == "changes_required"
    assert high_result["screening_status_label"] == "Changes required"
    assert high_result["metrics"]["check_pass_rate_label"] == "Configured concentration-check pass rate"
    assert high_result["metrics"]["evidence_coverage_label"] == "Scenario evidence completeness"
    assert high_result["dataset_kind"] == "scenario"


def test_coa_does_not_require_formula_version_or_region():
    context = build_context(_live(), load_store())
    coa = next(item for item in context["evidence_checks"] if item["document_type"] == "coa")
    assert coa["status"] == "missing"
    assert "DOC-GLOW" not in coa["document_ids"]


def test_zero_evaluated_checks_do_not_report_100_percent_pass():
    from app.threshold_catalog import load_catalog

    lead = next(item["substance_id"] for item in load_catalog()["substances"].values() if item.get("cas_number") == "7439-92-1")
    assessed = client.post("/api/assessments", json=_live(
        regions=["EU"],
        test_material_category="en71_cat_ii",
        ingredients=[{"material_id": lead}],
    )).json()
    assert assessed["metrics"]["evaluated_checks"] == 0
    assert assessed["metrics"]["check_pass_rate_percent"] is None
    assert assessed["metrics"]["needs_test_data_checks"] > 0
    assert assessed["acceptance_probability"] is None


def _concentration(result: dict) -> list[dict]:
    return [item for item in result["llm_context"]["calculated_checks"] if item.get("check_kind") == "concentration" or item.get("rule_id")]


def test_scenario_case_a_above_pigment_limit():
    result = client.post("/api/assessments", json=scenario_example("SCN-A")).json()
    checks = _concentration(result)
    assert result["metrics"]["concentration_passed_checks"] == 2
    assert result["metrics"]["concentration_failed_checks"] == 1
    assert sum(item["status"] == "pass" for item in checks) == 2
    assert sum(item["status"] == "fail" for item in checks) == 1
    assert result["metrics"]["check_pass_rate_percent"] == 66.7
    assert result["screening_status"] == "changes_required"
    assert result["metrics"]["evidence_coverage_percent"] == 100.0
    assert result["assessment_support"]["level"] == "substantial"
    assert result["acceptance_probability"] is None
    assert "ISSUE-UNRELATED-MARKER" not in {item.get("issue_id") for item in result["llm_context"]["source_issues"]}
    assert "SCN-DOC-UNRELATED" not in {item["document_id"] for item in result["llm_context"]["documents"]}
    assert "SCN-LABEL-V1-EU" not in {item["document_id"] for item in result["llm_context"]["documents"]}


def test_scenario_case_b_meets_configured_checks():
    result = client.post("/api/assessments", json=scenario_example("SCN-B")).json()
    checks = _concentration(result)
    assert len(checks) == 3
    assert all(item["status"] == "pass" for item in checks)
    assert result["metrics"]["check_pass_rate_percent"] == 100.0
    assert result["metrics"]["evidence_coverage_percent"] == 100.0
    assert result["screening_status_label"] == "Meets configured scenario checks"
    assert result["ap_cl_decision"] is None
    assert "SCN-LAB-V1" not in {item["document_id"] for item in result["llm_context"]["documents"]}
    assert "SCN-LAB-V2" in {item["document_id"] for item in result["llm_context"]["documents"]}


def test_scenario_case_c_missing_finished_test():
    result = client.post("/api/assessments", json=scenario_example("SCN-C")).json()
    checks = _concentration(result)
    assert all(item["status"] == "pass" for item in checks)
    lab = next(item for item in result["llm_context"]["evidence_checks"] if item["requirement_id"] == "REQ-LAB")
    assert lab["status"] == "missing"
    assert result["screening_status"] == "more_information_required"
    assert result["metrics"]["evidence_coverage_percent"] < 100


def test_scenario_case_d_batch_mismatch():
    result = client.post("/api/assessments", json=scenario_example("SCN-D")).json()
    checks = _concentration(result)
    assert all(item["status"] == "pass" for item in checks)
    coa = next(item for item in result["llm_context"]["evidence_checks"] if item["check_id"] == "E:US:REQ-COA:glow_purple")
    assert coa["status"] == "mismatched"
    assert coa["reason_code"] == "batch_mismatch"
    assert "Obtain the correct batch CoA or correct the entered batch." in coa["action"]
    assert coa["status"] != "satisfied"
    assert result["metrics"]["evidence_coverage_percent"] < 100
    assert result["screening_status"] == "more_information_required"


def test_scenario_evidence_does_not_verify_evidence_mode():
    assessed = client.post("/api/assessments", json=_live()).json()
    assert assessed["assessment_mode"] == "evidence"
    assert assessed["dataset_kind"] == "threshold_reference"
    document_ids = {item["document_id"] for item in assessed["llm_context"]["documents"]}
    assert "SCN-SDS-GLOW_PURPLE" not in document_ids
    assert "DOC-GLOW" not in document_ids


def test_scenario_rejects_invalid_total_and_unknown_material():
    invalid = scenario_example("SCN-B")
    invalid["ingredients"][0]["concentration_percent"] = 90
    response = client.post("/api/assessments", json=invalid)
    assert response.status_code == 422
    unknown = scenario_example("SCN-B")
    unknown["ingredients"][1]["material_id"] = "RM-103"
    response = client.post("/api/assessments", json=unknown)
    assert response.status_code == 422
    assert "not in the material catalog" in response.text


def test_unsupported_region_is_a_coverage_gap():
    formula = scenario_example("SCN-B")
    formula["regions"] = ["UK"]
    result = client.post("/api/assessments", json=formula).json()
    assert all(item["status"] == "not_assessed" for item in result["llm_context"]["calculated_checks"])
    assert result["metrics"]["check_pass_rate_percent"] is None
    assert result["screening_status"] != "no_issues_found_in_assessed_scope"


def test_wrong_region_finished_report_is_not_satisfied():
    formula = scenario_example("SCN-A")
    formula["regions"] = ["EU"]
    result = client.post("/api/assessments", json=formula).json()
    lab = next(item for item in result["llm_context"]["evidence_checks"] if item["requirement_id"] == "REQ-LAB")
    assert lab["status"] != "satisfied"
    assert "SCN-LAB-V1" not in lab["document_ids"] or lab["status"] != "satisfied"


def test_version_comparison_reports_four_point_pigment_reduction():
    body = {"previous": scenario_example("SCN-A"), "current": scenario_example("SCN-B"), "generate_explanation": False, "comparison_kind": "reassess"}
    result = client.post("/api/compare", json=body).json()
    change = next(item for item in result["changes"]["concentration_changes"] if item["material_id"] == "glow_purple")
    assert change["previous_percent"] == 8
    assert change["current_percent"] == 4
    assert change["delta_percentage_points"] == -4


def test_azure_failure_does_not_invent_a_successful_explanation(monkeypatch):
    def boom(_context):
        from app.llm import AzureExplanationError
        raise AzureExplanationError("Azure OpenAI did not complete the assessment request.", code="request_failed", execution={
            "llm_status": "failed",
            "llm_provider": "azure_openai",
            "deployment": "test",
            "response_id": None,
            "request_id": None,
            "latency_ms": 1,
            "usage": None,
            "error_code": "request_failed",
            "error_message": "Azure OpenAI did not complete the assessment request.",
        })

    monkeypatch.setattr("app.main.explain", boom)
    payload = scenario_example("SCN-A")
    payload["generate_explanation"] = True
    assessed = client.post("/api/assessments", json=payload).json()
    assert assessed["explanation"]["status"] == "failed"
    assert assessed["explanation"]["source"] == "none"
    assert assessed["metrics"]["check_pass_rate_percent"] == 66.7
    assert assessed["explanation"]["content"]["summary"] == ""
