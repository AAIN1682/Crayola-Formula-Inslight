"""Append one AP-leaning demo assessment run for each green formula in formulas.json.

The run goes through the normal assessment path (checks, evidence, repair,
validation, confidence clamping, scoring, history file). Only three inputs are
supplied by this script, and only inside this process:
  * screening limits for the legacy RM-xxx ingredients these formulas use,
  * an on-file CoA and SDS for each ingredient,
  * a fixed AP-leaning model response in place of the Azure call.

Nothing is written to substance_limits.json or the upload index. Re-running the
script replaces the runs it created earlier.

Usage: .venv/bin/python scripts/build_ap_demo_runs.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import openai  # noqa: E402

from app import threshold_catalog, uploads  # noqa: E402
from app.config import DATA  # noqa: E402
from app.main import Formula, _assessment  # noqa: E402
from app.screening_service import _latest_index, _write_history, append_assessment, load_runs, runs_path  # noqa: E402

MARKER = "demo-ap-run"
FORM_TO_API = {"Liquid": "liquid", "Gel": "gel", "Paste": "paste", "Solid stick": "solid", "Powder": "powder"}
LIMITS = {
    "RM-101": (90, "7732-18-5", "Solvents"),
    "RM-102": (20, "56-81-5", "Additives"),
    "RM-103": (10, "147-14-8", "Pigments"),
    "RM-105": (10, "6358-31-2", "Pigments"),
    "RM-106": (5, "1333-86-4", "Pigments"),
    "RM-107": (30, "25035-69-2", "Binders"),
    "RM-110": (1, "122-99-6", "Preservatives"),
    "RM-112": (40, "471-34-1", "Fillers"),
    "RM-113": (70, "8002-74-2", "Waxes"),
    "RM-114": (5, "557-04-0", "Additives"),
    "RM-115": (5, "9004-62-0", "Thickeners"),
    "RM-116": (40, "9005-25-8", "Fillers"),
    "RM-117": (5, "8042-47-5", "Additives"),
    "RM-118": (15, "56-81-5", "Additives"),
    "RM-119": (10, "7647-14-5", "Additives"),
    "RM-120": (1, "77-92-9", "Additives"),
    "RM-121": (0.05, "3734-33-6", "Additives"),
    "RM-124": (35, "9002-89-5", "Binders"),
    "RM-125": (15, "13463-67-7", "Pigments"),
}
SUPPLIERS = {
    "RM-101": "Clearwater Process Supply",
    "RM-102": "Polyol Specialties Inc.",
    "RM-103": "Chromatech Dispersions",
    "RM-105": "Chromatech Dispersions",
    "RM-106": "Chromatech Dispersions",
    "RM-107": "Keystone Polymers",
    "RM-110": "Marlow Specialty Chemicals",
    "RM-112": "Northfield Minerals",
    "RM-113": "Summit Wax Co.",
    "RM-114": "Summit Wax Co.",
    "RM-115": "Keystone Polymers",
    "RM-116": "Harvest Starch Ltd.",
    "RM-117": "Summit Wax Co.",
    "RM-118": "Polyol Specialties Inc.",
    "RM-119": "Northfield Minerals",
    "RM-120": "Marlow Specialty Chemicals",
    "RM-121": "Marlow Specialty Chemicals",
    "RM-124": "Keystone Polymers",
    "RM-125": "Northfield Minerals",
}
PAST = {
    "Markers": [
        (94, "FX-2245", "Washable Marker - Hot Magenta", 2023, "Same water-based ink system and preservative level. Accepted on first submission.", "AP", "Washable ink base, preservative, under 12"),
        (88, "FX-1987", "Washable Neon Marker - Flame Orange", 2022, "Reviewer asked for the pigment dispersion CoA before closing the review.", "AP, 2nd round", "Pigment dispersion, washable marker"),
        (76, "PS-0876", "Washable Paint Stick - Fuchsia", 2021, "Preservative above the screening ceiling for ages 3+.", "CL", "Preservative level, under 12"),
    ],
    "Paints": [
        (93, "PT-3310", "Washable Poster Paint - Sun Yellow", 2023, "Same acrylic binder and filler loading. Accepted on first submission.", "AP", "Acrylic binder, filler, under 12"),
        (86, "PT-2984", "Tempera Paint - Ocean Blue", 2022, "Reviewer requested the titanium white dispersion SDS before closing.", "AP, 2nd round", "White dispersion, tempera base"),
        (74, "PT-2511", "Finger Paint - Berry Burst", 2021, "Bittering agent and preservative documentation were incomplete at review.", "CL", "Finger paint, preservative, under 12"),
    ],
    "Crayons": [
        (95, "CR-4102", "Classic Crayon - Midnight Black", 2023, "Same paraffin and filler ratio. Accepted on first submission.", "AP", "Paraffin wax, carbonate filler, under 12"),
        (87, "CR-3876", "Jumbo Crayon - Sunflower", 2022, "Reviewer asked for the yellow pigment CoA before closing.", "AP, 2nd round", "Yellow pigment, wax crayon"),
        (72, "CR-3320", "Metallic Crayon - Copper", 2021, "Metallic pigment above the crayon screening ceiling.", "CL", "Pigment loading, under 12"),
    ],
    "Modeling Compounds": [
        (92, "MC-1520", "Starter Dough - Sky Blue", 2023, "Same starch, salt, and softener system. Accepted on first submission.", "AP", "Starch base, salt, softener, under 12"),
        (85, "MC-1388", "Scented Dough - Lemon", 2022, "Reviewer requested the fragrance allergen statement before closing.", "AP, 2nd round", "Modeling dough, under 12"),
        (73, "MC-1104", "Glitter Dough - Silver", 2021, "Glitter particle size documentation did not support the age band.", "CL", "Modeling dough, glitter, under 12"),
    ],
    "Glue": [
        (94, "GL-0912", "Washable School Glue - Clear", 2023, "Same PVA resin solution and preservative. Accepted on first submission.", "AP", "PVA resin, preservative, under 12"),
        (86, "GL-0855", "Gel Glue - Blue Tint", 2022, "Reviewer requested the resin supplier SDS before closing.", "AP, 2nd round", "PVA gel, school glue"),
        (71, "GL-0730", "Glitter Glue - Gold", 2021, "Glitter and solvent documentation did not support the age band.", "CL", "Glitter glue, under 12"),
    ],
}


def _fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _documents(formula: dict) -> list[dict]:
    rows = []
    for ingredient in formula["ingredients"]:
        material_id = ingredient["rawMaterialId"]
        name = ingredient["name"]
        cas = LIMITS[material_id][1]
        supplier = SUPPLIERS[material_id]
        batch = f"{material_id.replace('RM-', 'LOT-')}-26A"
        for kind, label, text in (
            (
                "coa",
                "Certificate of Analysis (CoA)",
                f"CERTIFICATE OF ANALYSIS\n{name}\nSupplier: {supplier}\nCAS: {cas}\nBatch / lot: {batch}\n"
                "Appearance: conforms\nIdentity (IR): conforms\nAssay: 99.2% w/w\nLead (Pb): < 1 ppm\nArsenic (As): < 0.5 ppm\n"
                "Microbial count: < 100 CFU/g\nDisposition: released",
            ),
            (
                "sds",
                "Safety Data Sheet (SDS)",
                f"SAFETY DATA SHEET\n{name}\nSupplier: {supplier}\nCAS: {cas}\n"
                "Section 2 Hazard identification: not classified as hazardous.\n"
                "Section 3 Composition: single declared component.\n"
                "Section 11 Toxicological information: no acute toxicity classification.",
            ),
        ):
            document_id = f"DOC-{kind.upper()}-{formula['id']}-{material_id}"
            filename = f"{kind.upper()}_{name.replace(' ', '_')}.pdf"
            rows.append({
                "document_id": document_id,
                "original_filename": filename,
                "filename": filename,
                "storage": "none",
                "page_count": 1,
                "media_type": "application/pdf",
                "document_type": kind,
                "document_type_label": label,
                "scope": "material",
                "material_id": material_id,
                "material_ids": [material_id],
                "supplier": supplier,
                "grade": None,
                "batch_id": batch if kind == "coa" else None,
                "formula_id": formula["id"],
                "version_id": formula["version"],
                "regions": list(formula["targetMarkets"]),
                "test_scope": None,
                "created_at": formula.get("lastScreenedAt") or formula["updatedAt"],
                "extraction_status": "extracted",
                "processing_status": "processed",
                "evidence_status": "accepted",
                "ocr_required": False,
                "ocr_message": None,
                "review_status": "confirmed",
                "authenticity_status": "confirmed",
                "applicability_status": "confirmed",
                "parts": [{"page": 1, "text": text}],
                "extracted_fields": [],
            })
    return rows


def _model_response(formula: dict) -> dict:
    rows = formula["ingredients"]
    findings = [
        {
            "finding_id": f"F-{index + 1:03d}",
            "ingredient_id": row["rawMaterialId"],
            "status": "meets_rule",
            "severity": "informational",
            "risk_level": None,
            "title": f"{row['name']} is within its screening limit",
            "observed_value": row["concentration"],
            "unit": "%",
            "rule_id": f"limit:{row['rawMaterialId']}",
            "reason": "Pointer: no concentration change is needed for this limit.",
            "limit_basis": "supplied_check",
            "source_ids": [f"LIMIT:{row['rawMaterialId']}", f"limit:{row['rawMaterialId']}"],
            "required_action": "No change required.",
        }
        for index, row in enumerate(rows)
    ]
    listed = ", ".join(f"{row['name']} at {_fmt(row['concentration'])}%" for row in rows[:4])
    past = PAST.get(formula["category"]) or PAST["Markers"]
    return {
        "assessment_summary": (
            f"All {len(rows)} declared ingredients of {formula['name']} are within their supplied screening limits, including {listed}. "
            "Every ingredient has a material CoA and SDS on file, and no concentration check failed. "
            "No source conflict or evidence gap remains in the assessed scope, so the preliminary direction is AP-leaning. "
            "This is a preliminary screening result, not an official certification decision."
        ),
        "score_headline": f"{formula['name']} screens AP-leaning: every ingredient is within its limit and all required documents are on file.",
        "screening_outcome": "no_supported_concern_in_scope",
        "preliminary_prediction": {
            "outcome": "ap_leaning",
            "basis": "All supplied concentration checks passed and every required CoA and SDS is on file.",
            "analysis_confidence": "high",
            "confidence_reason": "Every ingredient was compared with a supplied limit and all evidence requirements are satisfied.",
            "numeric_estimate": None,
            "estimate_kind": "not_available",
            "blocking_uncertainties": [],
            "source_ids": [f"LIMIT:{row['rawMaterialId']}" for row in rows],
        },
        "findings": findings,
        "missing_documents": [],
        "source_conflicts": [],
        "recommendations": [{
            "priority": "low",
            "action": "Keep the supplier CoA and SDS for each ingredient current at the next batch change.",
            "reason": "The current documents support this screening result for the recorded batches.",
            "related_finding_id": None,
            "fix_kind": "review",
            "source_ids": [],
        }],
        "alerts": [],
        "next_actions": [{
            "priority": "low",
            "action": "Proceed to toxicologist review with the current formula and document set.",
            "reason": "No open screening issue remains in the assessed scope.",
            "related_finding_id": None,
        }],
        "version_comparison": None,
        "limitations": ["Preliminary screening result. Not an official AP or CL certification decision."],
        "retrieved_history": {
            "reviewed_count": 14,
            "comment": {
                "quote": f"{past[0][2]} used the same base system and was accepted on first submission with complete supplier documents.",
                "attribution": f"Toxicologist comment on {past[0][1]} ({past[0][3]})",
            },
            "decisions": [
                {"similarity": s, "code": c, "name": n, "year": y, "note": note, "outcome": o, "matched_on": m}
                for s, c, n, y, note, o, m in past
            ],
        },
    }


def _request(formula: dict) -> dict:
    return {
        "formula_id": formula["id"],
        "version_id": formula["version"],
        "name": formula["name"],
        "product_category": formula["category"],
        "age_group": formula["ageGroup"],
        "regions": list(dict.fromkeys(formula["targetMarkets"])),
        "physical_form": FORM_TO_API.get(formula["physicalForm"], formula["physicalForm"].lower()),
        "intended_use": formula["intendedUse"],
        "composition_completeness": formula.get("compositionCompleteness") or "partial",
        "us_states": [],
        "document_ids": [],
        "intended_age_detail": formula.get("intendedAgeDetail") or None,
        "toy_childcare_scope": formula.get("toyChildcareScope") or None,
        "component_type": formula.get("componentType") or None,
        "test_material_category": formula.get("testMaterialCategory") or None,
        "ingredients": [
            {
                "material_id": row["rawMaterialId"],
                "concentration_percent": row["concentration"],
                "batch_id": None,
                "supplier": SUPPLIERS[row["rawMaterialId"]],
                "grade": None,
            }
            for row in formula["ingredients"]
        ],
        "legacy_materials": [],
        "generate_explanation": True,
        "assessment_mode": "evidence",
    }


def _install(formula: dict, response: dict, documents: list[dict]) -> None:
    catalog = threshold_catalog.load_catalog()
    if not any(item["category_name"] == formula["category"] for item in catalog["categories"]):
        catalog["categories"].append({"category_id": threshold_catalog._slug(formula["category"]), "category_name": formula["category"]})
    limits = {}
    offered = []
    for row in formula["ingredients"]:
        material_id = row["rawMaterialId"]
        limit, cas, kind = LIMITS[material_id]
        catalog["substances"][material_id] = {
            "substance_id": material_id,
            "name": row["name"],
            "cas_number": cas,
            "names": [row["name"]],
            "regions": list(formula["targetMarkets"]),
            "composition_types": [kind],
            "identity_flags": [],
            "role": "formulation_ingredient",
            "role_label": "Formulation ingredient",
            "approved_recipe_ingredient": False,
        }
        limits[material_id] = {"substance_id": material_id, "substance": row["name"], "cas_number": cas, "max_percent": limit}
        offered.append({"substance_id": material_id, "role": "formulation_ingredient"})
    threshold_catalog.load_substance_limits = lambda: {"filename": threshold_catalog.LIMITS_FILE, "by_id": limits}
    threshold_catalog.substances_for = lambda *_args, **_kwargs: offered
    uploads.documents_for_formula = lambda _formula: documents

    text = json.dumps(response)

    class Completions:
        def create(self, **_request):
            return SimpleNamespace(
                id=f"chatcmpl-{MARKER}-{formula['id']}",
                _request_id=f"{MARKER}-{formula['id']}",
                usage=None,
                choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason="stop")],
            )

    class Client:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=Completions())

    openai.AzureOpenAI = Client


def main() -> None:
    formulas = [item for item in json.loads((DATA / "formulas.json").read_text(encoding="utf-8")) if item.get("screeningStatus") == "green"]
    history = load_runs()
    kept = [run for run in history["runs"] if not str((run.get("execution") or {}).get("request_id") or "").startswith(MARKER)]
    if len(kept) != len(history["runs"]):
        _write_history(runs_path(), {"runs": kept, "latest": _latest_index(kept)})
    for formula in formulas:
        missing = [row["rawMaterialId"] for row in formula["ingredients"] if row["rawMaterialId"] not in LIMITS]
        if missing:
            print(f"skip {formula['id']}: no demo limit for {', '.join(missing)}")
            continue
        _install(formula, _model_response(formula), _documents(formula))
        result = _assessment(Formula.model_validate(_request(formula)))
        preliminary = result.get("preliminary_assessment") or {}
        score = preliminary.get("risk_score") or {}
        if result.get("screening_status") != "no_issues_found_in_assessed_scope" or score.get("band") != "ap":
            raise SystemExit(f"{formula['id']} did not produce an AP result: {result.get('screening_status')} {score}")
        append_assessment(result)
        print(f"{formula['id']} {formula['name']}: {result['screening_status_label']}, score {score.get('score')} {score.get('band_label')}, confidence {score.get('confidence')}")


if __name__ == "__main__":
    main()
