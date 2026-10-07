"""Evidence requirement helpers aligned with the frontend demo rule checks."""

from __future__ import annotations

from typing import Any

COA_REQUIRED_ROLES = {"Colorant", "Opacifier", "Preservative", "Deterrent additive"}


def required_document_types(material: dict[str, Any]) -> list[str]:
    types = ["SDS"]
    if material.get("role") in COA_REQUIRED_ROLES:
        types.append("Certificate of Analysis")
    if material.get("requiresLabReport"):
        types.append("Laboratory Report")
    return types


def summarize_evidence(
    formula: dict[str, Any],
    raw_materials: list[dict[str, Any]],
    documents: list[dict[str, Any]],
) -> dict[str, Any]:
    material_by_id = {m["id"]: m for m in raw_materials}
    requirements: list[dict[str, Any]] = []

    for ingredient in formula.get("ingredients", []):
        name = ingredient.get("name", "")
        ing_id = ingredient.get("id", "")
        rm_id = ingredient.get("rawMaterialId")

        if not rm_id:
            requirements.append(
                {
                    "id": f"{ing_id}-unlinked",
                    "ingredientName": name,
                    "documentType": "SDS",
                    "satisfied": False,
                }
            )
            continue

        material = material_by_id.get(rm_id)
        if not material:
            requirements.append(
                {
                    "id": f"{ing_id}-unknown",
                    "ingredientName": name,
                    "documentType": "SDS",
                    "satisfied": False,
                }
            )
            continue

        for doc_type in required_document_types(material):
            doc = next(
                (
                    d
                    for d in documents
                    if d.get("rawMaterialId") == rm_id and d.get("type") == doc_type
                ),
                None,
            )
            satisfied = doc is not None and doc.get("status") == "available"
            requirements.append(
                {
                    "id": f"{ing_id}-{doc_type}",
                    "ingredientName": name,
                    "rawMaterialId": rm_id,
                    "documentType": doc_type,
                    "satisfied": satisfied,
                    "documentStatus": (doc or {}).get("status", "missing"),
                }
            )

    required_count = len(requirements)
    present_count = sum(1 for r in requirements if r.get("satisfied"))
    missing_count = required_count - present_count
    completeness = 0 if required_count == 0 else round((present_count / required_count) * 100)

    return {
        "requirements": requirements,
        "requiredCount": required_count,
        "presentCount": present_count,
        "missingCount": missing_count,
        "completeness": completeness,
    }
