"""Saved-formula screening persistence. Uses a temporary assessment history file."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.screening_service import ScreeningServiceError, assess_saved_formula, latest_screening_status, load_runs

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_history(tmp_path, monkeypatch):
    path = tmp_path / "assessment_runs.json"
    formulas = tmp_path / "formulas.json"
    monkeypatch.setenv("ASSESSMENT_RUNS_PATH", str(path))
    monkeypatch.setattr("app.formula_store.FORMULAS_PATH", formulas)
    return path


def live_formula(**overrides) -> dict:
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
        "generate_explanation": False,
        "ingredients": [{"material_id": "s_toluene_108883", "concentration_percent": 5, "batch_id": "LOT-9"}],
    }
    payload.update(overrides)
    return payload


def test_formula_assessment_route_is_registered():
    paths = {getattr(route, "path", None) for route in app.routes}
    methods = set()
    for route in app.routes:
        if getattr(route, "path", None) == "/api/assessments":
            methods |= set(getattr(route, "methods", set()))
    assert "/api/formulas/{id}/assessments" in paths
    assert "/api/assessments" in paths
    assert {"GET", "POST"} <= methods


def test_saved_example_is_assessed_and_persisted(isolated_history):
    response = client.post("/api/formulas/F-PURPLE-PAINT-GAP/assessments")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["input_snapshot"]["formula_id"] == "F-PURPLE-PAINT-GAP"
    assert body["assessment_mode"] == "scenario"
    assert body["screening_status"] in {
        "changes_required",
        "more_information_required",
        "no_issues_found_in_assessed_scope",
    }
    assert body["regulatory_status"] == "not_assessed"
    assert body["ap_cl_decision"] is None
    assert body["acceptance_probability"] is None

    saved = json.loads(isolated_history.read_text(encoding="utf-8"))
    assert [item["assessment_id"] for item in saved["runs"]] == [body["assessment_id"]]
    assert saved["latest"]["F-PURPLE-PAINT-GAP"]["screening_status"] == body["screening_status"]
    assert latest_screening_status("F-PURPLE-PAINT-GAP")["assessment_id"] == body["assessment_id"]


def test_missing_formula_is_not_found(isolated_history):
    response = client.post("/api/formulas/FML-DOES-NOT-EXIST/assessments")
    assert response.status_code == 404
    assert response.json()["detail"] == "That formula is not saved."
    assert not isolated_history.exists()


def test_ambiguous_example_is_rejected(isolated_history):
    response = client.post("/api/formulas/F-PURPLE-PAINT/assessments")
    assert response.status_code == 422
    assert "More than one saved example" in response.json()["detail"]
    assert not isolated_history.exists()


def test_validation_failure_does_not_persist(isolated_history):
    isolated_history.write_text('{"runs": [], "latest": {}}\n', encoding="utf-8")
    response = client.post(
        "/api/formulas/FML-T/assessments",
        json=live_formula(composition_completeness="complete"),
    )
    assert response.status_code == 422
    assert json.loads(isolated_history.read_text(encoding="utf-8")) == {"runs": [], "latest": {}}


def test_id_mismatch_is_rejected(isolated_history):
    response = client.post("/api/formulas/FML-OTHER/assessments", json=live_formula())
    assert response.status_code == 422
    assert not isolated_history.exists()


def test_repeated_assessments_keep_history(isolated_history):
    first = client.post("/api/formulas/FML-T/assessments", json=live_formula())
    second = client.post(
        "/api/formulas/FML-T/assessments",
        json=live_formula(ingredients=[{"material_id": "s_toluene_108883", "concentration_percent": 10, "batch_id": "LOT-9"}]),
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["screening_status"] != second.json()["screening_status"]

    saved = json.loads(isolated_history.read_text(encoding="utf-8"))
    assert [item["assessment_id"] for item in saved["runs"]] == [
        first.json()["assessment_id"],
        second.json()["assessment_id"],
    ]
    assert saved["latest"]["FML-T"]["assessment_id"] == second.json()["assessment_id"]
    assert saved["latest"]["FML-T"]["screening_status"] == second.json()["screening_status"]
    assert saved["runs"][0]["assessment_id"] == first.json()["assessment_id"]


def test_direct_assessment_route_does_not_persist(isolated_history):
    saved = client.post("/api/formulas/FML-T/assessments", json=live_formula())
    direct = client.post("/api/assessments", json=live_formula())
    assert saved.status_code == 200, saved.text
    assert direct.status_code == 200, direct.text
    assert direct.json()["screening_status"] == saved.json()["screening_status"]
    assert direct.json()["regulatory_status"] == "not_assessed"
    assert direct.json()["ap_cl_decision"] is None
    assert direct.json()["acceptance_probability"] is None
    assert direct.json()["assessment_id"] != saved.json()["assessment_id"]

    history = json.loads(isolated_history.read_text(encoding="utf-8"))
    assert [item["assessment_id"] for item in history["runs"]] == [saved.json()["assessment_id"]]
    listed = client.get("/api/assessments")
    assert listed.status_code == 200
    assert [item["assessment_id"] for item in listed.json()["runs"]] == [saved.json()["assessment_id"]]
    assert listed.json()["latest"]["FML-T"]["screening_status"] == saved.json()["screening_status"]


def test_unreadable_history_is_not_replaced(isolated_history):
    isolated_history.write_text("{", encoding="utf-8")
    response = client.post("/api/formulas/FML-T/assessments", json=live_formula())
    assert response.status_code == 500
    assert response.json()["detail"] == "Saved assessment history could not be read."
    assert isolated_history.read_text(encoding="utf-8") == "{"


def test_persistence_error_keeps_existing_history(isolated_history, monkeypatch):
    first = client.post("/api/formulas/FML-T/assessments", json=live_formula())
    assert first.status_code == 200, first.text
    original = isolated_history.read_text(encoding="utf-8")

    def fail_write(path, history):
        raise OSError("disk full")

    monkeypatch.setattr("app.screening_service._write_history", fail_write)
    second = client.post(
        "/api/formulas/FML-T/assessments",
        json=live_formula(ingredients=[{"material_id": "s_toluene_108883", "concentration_percent": 10, "batch_id": "LOT-9"}]),
    )
    assert second.status_code == 500
    assert second.json()["detail"] == "The assessment result could not be saved."
    assert isolated_history.read_text(encoding="utf-8") == original
    assert load_runs()["latest"]["FML-T"]["assessment_id"] == first.json()["assessment_id"]


def test_assessment_failure_is_not_persisted(isolated_history):
    from fastapi import HTTPException

    isolated_history.write_text('{"runs": [], "latest": {}}\n', encoding="utf-8")

    class SavedFormula:
        formula_id = "FML-T"

    def fail(formula):
        raise RuntimeError("engine failed")

    with pytest.raises(ScreeningServiceError) as caught:
        assess_saved_formula("FML-T", SavedFormula(), fail)
    assert caught.value.status_code == 500
    assert caught.value.detail == "The assessment could not be completed."

    def invalid(formula):
        raise HTTPException(status_code=422, detail=[{"loc": ["ingredients"], "msg": "Add at least one ingredient.", "type": "missing"}])

    with pytest.raises(HTTPException) as rejected:
        assess_saved_formula("FML-T", SavedFormula(), invalid)
    assert rejected.value.status_code == 422

    with pytest.raises(ScreeningServiceError) as incomplete:
        assess_saved_formula("FML-T", SavedFormula(), lambda formula: {"screening_status": "changes_required"})
    assert incomplete.value.detail == "The assessment could not be completed."

    assert json.loads(isolated_history.read_text(encoding="utf-8")) == {"runs": [], "latest": {}}


def test_missing_history_file_is_an_empty_saved_list(isolated_history):
    response = client.get("/api/assessments")
    assert response.status_code == 200
    assert response.json() == {"runs": [], "latest": {}}
    assert not isolated_history.exists()


def test_saved_history_latest_is_derived_from_runs(isolated_history):
    first = client.post("/api/formulas/FML-T/assessments", json=live_formula())
    second = client.post(
        "/api/formulas/FML-T/assessments",
        json=live_formula(ingredients=[{"material_id": "s_toluene_108883", "concentration_percent": 10, "batch_id": "LOT-9"}]),
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    payload = json.loads(isolated_history.read_text(encoding="utf-8"))
    payload["latest"]["FML-T"]["screening_status"] = "not_assessed"
    isolated_history.write_text(json.dumps(payload), encoding="utf-8")

    listed = client.get("/api/assessments")
    assert listed.status_code == 200
    body = listed.json()
    assert [item["assessment_id"] for item in body["runs"]] == [
        first.json()["assessment_id"],
        second.json()["assessment_id"],
    ]
    assert body["latest"]["FML-T"]["screening_status"] == second.json()["screening_status"]
    assert body["latest"]["FML-T"]["screening_status"] != "not_assessed"
    assert latest_screening_status("FML-T")["assessment_id"] == second.json()["assessment_id"]


def test_unreadable_history_read_does_not_replace_the_file(isolated_history):
    isolated_history.write_text("{", encoding="utf-8")
    response = client.get("/api/assessments")
    assert response.status_code == 500
    assert response.json()["detail"] == "Saved assessment history could not be read."
    assert isolated_history.read_text(encoding="utf-8") == "{"


def _write_library(isolated_history, formulas, history=None):
    formulas_path = isolated_history.parent / "formulas.json"
    formulas_path.write_text(json.dumps(formulas), encoding="utf-8")
    if history is not None:
        isolated_history.write_text(json.dumps(history), encoding="utf-8")


def _library_formula(**overrides):
    record = {
        "id": "FML-1001",
        "name": "Classroom marker",
        "version": "v1",
        "category": "Markers",
        "ageGroup": "under_12",
        "targetMarkets": ["US"],
        "physicalForm": "Liquid",
        "intendedUse": "Classroom marker on paper.",
        "ownerId": "usr-dana",
        "lifecycle": "active",
        "reviewStatus": "in-review",
        "screeningStatus": "green",
        "screeningCurrent": False,
        "ingredients": [
            {
                "id": "FML-1001-ING-01",
                "name": "Water",
                "rawMaterialId": "water",
                "concentration": 100,
            }
        ],
        "createdAt": "2026-10-01T00:00:00Z",
        "updatedAt": "2026-10-01T00:00:00Z",
    }
    record.update(overrides)
    return record


def test_dashboard_summary_reads_formula_store_and_run_pointer(isolated_history):
    from app.dashboard_service import build_dashboard_summary

    _write_library(
        isolated_history,
        [_library_formula()],
        {
            "runs": [
                {
                    "id": "RUN-1",
                    "formula_id": "FML-1001",
                    "status": "red",
                    "formulaVersion": "v1",
                    "ageGroup": "under_12",
                    "targetMarkets": ["US"],
                    "physicalForm": "Liquid",
                    "intendedUse": "Classroom marker on paper.",
                    "category": "Markers",
                    "ingredientSnapshot": [{"material_id": "water", "concentration": 100.0}],
                    "requiredEvidenceCount": 2,
                    "presentEvidenceCount": 1,
                    "findings": [{"severity": "high", "concern": "Limit exceeded"}],
                }
            ],
            "latest": {"FML-1001": "RUN-1"},
        },
    )
    summary = build_dashboard_summary()
    assert [item["key"] for item in summary["metrics"]] == ["total", "awaiting-review", "missing-evidence"]
    assert summary["metrics"][0]["value"] == 1
    assert summary["metrics"][1]["value"] == 1
    assert summary["metrics"][2]["value"] == 1
    assert summary["statusDistribution"][2] == {"status": "red", "count": 1, "share": 1}
    assert summary["priorityQueue"][0]["screeningStatus"] == "red"
    assert summary["priorityQueue"][0]["mainConcern"] == "Limit exceeded"
    assert summary["outdatedCount"] == 0
    assert summary["outcomeTrend"] == []
    assert summary["dueForReviewCount"] == 0


def test_dashboard_maps_persisted_assessment_history(isolated_history):
    from app.dashboard_service import build_dashboard_summary

    _write_library(
        isolated_history,
        [_library_formula(screeningStatus="green")],
        {
            "runs": [
                {
                    "assessment_id": "A-1",
                    "created_at": "2026-10-09T00:00:00+00:00",
                    "screening_status": "changes_required",
                    "metrics": {"evidence_missing": 2},
                    "input_snapshot": {
                        "formula_id": "FML-1001",
                        "version_id": "v1",
                        "age_group": "under_12",
                        "regions": ["US"],
                        "physical_form": "liquid",
                        "intended_use": "Classroom marker on paper.",
                        "product_category": "Markers",
                        "ingredients": [{"material_id": "water", "concentration_percent": 100}],
                    },
                }
            ],
            "latest": {
                "FML-1001": {
                    "assessment_id": "A-1",
                    "screening_status": "not_assessed",
                    "created_at": "2026-10-09T00:00:00+00:00",
                    "version_id": "v1",
                }
            },
        },
    )
    summary = build_dashboard_summary()
    red = next(item for item in summary["statusDistribution"] if item["status"] == "red")
    green = next(item for item in summary["statusDistribution"] if item["status"] == "green")
    assert red["count"] == 1
    assert green["count"] == 0
    assert summary["priorityQueue"][0]["screeningStatus"] == "red"
    assert summary["priorityQueue"][0]["screeningCurrent"] is True
    assert summary["metrics"][2]["value"] == 1


def test_dashboard_keeps_stored_status_when_no_assessment_exists(isolated_history):
    from app.dashboard_service import build_dashboard_summary

    _write_library(isolated_history, [_library_formula(screeningStatus="amber")], {"runs": [], "latest": {}})
    summary = build_dashboard_summary()
    amber = next(item for item in summary["statusDistribution"] if item["status"] == "amber")
    not_screened = next(item for item in summary["statusDistribution"] if item["status"] == "not-screened")
    assert amber["count"] == 1
    assert not_screened["count"] == 0
    assert summary["outdatedCount"] == 1


def test_dashboard_and_formula_routes_are_registered_on_the_application(isolated_history):
    from fastapi.middleware.cors import CORSMiddleware

    cors = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
    assert "PUT" in cors.kwargs["allow_methods"]
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/api/dashboard" in paths
    assert "/api/formulas" in paths
    assert "/api/formulas/{formula_id}" in paths
    assert "/api/formulas/{id}/assessments" in paths
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["metrics"][0]["value"] == 0
    assert [item["status"] for item in body["statusDistribution"]] == ["green", "amber", "red", "not-screened"]


def test_dashboard_unreadable_history_is_an_error(isolated_history):
    isolated_history.write_text("{", encoding="utf-8")
    _write_library(isolated_history, [_library_formula()])
    response = client.get("/api/dashboard")
    assert response.status_code == 500
    assert response.json()["detail"] == "Saved assessment history could not be read."
    assert isolated_history.read_text(encoding="utf-8") == "{"


def test_formula_library_crud_uses_the_running_application(isolated_history):
    created = client.post(
        "/api/formulas",
        json={"name": "Lab marker", "intendedUse": "Classroom marker on paper.", "ownerId": "usr-dana"},
    )
    assert created.status_code == 201, created.text
    formula_id = created.json()["id"]
    assert formula_id == "FML-1001"
    assert created.json()["screeningStatus"] == "not-screened"

    listed = client.get("/api/formulas", params={"pageSize": 50})
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == formula_id
    assert isinstance(body["items"][0]["missingEvidenceCount"], int)

    updated = client.put(f"/api/formulas/{formula_id}", json={"name": "Lab marker revised"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Lab marker revised"

    duplicate = client.post(f"/api/formulas/{formula_id}/duplicate")
    assert duplicate.status_code == 201, duplicate.text
    assert duplicate.json()["id"] == "FML-1002"
    assert duplicate.json()["screeningStatus"] == "not-screened"

    archived = client.post(f"/api/formulas/{formula_id}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["lifecycle"] == "archived"
    visible = client.get("/api/formulas", params={"pageSize": 50})
    assert [item["id"] for item in visible.json()["items"]] == ["FML-1002"]
    missing = client.get("/api/formulas/FML-9999")
    assert missing.status_code == 404


def test_dashboard_on_the_application_uses_a_saved_assessment(isolated_history):
    formula = _library_formula(
        version="v1",
        intendedUse="Classroom marker on paper.",
        screeningStatus="green",
        ingredients=[
            {
                "id": "FML-1001-ING-01",
                "name": "Toluene",
                "rawMaterialId": "s_toluene_108883",
                "concentration": 5,
                "batchId": "LOT-9",
            }
        ],
    )
    _write_library(isolated_history, [formula])
    saved = client.post("/api/formulas/FML-1001/assessments", json=live_formula(formula_id="FML-1001"))
    assert saved.status_code == 200, saved.text
    mapped = {
        "changes_required": "red",
        "no_issues_found_in_assessed_scope": "green",
    }.get(saved.json()["screening_status"], "amber")

    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    row = next(item for item in body["statusDistribution"] if item["status"] == mapped)
    assert row["count"] == 1
    assert body["priorityQueue"][0]["formulaId"] == "FML-1001"
    assert body["priorityQueue"][0]["screeningStatus"] == mapped
    assert body["priorityQueue"][0]["screeningCurrent"] is True
    unchanged = client.post("/api/assessments", json=live_formula(formula_id="FML-1001"))
    assert unchanged.status_code == 200
    history = json.loads(isolated_history.read_text(encoding="utf-8"))
    assert len(history["runs"]) == 1
