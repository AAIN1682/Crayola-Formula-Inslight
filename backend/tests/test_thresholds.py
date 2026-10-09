"""Live US/EU threshold workflow. Dummy rules are not used here."""

import io
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.threshold_catalog import load_catalog

client = TestClient(app)
TOLUENE = "s_toluene_108883"


def _pdf(text: str) -> bytes:
    body = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET"
    objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        f"4 0 obj\n<< /Length {len(body)} >>\nstream\n{body}\nendstream\nendobj\n",
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj.encode("latin1"))
    xref = len(out)
    out.extend(b"xref\n0 6\n")
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(out)


def formula(**overrides) -> dict:
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
        "ingredients": [{"material_id": TOLUENE, "concentration_percent": 5, "batch_id": "LOT-9"}],
    }
    payload.update(overrides)
    return payload


@pytest.fixture()
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DOCUMENT_STORAGE_DIR", str(tmp_path))
    return tmp_path


def test_reference_options_follow_the_supplied_files():
    body = client.get("/api/reference").json()
    assert body["regions"] == ["US", "EU"]
    assert [item["category_name"] for item in body["categories"]] == [
        "Markers",
        "Paints",
        "Crayons",
        "Modeling Compounds",
        "Future / Novelty Products",
    ]
    assert body["age_groups"][0]["source_value"] == "Under_12"
    assert body["catalog_coverage_incomplete"] is True
    filenames = {item["filename"] for item in body["source_files"]}
    assert filenames == {"us_ 2.json", "eu_ 2.json"}


def test_dependent_filters_and_no_custom_substance():
    types = client.get("/api/reference/material-types", params={"regions": "US", "category": "Markers", "age_group": "under_12"}).json()
    assert "Solvents" in types["composition_types"]
    assert "Heavy Metals" in types["composition_types"]
    paints = client.get("/api/reference/material-types", params={"regions": "EU", "category": "Paints", "age_group": "Age_12_Plus"}).json()
    assert paints["composition_types"]
    substances = client.get(
        "/api/reference/substances",
        params={"regions": "US,EU", "category": "Markers", "age_group": "under_12", "composition_type": "Solvents"},
    ).json()["substances"]
    toluene = next(item for item in substances if item["substance_id"] == TOLUENE)
    assert "108-88-3" in toluene["label"]
    assert toluene["approved_recipe_ingredient"] is False
    rejected = client.post("/api/assessments", json=formula(ingredients=[{"material_id": "not-a-real-solvent", "concentration_percent": 5}]))
    assert rejected.status_code == 422
    assert "not in the selected" in rejected.text


def test_partial_screen_does_not_require_100_percent_and_flags_legacy_rows():
    assessed = client.post("/api/assessments", json=formula()).json()
    assert assessed["dataset_kind"] == "threshold_reference"
    assert assessed["llm_context"]["formula"]["partial_composition"] is True
    assert assessed["llm_context"]["formula"]["catalog_coverage_incomplete"] is True
    labeling = next(item for item in assessed["llm_context"]["calculated_checks"] if item.get("route") == "concentration" and item.get("status") in {"pass", "fail"})
    assert labeling["status"] == "pass"
    assert labeling["operator"] == ">="
    assert labeling["verified_limit_available"] is True
    high = client.post("/api/assessments", json=formula(ingredients=[{"material_id": TOLUENE, "concentration_percent": 10, "batch_id": "LOT-9"}])).json()
    failed = next(item for item in high["llm_context"]["calculated_checks"] if item.get("rule_id") == labeling["rule_id"])
    assert failed["status"] == "fail"
    assert high["screening_status"] == "changes_required"
    complete = formula(composition_completeness="complete")
    blocked = client.post("/api/assessments", json=complete)
    assert blocked.status_code == 422
    assert "100%" in blocked.text


def test_contaminant_does_not_count_toward_the_ingredient_total():
    catalog = load_catalog()
    lead = next(
        item["substance_id"]
        for item in catalog["substances"].values()
        if item["role"] == "contaminant_analyte" and item.get("cas_number") == "7439-92-1"
    )
    payload = formula(ingredients=[
        {"material_id": TOLUENE, "concentration_percent": 5, "batch_id": "LOT-9"},
        {"material_id": lead, "measured_value": 10, "measured_unit": "ppm", "measurement_kind": "content"},
    ])
    assessed = client.post("/api/assessments", json=payload).json()
    rows = assessed["llm_context"]["formula"]["ingredients"]
    lead_row = next(item for item in rows if item["material_id"] == lead)
    assert lead_row["counts_toward_ingredient_total"] is False
    assert assessed["llm_context"]["composition_total_percent"] == 5


def test_chromium_overlap_is_not_resolved_and_pending_is_not_a_verdict():
    catalog = load_catalog()
    chromium = next(item["substance_id"] for item in catalog["substances"].values() if item["substance_id"].endswith("16065831"))
    payload = formula(
        regions=["EU"],
        ingredients=[{
            "material_id": chromium,
            "measured_value": 0.001,
            "measured_unit": "mg/kg",
            "measured_bound": "exact",
            "measurement_kind": "migration",
            "test_method": "EN 71-3",
            "analyte": "Chromium (III)",
        }],
        test_material_category="en71_cat_ii",
    )
    assessed = client.post("/api/assessments", json=payload).json()
    checks = [item for item in assessed["llm_context"]["calculated_checks"] if item["material_id"] == chromium]
    assert checks
    assert any(item["status"] == "source_review_required" for item in checks)
    assert all(item["status"] != "pass" for item in checks)
    assert all(item["status"] != "fail" for item in checks)
    pending = [
        item for item in assessed["llm_context"]["calculated_checks"]
        if item.get("verification_status") == "Pending Verification"
    ]
    assert all(item["status"] != "pass" and item["status"] != "fail" for item in pending)


def test_migration_without_a_result_needs_test_data():
    catalog = load_catalog()
    lead = next(item["substance_id"] for item in catalog["substances"].values() if item.get("cas_number") == "7439-92-1")
    payload = formula(
        regions=["EU"],
        product_category="Markers",
        test_material_category="en71_cat_ii",
        ingredients=[{"material_id": lead}],
    )
    assessed = client.post("/api/assessments", json=payload).json()
    migration = [
        item for item in assessed["llm_context"]["calculated_checks"]
        if item.get("route") == "migration" and item.get("verification_status") == "Verified"
    ]
    assert migration
    assert any(item["status"] == "needs_test_data" for item in migration)


def test_state_rule_is_not_applied_to_generic_us():
    assessed = client.post("/api/assessments", json=formula()).json()
    state_checks = [item for item in assessed["llm_context"]["calculated_checks"] if "State rule" in item.get("message", "")]
    assert state_checks
    assert all(item["status"] == "not_applicable" for item in state_checks)


def _blank_pdf() -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_pdf_upload_ocr_and_wrong_batch(upload_dir):
    blank = client.post(
        "/api/documents",
        files={"file": ("scan.pdf", io.BytesIO(_blank_pdf()), "application/pdf")},
        data={"document_type": "lab_report", "scope": "material", "material_id": TOLUENE, "formula_id": "FML-T", "version_id": "v1", "regions": "US"},
    )
    # A text PDF is the useful path; a nearly empty extraction reports OCR required.
    saved = client.post(
        "/api/documents",
        files={"file": ("coa.pdf", io.BytesIO(_pdf("Toluene CAS 108-88-3 Batch LOT-OTHER result 4 mg/kg")), "application/pdf")},
        data={
            "document_type": "coa",
            "scope": "material",
            "material_id": TOLUENE,
            "batch_id": "LOT-OTHER",
            "formula_id": "FML-T",
            "version_id": "v1",
            "regions": "US",
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["document_id"].startswith("UPL-")
    assert body["storage"] == "filesystem"
    assert (upload_dir / body["stored_name"]).is_file()
    assert body["extraction_status"] == "extracted"
    assert any(field["name"] == "cas" and field["value"] == "108-88-3" for field in body["extracted_fields"])
    assert body["review_status"] != "confirmed"
    assessed = client.post("/api/assessments", json=formula(document_ids=[body["document_id"]])).json()
    coa = next(item for item in assessed["llm_context"]["evidence_checks"] if item["document_type"] == "coa")
    assert coa["status"] == "mismatched"
    assert "LOT-9" in coa["message"]
    status = client.get(f"/api/documents/{body['document_id']}/status").json()
    assert status["authenticity_status"] == "not_established"
    if blank.status_code == 200 and blank.json().get("ocr_required"):
        assert blank.json()["ocr_message"] == "OCR required"


def test_non_pdf_is_rejected(upload_dir):
    response = client.post(
        "/api/documents",
        files={"file": ("notes.txt", io.BytesIO(b"not a pdf"), "text/plain")},
        data={"document_type": "other", "scope": "finished_product"},
    )
    assert response.status_code == 422
    assert "PDF" in response.text


def test_legacy_rows_stay_unmatched_and_the_assessment_completes():
    payload = formula(
        product_category="Paints",
        ingredients=[],
        legacy_materials=[
            {"name": "Calcium Carbonate Filler F-55", "legacy_id": "RM-112", "concentration_percent": 6},
            {"name": "Gum Arabic Binder (pending catalog entry)", "concentration_percent": 8},
        ],
    )
    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    checks = response.json()["llm_context"]["calculated_checks"]
    assert checks
    assert all(item["status"] == "no_matching_rule" for item in checks)
    assert any("Calcium Carbonate Filler F-55" in item["message"] for item in checks)
    assert all(item["material_id"] != "s_toluene_108883" for item in checks)
    glue = formula(product_category="Glue", ingredients=[], legacy_materials=[{"name": "PVA Resin Solution PV-14", "legacy_id": "RM-124", "concentration_percent": 26}])
    glue_response = client.post("/api/assessments", json=glue)
    assert glue_response.status_code == 200
    assert any("not a category" in item["message"] for item in glue_response.json()["llm_context"]["calculated_checks"])


def test_us_context_does_not_include_eu_rules():
    assessed = client.post("/api/assessments", json=formula()).json()
    rules = assessed["llm_context"]["applicable_verified_rules"] + assessed["llm_context"]["reference_claims_pending_verification"]
    assert rules
    assert all(item["region"] == "US" for item in rules)
    assert "glow_purple" not in str(assessed["llm_context"]["materials"])
