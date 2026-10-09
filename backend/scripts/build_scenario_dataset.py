"""Write the illustrative scenario dataset. Not imported by the API."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "scenario"
VERSION = "scenario-1.0.0"
PROVENANCE = "synthetic_scenario"

MATERIALS = [
    ("water", "Water", "substance", None, "SCN-SUP-AQUA", "SCN-GRADE-DI", 100, "Carrier used only to exercise the scenario concentration check."),
    ("glow_purple", "Glow in the Dark Purple", "purchased_mixture", None, "SCN-SUP-PIGMENT", "SCN-GRADE-GLOW", 5, "Pigment mixture used to show a configured maximum of 5% w/w."),
    ("mica_patina_silver", "Mica Patina Silver", "purchased_mixture", None, "SCN-SUP-MICA", "SCN-GRADE-MICA", 10, "Optional effect pigment. Not required in every formula."),
    ("sodium_benzoate", "Sodium benzoate", "substance", "532-32-1", "SCN-SUP-PRES", "SCN-GRADE-SB", 0.3, "Preservative row for the configured 0.3% w/w maximum."),
    ("potassium_sorbate", "Potassium sorbate", "substance", "24634-61-5", "SCN-SUP-PRES", "SCN-GRADE-PS", 0.3, "Optional preservative. Evaluated only when present."),
    ("propylene_glycol", "Propylene glycol", "substance", "57-55-6", "SCN-SUP-SOLVENT", "SCN-GRADE-PG", 8, "Optional solvent. Evaluated only when present."),
]


def base(**extra):
    record = {
        "provenance": PROVENANCE,
        "dataset_version": VERSION,
        "is_regulatory_requirement": False,
    }
    record.update(extra)
    return record


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    materials = []
    rules = []
    for material_id, name, kind, cas, supplier, grade, maximum, role in MATERIALS:
        materials.append(base(
            material_id=material_id,
            name=name,
            kind=kind,
            cas=cas,
            supplier_id=supplier,
            grade_id=grade,
            source_document_ids=[],
            verified_crayola_ingredient=False,
            components=[],
            aliases=[],
            notes="Illustrative catalog identity for scenario assessment. Not an approved Crayola material.",
            role=role,
        ))
        rules.append(base(
            rule_id=f"SCN-MAX-{material_id}",
            material_id=material_id,
            product_categories=["paint"],
            age_groups=["under_12", "12_and_above"],
            regions=["US", "EU"],
            property="concentration_percent",
            operator="<=",
            threshold=maximum,
            unit="percent_w_w",
            basis="as_supplied_material_in_finished_formula",
            measurement_basis="as_supplied_material_in_finished_formula",
            enabled=True,
            is_regulatory_limit=False,
            source_document_ids=[],
            rule_type="concentration_cap",
            scope="finished_formula_ingredient",
            category="paint",
            required_test_method=None,
            criticality="high" if material_id == "glow_purple" else "medium",
            review_status="synthetic_scenario",
            role=f"Editable software-testing maximum of {maximum}% w/w for {name} in paint. Illustrative configuration, not a safety recommendation or regulatory limit. The same maximum is used for US and EU because this scenario does not define a regional difference.",
        ))

    documents = []

    def add_document(document_id: str, document_type: str, scope: str, summary: str, role: str, **fields):
        structured = fields.pop("structured_content")
        documents.append(base(
            document_id=document_id,
            filename=f"{document_id}.json",
            document_type=document_type,
            scope=scope,
            review_status="scenario_complete",
            representative_sample=False,
            eligible_as_verified_evidence=False,
            summary=summary,
            structured_content=structured,
            role=role,
            notes="Synthetic scenario record. Not a laboratory report, supplier certificate, Duke letter, or ACMI decision.",
            **fields,
        ))

    raw = {
        "water": ("SCN-SUP-AQUA", "SCN-GRADE-DI", "SCN-BATCH-WATER"),
        "glow_purple": ("SCN-SUP-PIGMENT", "SCN-GRADE-GLOW", "SCN-BATCH-GLOW"),
        "mica_patina_silver": ("SCN-SUP-MICA", "SCN-GRADE-MICA", "SCN-BATCH-MICA"),
        "sodium_benzoate": ("SCN-SUP-PRES", "SCN-GRADE-SB", "SCN-BATCH-BENZ"),
        "potassium_sorbate": ("SCN-SUP-PRES", "SCN-GRADE-PS", "SCN-BATCH-PS"),
        "propylene_glycol": ("SCN-SUP-SOLVENT", "SCN-GRADE-PG", "SCN-BATCH-PG"),
    }
    names = {item[0]: item[1] for item in MATERIALS}
    for material_id, (supplier, grade, batch) in raw.items():
        add_document(
            f"SCN-SDS-{material_id.upper()}",
            "sds",
            "raw_material",
            f"Scenario SDS summary for {names[material_id]}. Supplier {supplier}, grade {grade}. Identity and handling notes only. No finished-formula concentration limit is stated.",
            "Material SDS summary reused across formula versions when the same supplier and grade remain applicable.",
            material_id=material_id,
            supplier_id=supplier,
            grade_id=grade,
            batch_id=None,
            formula_id=None,
            version_id=None,
            regions=[],
            product_category=None,
            structured_content={
                "supplier_id": supplier,
                "grade_id": grade,
                "identity": names[material_id],
                "sections": ["identification", "composition", "handling"],
            },
        )
        add_document(
            f"SCN-COA-{material_id.upper()}",
            "coa",
            "raw_material",
            f"Scenario CoA summary for {names[material_id]}, supplier {supplier}, batch {batch}. Assay is recorded as a raw-material measurement and is not a finished-formula limit.",
            "Material and batch CoA summary. A different batch does not satisfy this record.",
            material_id=material_id,
            supplier_id=supplier,
            grade_id=grade,
            batch_id=batch,
            formula_id=None,
            version_id=None,
            regions=[],
            product_category=None,
            structured_content={
                "supplier_id": supplier,
                "batch_id": batch,
                "assay_result": "within scenario specification",
                "measurement_basis": "as_supplied_raw_material",
            },
        )

    add_document(
        "SCN-SDS-GLOW-OTHER-SUPPLIER",
        "sds",
        "raw_material",
        "Scenario SDS for Glow in the Dark Purple from supplier SCN-SUP-OTHER. It does not match SCN-SUP-PIGMENT.",
        "Negative match: same material name, different supplier. Must not satisfy the pigment SDS requirement.",
        material_id="glow_purple",
        supplier_id="SCN-SUP-OTHER",
        grade_id="SCN-GRADE-OTHER",
        batch_id=None,
        formula_id=None,
        version_id=None,
        regions=[],
        product_category=None,
        structured_content={"supplier_id": "SCN-SUP-OTHER", "grade_id": "SCN-GRADE-OTHER"},
    )

    finished = [
        ("SCN-LAB-V1", "F-PURPLE-PAINT", "v1", ["US"], "Purple Effect Paint v1", 8),
        ("SCN-LAB-V2", "F-PURPLE-PAINT", "v2", ["US"], "Purple Effect Paint v2", 4),
        ("SCN-LAB-V2D", "F-PURPLE-PAINT", "v2d", ["US"], "Purple Effect Paint v2d", 4),
        ("SCN-LABEL-V1", "F-PURPLE-PAINT", "v1", ["US"], "Purple Effect Paint v1", None),
        ("SCN-LABEL-V2", "F-PURPLE-PAINT", "v2", ["US"], "Purple Effect Paint v2", None),
        ("SCN-LABEL-V2D", "F-PURPLE-PAINT", "v2d", ["US"], "Purple Effect Paint v2d", None),
        ("SCN-LABEL-GAP", "F-PURPLE-PAINT-GAP", "v1", ["US"], "Purple Effect Paint gap case", None),
        ("SCN-LABEL-V1-EU", "F-PURPLE-PAINT", "v1", ["EU"], "Purple Effect Paint v1 EU label", None),
    ]
    for document_id, formula_id, version_id, regions, title, pigment in finished:
        is_lab = document_id.startswith("SCN-LAB-")
        if is_lab:
            summary = (
                f"Scenario finished-formula test summary for {title}, version {version_id}, region {', '.join(regions)}. "
                "Fictional test SCN-TEST-VISC-01 recorded 420 mPa·s against an editable scenario maximum of 800 mPa·s "
                "on a finished-formula as-mixed basis. This is not an ASTM or EN method and not a legal requirement."
            )
            structured = {
                "test_id": "SCN-TEST-VISC-01",
                "test_name": "Scenario viscosity spot check",
                "unit": "mPa·s",
                "measurement_basis": "finished_formula_as_mixed",
                "result": 420,
                "scenario_limit": 800,
                "operator": "<=",
                "pigment_percent_recorded_on_sample": pigment,
                "note": "Fictional scenario test. Not an ASTM/EN method and not a legal requirement.",
            }
            role = "Finished-formula test summary for this formula version and region only. Another version does not reuse it."
            document_type = "lab_report"
        else:
            summary = (
                f"Scenario label-review summary for {title}, version {version_id}, region {', '.join(regions)}. "
                "The review records that the scenario label text names the product and market. It is not a legal labeling determination."
            )
            structured = {
                "review_id": document_id,
                "markets": regions,
                "version_id": version_id,
                "outcome": "scenario label text recorded",
            }
            role = "Label-review summary for this formula version and region. A different market does not reuse it."
            document_type = "label"
        add_document(
            document_id,
            document_type,
            "finished_product",
            summary,
            role,
            material_id=None,
            supplier_id=None,
            grade_id=None,
            batch_id=None,
            formula_id=formula_id,
            version_id=version_id,
            regions=regions,
            product_category="paint",
            structured_content=structured,
        )

    add_document(
        "SCN-DOC-UNRELATED",
        "label",
        "finished_product",
        "Unrelated scenario note for a marker formula. It must not be retrieved for Purple Effect Paint.",
        "Negative retrieval record. Not part of the paint scenario.",
        material_id=None,
        supplier_id=None,
        grade_id=None,
        batch_id=None,
        formula_id="F-UNRELATED-MARKER",
        version_id="v9",
        regions=["UK"],
        product_category="washable_marker",
        structured_content={"formula_id": "F-UNRELATED-MARKER"},
    )

    requirements = [
        base(
            requirement_id="REQ-SDS",
            document_type="sds",
            scope="raw_material",
            applicable_categories=["paint"],
            applicable_regions=["US", "EU"],
            material_roles=["purchased_mixture", "substance"],
            material_ids=[],
            required_match_fields=["material_id", "supplier_id", "grade_id"],
            match_fields=["material_id", "supplier_id", "grade_id"],
            condition="Required for each material present, matched to the scenario supplier and grade. Not required for materials that are absent.",
            requirement_basis="synthetic_scenario",
            source_reference="Scenario evidence workflow. Not a verified external filing requirement.",
            criticality="medium",
            review_status="synthetic_scenario",
            policy_basis="synthetic_scenario",
            role="Material SDS must match material, supplier, and grade.",
        ),
        base(
            requirement_id="REQ-COA",
            document_type="coa",
            scope="raw_material",
            applicable_categories=["paint"],
            applicable_regions=["US", "EU"],
            material_roles=["purchased_mixture", "substance"],
            material_ids=[],
            required_match_fields=["material_id", "supplier_id", "batch_id"],
            match_fields=["material_id", "supplier_id", "batch_id"],
            condition="Required for the entered material, supplier, and batch. A different batch is a mismatch.",
            requirement_basis="synthetic_scenario",
            source_reference="Scenario evidence workflow. Batch identity is the CoA scope.",
            criticality="medium",
            review_status="synthetic_scenario",
            policy_basis="synthetic_scenario",
            role="Material CoA must match material, supplier, and batch.",
        ),
        base(
            requirement_id="REQ-LAB",
            document_type="lab_report",
            scope="finished_product",
            applicable_categories=["paint"],
            applicable_regions=["US", "EU"],
            material_roles=[],
            material_ids=[],
            required_match_fields=["formula_id", "version_id", "region"],
            match_fields=["formula_id", "version_id", "region"],
            condition="Required for this finished formula version and region. A report from another version does not apply.",
            requirement_basis="synthetic_scenario",
            source_reference="Scenario evidence workflow. Fictional test SCN-TEST-VISC-01 is not an ASTM/EN method.",
            criticality="medium",
            review_status="synthetic_scenario",
            policy_basis="synthetic_scenario",
            role="Finished-formula test summary must match formula, version, and region.",
        ),
        base(
            requirement_id="REQ-LABEL",
            document_type="label",
            scope="finished_product",
            applicable_categories=["paint"],
            applicable_regions=["US", "EU"],
            material_roles=[],
            material_ids=[],
            required_match_fields=["formula_id", "version_id", "region"],
            match_fields=["formula_id", "version_id", "region"],
            condition="Required for this formula version and region.",
            requirement_basis="synthetic_scenario",
            source_reference="Scenario evidence workflow. Not a legal labeling determination.",
            criticality="medium",
            review_status="synthetic_scenario",
            policy_basis="synthetic_scenario",
            role="Label-review summary must match formula, version, and region.",
        ),
    ]

    def formula(example_id, description, formula_id, version_id, water, pigment, benzoate, pigment_batch):
        return base(
            example_id=example_id,
            description=description,
            role="Illustrative paint composition for scenario assessment. Not a Crayola recipe.",
            input={
                "formula_id": formula_id,
                "name": "Purple Effect Paint",
                "product_category": "paint",
                "age_group": "under_12",
                "regions": ["US"],
                "physical_form": "liquid",
                "intended_use": "Brush application to paper",
                "generate_explanation": False,
                "assessment_mode": "scenario",
                "version_id": version_id,
                "ingredients": [
                    {"material_id": "water", "concentration_percent": water, "batch_id": "SCN-BATCH-WATER"},
                    {"material_id": "glow_purple", "concentration_percent": pigment, "batch_id": pigment_batch},
                    {"material_id": "sodium_benzoate", "concentration_percent": benzoate, "batch_id": "SCN-BATCH-BENZ"},
                ],
            },
        )

    examples = [
        formula("SCN-A", "Case A. Glow in the Dark Purple is above the configured 5% maximum. Matching scenario evidence is complete.", "F-PURPLE-PAINT", "v1", 91.8, 8, 0.2, "SCN-BATCH-GLOW"),
        formula("SCN-B", "Case B. Revised composition at 4% pigment with separate finished-product evidence for v2.", "F-PURPLE-PAINT", "v2", 95.8, 4, 0.2, "SCN-BATCH-GLOW"),
        formula("SCN-C", "Case C. Same quantities as Case B. Finished-product test report is omitted.", "F-PURPLE-PAINT-GAP", "v1", 95.8, 4, 0.2, "SCN-BATCH-GLOW"),
        formula("SCN-D", "Case D. Same quantities as Case B. Pigment batch does not match the scenario CoA.", "F-PURPLE-PAINT", "v2d", 95.8, 4, 0.2, "SCN-BATCH-GLOW-OTHER"),
    ]

    chunks = []
    facts = []
    for document in documents:
        text = document["summary"]
        chunks.append({
            "chunk_id": f"{document['document_id']}:SUMMARY",
            "document_id": document["document_id"],
            "page": None,
            "paragraph": 1,
            "text": text,
            "trust": "synthetic_scenario",
            "provenance": PROVENANCE,
            "dataset_version": VERSION,
        })
        facts.append(base(
            fact_id=f"FACT-{document['document_id']}",
            document_id=document["document_id"],
            material_id=document.get("material_id"),
            formula_id=document.get("formula_id"),
            version_id=document.get("version_id"),
            text=text,
            structured_content=document.get("structured_content"),
            role="Structured scenario excerpt for explanation. Not a verified measurement.",
        ))

    issues = [base(
        issue_id="ISSUE-UNRELATED-MARKER",
        document_ids=["SCN-DOC-UNRELATED"],
        summary="Unrelated marker note. Do not apply it to Purple Effect Paint.",
        role="Negative retrieval check. Must stay out of paint assessments.",
    )]

    manifest = base(
        dataset_kind="scenario",
        purpose="Editable illustrative thresholds and evidence for scenario assessment.",
        role="Authoritative retrieval set when assessment_mode is scenario. Evidence mode does not read this folder.",
        materials=len(materials),
        rules=len(rules),
        documents=len(documents),
        examples=[item["example_id"] for item in examples],
        limitations=[
            "Thresholds are software-testing configuration, not safety recommendations or regulatory limits.",
            "Evidence records are synthetic and are not laboratory reports, supplier certificates, Duke letters, or ACMI decisions.",
            "No AP or CL decision is represented.",
            "These compositions are not Crayola recipes or approved materials.",
        ],
    )

    files = {
        "materials.json": materials,
        "rules.json": rules,
        "documents.json": documents,
        "evidence_requirements.json": requirements,
        "example_formulas.json": examples,
        "source_chunks.json": chunks,
        "extracted_facts.json": facts,
        "source_issues.json": issues,
        "regulatory_reference_rows.json": [],
        "historical_cases.json": [],
        "manifest.json": manifest,
    }
    for name, payload in files.items():
        (ROOT / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {ROOT}")


if __name__ == "__main__":
    main()
