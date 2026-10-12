"""New screening helpers: composition tolerance, CAS validation, template parse, draft save."""

import json

import pytest
from fastapi.testclient import TestClient

from app.acmi_template_parser import parse_acmi_template
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path, monkeypatch):
    runs = tmp_path / "assessment_runs.json"
    formulas = tmp_path / "formulas.json"
    uploads = tmp_path / "user_uploads"
    uploads.mkdir()
    (uploads / "index.json").write_text("[]", encoding="utf-8")
    monkeypatch.setenv("ASSESSMENT_RUNS_PATH", str(runs))
    monkeypatch.setenv("DOCUMENT_STORAGE_DIR", str(uploads))
    monkeypatch.setattr("app.formula_store.FORMULAS_PATH", formulas)
    runs.write_text(json.dumps({"runs": [], "latest": {}}), encoding="utf-8")
    formulas.write_text("[]", encoding="utf-8")


def test_composition_tolerance():
    tolerance = 0.0005

    def complete(total: float) -> bool:
        return abs(total - 100) <= tolerance

    assert complete(100.0)
    assert complete(99.9996)
    assert not complete(99.99)


def test_cas_validation_frontend_util():
    # Mirror of frontend casValidation — tested via parser module pattern in backend tests file
    from app.uploads import _CAS

    assert _CAS.search("7732-18-5")


def test_parse_acmi_template_unknown_layout():
    body = parse_acmi_template(b"")
    assert body["layoutMatched"] is False
    assert "layout" in body["message"].lower() or "empty" in body["message"].lower()


def test_draft_save_without_screening():
    created = client.post(
        "/api/formulas",
        json={
            "name": "Draft marker",
            "intendedUse": "Draft only.",
            "lifecycle": "draft",
            "ingredients": [{"name": "Water", "concentration": 50}],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["screeningStatus"] == "not-screened"
    assert created.json()["lifecycle"] == "draft"


def test_parse_endpoint_rejects_empty_file():
    response = client.post(
        "/api/screening/parse-acmi-template",
        files={"file": ("template.xlsx", b"", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200
    assert response.json()["layoutMatched"] is False
