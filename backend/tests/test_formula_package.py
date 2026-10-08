import copy

from fastapi.testclient import TestClient

from app.config import DATA
from app.engine import build_context, load_store
from app.llm import validate_explanation
from app.main import STORE, app

client = TestClient(app)


def example(example_id: str) -> dict:
    return copy.deepcopy(next(item["input"] for item in STORE["examples"] if item["example_id"] == example_id))


def test_catalog_and_examples():
    catalog = client.get("/api/catalog")
    assert catalog.status_code == 200
    assert any(item["material_id"] == "glow_purple" for item in catalog.json()["materials"])
    examples = client.get("/api/examples")
    assert examples.status_code == 200
    assert len(examples.json()["examples"]) == 3


def test_invalid_total_blocks_assessment():
    formula = example("EX-1")
    formula["ingredients"][0]["concentration_percent"] = 90
    response = client.post("/api/assessments", json=formula)
    assert response.status_code == 422
    assert "100%" in response.text


def test_unknown_material_is_not_substituted():
    formula = example("EX-1")
    formula["ingredients"][1]["material_id"] = "RM-103"
    response = client.post("/api/assessments", json=formula)
    assert response.status_code == 422
    assert "not in the material catalog" in response.text
    assert "glow_purple" not in response.text.lower() or "not in the material catalog" in response.text


def test_quantity_change_does_not_use_dummy_as_verdict():
    high = client.post("/api/assessments", json=example("EX-1")).json()
    low = client.post("/api/assessments", json=example("EX-2")).json()
    high_glow = [item for item in high["llm_context"]["calculated_checks"] if item["material_id"] == "glow_purple"]
    low_glow = [item for item in low["llm_context"]["calculated_checks"] if item["material_id"] == "glow_purple"]
    assert high_glow
    assert {item["status"] for item in high_glow} == {"not_assessed"}
    assert {item["status"] for item in low_glow} == {"not_assessed"}
    assert all("No verified applicable threshold available" in item["message"] for item in high_glow)
    assert all(item["threshold"] is None for item in high_glow)
    assert {item["illustrative_comparison"]["within_example"] for item in high_glow} == {False}
    assert {item["illustrative_comparison"]["within_example"] for item in low_glow} == {True}
    assert high["screening_status"] == "not_assessed"
    assert low["screening_status"] == "not_assessed"
    assert high["acceptance_probability"] is None
    assert high["ap_acceptance_probability"] is None
    assert high["metrics"]["check_pass_rate_percent"] is None
    assert high["metrics"]["evidence_coverage_percent"] == 0.0
    assert high["llm_context"]["applicable_verified_rules"] == []


def test_matching_unverified_batch_needs_review_and_wrong_batch_does_not():
    assessed = client.post("/api/assessments", json=example("EX-1")).json()
    glow = next(item for item in assessed["llm_context"]["evidence_checks"] if item["check_id"] == "E:US:REQ-COA:glow_purple")
    assert glow["status"] == "needs_review"
    assert glow["document_ids"] == ["DOC-GLOW"]
    silver = client.post("/api/assessments", json=example("EX-3")).json()
    mica = next(item for item in silver["llm_context"]["evidence_checks"] if item["check_id"] == "E:US:REQ-COA:mica_patina_silver")
    assert mica["status"] == "missing"
    assert "representative" in mica["message"]


def test_region_without_rules_is_not_a_pass():
    formula = example("EX-2")
    formula["regions"] = ["UK"]
    assessed = client.post("/api/assessments", json=formula).json()
    assert assessed["screening_status"] == "not_assessed"
    assert assessed["regions"]["UK"]["screening_status"] == "not_assessed"
    assert all(item["status"] != "pass" for item in assessed["llm_context"]["calculated_checks"])
    assert assessed["metrics"]["check_pass_rate_percent"] is None


def test_regulatory_rows_stay_disabled():
    assert all(row.get("enabled_for_decisions") is False for row in STORE["regulatory_rows"])
    context = build_context(example("EX-1"), STORE)
    assert context["applicable_verified_rules"] == []
    assert all(rule.get("provenance") == "dummy_editable" for rule in STORE["rules"])
    assert "disabled" in context["regulatory_reference_status"]
    assert context["reference_claims_pending_verification"]
    assert all(item["enabled_for_decisions"] is False for item in context["reference_claims_pending_verification"])


def test_finished_product_sds_does_not_satisfy_material_sds():
    context = build_context(example("EX-1"), STORE)
    sds = [item for item in context["evidence_checks"] if item["document_type"] == "sds"]
    assert sds
    assert all(item["status"] == "missing" for item in sds)


def test_context_is_document_grounded_and_bounded():
    context = build_context(example("EX-1"), STORE)
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
    assert context["source_excerpts"]
    excerpt = context["source_excerpts"][0]
    assert excerpt["document_id"]
    assert excerpt["filename"]
    assert excerpt["relevant_text"]
    assert excerpt["review_status"]
    assert excerpt["applicability"]
    assert all("file_path" not in document for document in context["documents"])
    document_ids = {item["document_id"] for item in context["documents"]}
    assert "DOC-GLOW" in document_ids
    assert len(context["source_excerpts"]) <= 12


def test_compare_reports_percentage_point_change():
    response = client.post("/api/compare", json={"previous": example("EX-1"), "current": example("EX-2")})
    assert response.status_code == 200
    body = response.json()
    glow = next(item for item in body["changes"]["concentration_changes"] if item["material_id"] == "glow_purple")
    assert glow["delta_percentage_points"] == -4
    assert any(
        item.get("previous_illustrative_within") is False and item.get("current_illustrative_within") is True
        for item in body["changes"]["finding_changes"]
    )
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
    formula = example("EX-1")
    formula["generate_explanation"] = True
    assessed = client.post("/api/assessments", json=formula).json()
    assert assessed["explanation"]["source"] == "none"
    assert assessed["explanation"]["status"] == "failed"
    assert assessed["execution"]["llm_status"] == "failed"
    assert assessed["execution"]["execution_mode"] == "live"
    assert assessed["explanation"]["content"]["summary"] == ""
    assert any(item["material_id"] == "glow_purple" for item in assessed["llm_context"]["calculated_checks"])
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
    formula = example("EX-2")
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
    context = build_context(example("EX-1"), load_store())
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
    context = build_context(example("EX-1"), load_store())
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
    assessed = client.post("/api/assessments", json=example("EX-1")).json()
    assert called["value"] is False
    assert assessed["explanation"]["status"] == "not_requested"
    assert assessed["execution"]["llm_status"] == "not_requested"
