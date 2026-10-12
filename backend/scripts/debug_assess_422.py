import json
import urllib.request

from fastapi.testclient import TestClient

from app.main import app

formula = json.loads(urllib.request.urlopen("http://127.0.0.1:8000/api/formulas/FML-1028").read())
client = TestClient(app)
body = {
    "formula_id": formula["id"],
    "version_id": formula["version"],
    "name": formula["name"],
    "product_category": "Markers",
    "age_group": formula["ageGroup"],
    "regions": formula["targetMarkets"],
    "physical_form": "liquid",
    "intended_use": formula["intendedUse"],
    "composition_completeness": formula.get("compositionCompleteness") or "complete",
    "document_ids": [],
    "ingredients": [
        {
            "material_id": i["rawMaterialId"],
            "concentration_percent": i["concentration"],
            "batch_id": None,
            "supplier": i.get("supplier"),
            "grade": None,
            "measured_value": None,
            "measured_unit": None,
            "measured_bound": None,
            "measurement_kind": None,
            "test_method": None,
        }
        for i in formula["ingredients"]
        if i.get("rawMaterialId")
    ],
    "legacy_materials": [],
    "generate_explanation": True,
    "assessment_mode": "evidence",
}
response = client.post(f"/api/formulas/{formula['id']}/assessments", json=body)
print(response.status_code)
print(response.text[:2000])
