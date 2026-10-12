"""Formula library list enrichment, lifecycle actions, and outdated behaviour."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.formula_store import FORMULAS_PATH

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path, monkeypatch):
    runs = tmp_path / "assessment_runs.json"
    formulas = tmp_path / "formulas.json"
    history = tmp_path / "formula_version_history.json"
    monkeypatch.setenv("ASSESSMENT_RUNS_PATH", str(runs))
    monkeypatch.setattr("app.formula_store.FORMULAS_PATH", formulas)
    monkeypatch.setattr("app.formula_version_history.HISTORY_PATH", history)
    runs.write_text(json.dumps({"runs": [], "latest": {}}), encoding="utf-8")
    history.write_text("{}\n", encoding="utf-8")
    return formulas, runs, history


def _library_formula(**overrides) -> dict:
    base = {
        "id": "FML-1001",
        "name": "Demo marker",
        "version": "v1.0",
        "category": "Markers",
        "ageGroup": "under_12",
        "targetMarkets": ["US"],
        "physicalForm": "Liquid",
        "intendedUse": "Classroom marker on paper.",
        "ownerId": "usr-dana",
        "lifecycle": "active",
        "ingredients": [
            {
                "id": "FML-1001-ING-01",
                "name": "Water",
                "rawMaterialId": "s_water",
                "concentration": 100,
            }
        ],
        "evidenceIds": [],
        "screeningStatus": "not-screened",
        "screeningCurrent": False,
        "reviewStatus": "not-started",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-02T00:00:00Z",
    }
    base.update(overrides)
    return base


def _write_library(path, rows):
    path.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _write_runs(path, runs):
    latest = {}
    for run in runs:
        snapshot = run.get("input_snapshot") or {}
        formula_id = snapshot.get("formula_id")
        if formula_id:
            latest[str(formula_id)] = {
                "assessment_id": run.get("assessment_id"),
                "screening_status": run.get("screening_status"),
                "created_at": run.get("created_at"),
                "version_id": snapshot.get("version_id"),
            }
    path.write_text(json.dumps({"runs": runs, "latest": latest}, indent=2), encoding="utf-8")


def test_list_with_latest_run_and_band_filter(isolated_stores):
    formulas_path, runs_path, _history = isolated_stores
    _write_library(formulas_path, [_library_formula(), _library_formula(id="FML-1002", name="Other")])
    _write_runs(
        runs_path,
        [
            {
                "assessment_id": "RUN-1",
                "created_at": "2026-02-01T10:00:00Z",
                "screening_status": "no_issues_found_in_assessed_scope",
                "input_snapshot": {"formula_id": "FML-1001", "version_id": "v1.0", "ingredients": []},
                "metrics": {"check_pass_rate_percent": 100},
                "explanation": {"status": "generated"},
            },
        ],
    )

    response = client.get(
        "/api/formulas",
        params={"include": "latest_run", "screeningBand": "likely-ap", "pageSize": 25},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["likelyAp"] == 1
    assert body["total"] == 1
    assert body["items"][0]["latestRunSummary"]["displayStatus"] == "pass-leaning"


def test_sort_by_updated_desc_default(isolated_stores):
    formulas_path, runs_path, _history = isolated_stores
    _write_library(
        formulas_path,
        [
            _library_formula(updatedAt="2026-01-01T00:00:00Z"),
            _library_formula(id="FML-1002", name="Newer", updatedAt="2026-03-01T00:00:00Z"),
        ],
    )
    _write_runs(runs_path, [])
    response = client.get("/api/formulas", params={"include": "latest_run", "pageSize": 25})
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert ids[0] == "FML-1002"


def test_outdated_after_ingredient_change(isolated_stores):
    formulas_path, runs_path, _history = isolated_stores
    _write_library(
        formulas_path,
        [
            _library_formula(
                screeningCurrent=True,
                latestRunId="RUN-1",
                ingredients=[
                    {
                        "id": "FML-1001-ING-01",
                        "name": "Water",
                        "rawMaterialId": "s_water",
                        "concentration": 100,
                    }
                ],
            )
        ],
    )
    _write_runs(
        runs_path,
        [
            {
                "assessment_id": "RUN-1",
                "created_at": "2026-02-01T10:00:00Z",
                "screening_status": "changes_required",
                "input_snapshot": {
                    "formula_id": "FML-1001",
                    "version_id": "v1.0",
                    "ingredients": [{"material_id": "s_water", "concentration_percent": 100}],
                },
                "metrics": {"check_pass_rate_percent": 50},
            },
        ],
    )

    listed = client.get("/api/formulas", params={"include": "latest_run", "pageSize": 25})
    assert listed.json()["items"][0]["latestRunSummary"]["outdated"] is False

    updated = client.put(
        "/api/formulas/FML-1001",
        json={
            "ingredients": [
                {
                    "id": "FML-1001-ING-01",
                    "name": "Water",
                    "rawMaterialId": "s_water",
                    "concentration": 99,
                }
            ]
        },
    )
    assert updated.status_code == 200
    assert updated.json()["screeningCurrent"] is False

    listed_after = client.get("/api/formulas", params={"include": "latest_run", "pageSize": 25})
    assert listed_after.json()["items"][0]["latestRunSummary"]["outdated"] is True


def test_duplicate_version_archives_snapshot_and_bumps(isolated_stores):
    formulas_path, _runs, history_path = isolated_stores
    _write_library(formulas_path, [_library_formula(version="v2.1")])
    response = client.post("/api/formulas/FML-1001/duplicate-version")
    assert response.status_code == 200, response.text
    assert response.json()["version"] == "v2.2"
    assert response.json()["screeningStatus"] == "not-screened"

    history = json.loads(history_path.read_text(encoding="utf-8"))
    assert history["FML-1001"][0]["version"] == "v2.1"
    assert len(history["FML-1001"][0]["ingredients"]) == 1


def test_archive_restore_and_delete(isolated_stores):
    formulas_path, _runs, _history = isolated_stores
    _write_library(formulas_path, [_library_formula()])
    archived = client.post("/api/formulas/FML-1001/archive")
    assert archived.status_code == 200
    assert archived.json()["lifecycle"] == "archived"

    restored = client.post("/api/formulas/FML-1001/restore")
    assert restored.status_code == 200
    assert restored.json()["lifecycle"] == "active"

    blocked = client.delete("/api/formulas/FML-1001")
    assert blocked.status_code == 422

    archived_again = client.post("/api/formulas/FML-1001/archive")
    assert archived_again.status_code == 200
    deleted = client.delete("/api/formulas/FML-1001")
    assert deleted.status_code == 204
    missing = client.get("/api/formulas/FML-1001")
    assert missing.status_code == 404
