"""Deterministic matching and assessment. Thresholds stay in packaged data files."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from app.config import DATA
from app.extract import extract_document

logger = logging.getLogger("affine.engine")

TOLERANCE = 0.01
REGIONS = ("US", "EU", "UK", "CA")
AGES = ("under_12", "12_and_above")
REGION_ALIASES = {"usa": "US", "united_states": "US", "europe": "EU", "united_kingdom": "UK", "gb": "UK", "canada": "CA"}
AGE_ALIASES = {"under12": "under_12", "12+": "12_and_above", "12_and_over": "12_and_above"}
EXPECTED_CONCENTRATION_UNIT = "percent_w_w"
EXPECTED_BASIS = "as_supplied_material_in_finished_formula"
MAX_EXCERPTS = 12
MAX_EXCERPT_CHARS = 700
MAX_REFERENCE_CLAIMS = 16
ASSESSMENT_MODES = ("evidence", "scenario")


def _read_json(directory: Path, name: str, default):
    path = directory / name
    if not path.is_file():
        if default is None:
            raise FileNotFoundError(path)
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _read_store(directory: Path, dataset_kind: str) -> dict:
    materials = _read_json(directory, "materials.json", None)
    rules = _read_json(directory, "rules.json", None)
    aliases = {}
    for item in materials:
        aliases[item["material_id"]] = item["material_id"]
        for alias in item.get("aliases") or []:
            if alias:
                aliases[str(alias)] = item["material_id"]
    manifest = _read_json(directory, "manifest.json", {})
    return {
        "version": manifest.get("dataset_version", "1.0.0"),
        "dataset_kind": dataset_kind,
        "materials": materials,
        "materials_by_id": {item["material_id"]: item for item in materials},
        "material_aliases": aliases,
        "rules": rules,
        "documents": _read_json(directory, "documents.json", None),
        "facts": _read_json(directory, "extracted_facts.json", []),
        "requirements": _read_json(directory, "evidence_requirements.json", None),
        "issues": _read_json(directory, "source_issues.json", []),
        "history": _read_json(directory, "historical_cases.json", []),
        "examples": _read_json(directory, "example_formulas.json", []),
        "chunks": _read_json(directory, "source_chunks.json", []),
        "regulatory_rows": _read_json(directory, "regulatory_reference_rows.json", []),
        "data_dir": str(directory),
    }


def load_store() -> dict:
    return _read_store(DATA, "evidence")


def load_scenario_store() -> dict:
    return _read_store(DATA / "scenario", "scenario")


def store_for_mode(formula: dict, store: dict | None = None) -> dict:
    mode = _assessment_mode(formula)
    if mode == "scenario":
        if store and store.get("dataset_kind") == "scenario":
            return store
        return load_scenario_store()
    if store and store.get("dataset_kind") != "scenario":
        return store
    return load_store()


def data_hash(store: dict | None = None) -> str:
    store = store or load_store()
    payload = json.dumps(
        {
            "version": store["version"],
            "rules": store["rules"],
            "documents": store["documents"],
            "requirements": store["requirements"],
            "materials": store["materials"],
            "facts": store["facts"],
            "chunks": [{"chunk_id": item.get("chunk_id"), "document_id": item.get("document_id")} for item in store["chunks"]],
            "issues": store["issues"],
            "regulatory_rows": [
                {key: item.get(key) for key in ("claim_id", "document_id", "enabled_for_decisions", "review_status")}
                for item in store["regulatory_rows"]
            ],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def input_hash(formula: dict) -> str:
    snapshot = {
        "formula_id": formula.get("formula_id"),
        "version_id": formula.get("version_id"),
        "name": formula.get("name"),
        "product_category": formula.get("product_category"),
        "age_group": formula.get("age_group"),
        "regions": formula.get("regions"),
        "physical_form": formula.get("physical_form"),
        "intended_use": formula.get("intended_use"),
        "ingredients": [
            {
                "material_id": row.get("material_id"),
                "concentration_percent": row.get("concentration_percent"),
                "batch_id": row.get("batch_id"),
            }
            for row in formula.get("ingredients") or []
        ],
        "assessment_mode": formula.get("assessment_mode") or "evidence",
    }
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _fmt(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.10f}".rstrip("0").rstrip(".")


def _within(actual: float, rule: dict) -> bool:
    threshold = float(rule["threshold"])
    operator = rule.get("operator", "<=")
    if operator == "<=":
        return actual <= threshold
    if operator == "<":
        return actual < threshold
    if operator == ">=":
        return actual >= threshold
    if operator == ">":
        return actual > threshold
    return False


def _is_dummy(rule: dict) -> bool:
    provenance = str(rule.get("provenance") or "").lower()
    return (
        provenance in {"dummy_editable", "dummy", "illustrative", "example", "synthetic_scenario"}
        or rule.get("is_regulatory_limit") is not True
        or rule.get("is_regulatory_requirement") is False
    )


def _is_scenario_rule(rule: dict) -> bool:
    provenance = str(rule.get("provenance") or "").lower()
    return provenance in {"synthetic_scenario", "dummy_editable", "dummy", "illustrative", "example"} or _is_dummy(rule)


def _is_verified_rule(rule: dict) -> bool:
    return (
        rule.get("enabled") is not False
        and rule.get("is_regulatory_limit") is True
        and not _is_dummy(rule)
        and rule.get("source_document_ids")
    )


def _assessment_mode(formula: dict) -> str:
    mode = str(formula.get("assessment_mode") or "evidence").strip().lower()
    return mode if mode in ASSESSMENT_MODES else "evidence"


def _normalize_region(value: str) -> str:
    text = str(value or "").strip()
    return REGION_ALIASES.get(text.lower(), text)


def _normalize_age(value: str) -> str:
    text = str(value or "").strip()
    return AGE_ALIASES.get(text.lower(), text)


def _canonical_material_id(material_id: str | None, store: dict) -> str | None:
    if not material_id:
        return None
    return store.get("material_aliases", {}).get(material_id) or (material_id if material_id in store["materials_by_id"] else None)


def _units_compatible(rule: dict) -> bool:
    unit = str(rule.get("unit") or EXPECTED_CONCENTRATION_UNIT)
    basis = str(rule.get("measurement_basis") or rule.get("basis") or EXPECTED_BASIS)
    property_name = str(rule.get("property") or "concentration_percent")
    if property_name != "concentration_percent":
        return False
    if unit not in {EXPECTED_CONCENTRATION_UNIT, "%", "percent"}:
        return False
    if basis not in {EXPECTED_BASIS, "finished_formula_concentration"}:
        return False
    return True


def _context_matches(rule: dict, category: str, age: str, region: str) -> bool:
    return (
        category in (rule.get("product_categories") or [])
        and age in (rule.get("age_groups") or [])
        and region in (rule.get("regions") or [])
    )


def _reason_payload(code: str, message: str, action: str, **extra) -> dict:
    return {"reason_code": code, "message": message, "action": action, **extra}


def validate_formula(formula: dict, store: dict) -> list[dict]:
    errors: list[dict] = []
    formula["assessment_mode"] = _assessment_mode(formula)
    formula["age_group"] = _normalize_age(str(formula.get("age_group") or ""))
    if isinstance(formula.get("regions"), list):
        formula["regions"] = [_normalize_region(str(item)) for item in formula["regions"]]
    ingredients = formula.get("ingredients")
    if isinstance(ingredients, list):
        for row in ingredients:
            canonical = _canonical_material_id(row.get("material_id"), store)
            if canonical:
                row["material_id"] = canonical
    if not str(formula.get("formula_id") or "").strip():
        errors.append({"loc": ["formula_id"], "msg": "A formula id is required.", "type": "missing"})
    if not str(formula.get("version_id") or "").strip():
        errors.append({"loc": ["version_id"], "msg": "A version id is required.", "type": "missing"})
    if not str(formula.get("name") or "").strip():
        errors.append({"loc": ["name"], "msg": "A formula name is required.", "type": "missing"})
    if not str(formula.get("product_category") or "").strip():
        errors.append({"loc": ["product_category"], "msg": "A product category is required.", "type": "missing"})
    if formula.get("age_group") not in AGES:
        errors.append({"loc": ["age_group"], "msg": "Choose under 12 or 12 and above.", "type": "value_error"})
    regions = formula.get("regions")
    if not isinstance(regions, list) or not regions:
        errors.append({"loc": ["regions"], "msg": "Select at least one region.", "type": "missing"})
    elif len(regions) != len(set(regions)) or any(region not in REGIONS for region in regions):
        errors.append({"loc": ["regions"], "msg": "Regions must be unique and one of US, EU, UK, or CA.", "type": "value_error"})
    if not str(formula.get("physical_form") or "").strip():
        errors.append({"loc": ["physical_form"], "msg": "Physical form is required.", "type": "missing"})
    if not str(formula.get("intended_use") or "").strip():
        errors.append({"loc": ["intended_use"], "msg": "Intended use is required.", "type": "missing"})
    ingredients = formula.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        errors.append({"loc": ["ingredients"], "msg": "Add at least one ingredient.", "type": "missing"})
        return errors
    seen: set[str] = set()
    total = 0.0
    for index, row in enumerate(ingredients):
        material_id = row.get("material_id")
        if material_id not in store["materials_by_id"]:
            errors.append({
                "loc": ["ingredients", index, "material_id"],
                "msg": (
                    f"Ingredient {index + 1} uses '{material_id}', which is not in the material catalog. "
                    "Select the correct catalog material. Names are not matched by similarity."
                ),
                "type": "value_error",
            })
        elif material_id in seen:
            errors.append({
                "loc": ["ingredients", index, "material_id"],
                "msg": f"{material_id} is listed more than once. Combine it into one row.",
                "type": "value_error",
            })
        else:
            seen.add(material_id)
        try:
            amount = float(row.get("concentration_percent"))
        except (TypeError, ValueError):
            amount = float("nan")
        if amount != amount or amount <= 0 or amount > 100:
            errors.append({
                "loc": ["ingredients", index, "concentration_percent"],
                "msg": f"Ingredient {index + 1} needs a percentage greater than 0 and at most 100.",
                "type": "value_error",
            })
        else:
            total += amount
    if not any(item["loc"][-1] == "concentration_percent" for item in errors if item["loc"]):
        if abs(total - 100) > TOLERANCE:
            errors.append({
                "loc": ["ingredients"],
                "msg": f"Composition totals {_fmt(round(total, 4))}%. It must equal 100% within {TOLERANCE} percentage points.",
                "type": "value_error",
            })
    return errors


def _rules_for(store: dict, material_id: str, category: str, age: str, region: str) -> list[dict]:
    return [
        rule
        for rule in store["rules"]
        if rule["material_id"] == material_id and _context_matches(rule, category, age, region)
    ]


def _material_rules(store: dict, material_id: str) -> list[dict]:
    return [rule for rule in store["rules"] if rule["material_id"] == material_id]


def _match_fields(requirement: dict) -> list[str]:
    return list(requirement.get("required_match_fields") or requirement.get("match_fields") or [])


def _identity_value(store: dict, ingredient: dict | None, field: str):
    material = store["materials_by_id"].get((ingredient or {}).get("material_id") or "") or {}
    if ingredient and ingredient.get(field):
        return ingredient.get(field)
    return material.get(field)


def _match_documents(store: dict, requirement: dict, formula: dict, ingredient: dict | None, region: str) -> list[dict]:
    matched = []
    for document in store["documents"]:
        if document.get("document_type") != requirement["document_type"]:
            continue
        if document.get("scope") != requirement["scope"]:
            continue
        ok = True
        for field in _match_fields(requirement):
            if field == "material_id" and document.get("material_id") != (ingredient or {}).get("material_id"):
                ok = False
            elif field == "batch_id" and document.get("batch_id") != (ingredient or {}).get("batch_id"):
                ok = False
            elif field in {"supplier_id", "grade_id"} and document.get(field) != _identity_value(store, ingredient, field):
                ok = False
            elif field == "formula_id" and document.get("formula_id") != formula.get("formula_id"):
                ok = False
            elif field == "version_id" and document.get("version_id") != formula.get("version_id"):
                ok = False
            elif field == "region" and region not in (document.get("regions") or []):
                ok = False
        if ok:
            matched.append(document)
    return matched


def _requirement_applicable(requirement: dict, formula: dict, ingredient: dict | None, region: str, store: dict) -> tuple[str | None, str]:
    categories = requirement.get("applicable_categories") or []
    regions = requirement.get("applicable_regions") or []
    if categories and formula.get("product_category") not in categories:
        return "not_applicable", "This requirement is not configured for the selected product category."
    if regions and region not in regions:
        return "not_applicable", "This requirement is not configured for the selected region."
    if requirement.get("review_status") == "applicability_unknown":
        return "applicability_unknown", "Applicability review needed."
    if ingredient and requirement.get("scope") == "raw_material":
        allowed_ids = requirement.get("material_ids") or []
        roles = requirement.get("material_roles") or []
        material = store["materials_by_id"].get(ingredient["material_id"]) or {}
        if allowed_ids and ingredient["material_id"] not in allowed_ids:
            return "not_applicable", "This requirement is not configured for this material identity."
        if roles and material.get("kind") not in roles:
            return "not_applicable", "This requirement is not configured for this material role."
    return None, ""


def _evidence_message(status: str, near: list[dict], ingredient: dict | None, requirement: dict | None = None, scenario: bool = False) -> str:
    scope = (requirement or {}).get("scope")
    document_type = (requirement or {}).get("document_type")
    if status == "applicability_unknown":
        return "Applicability review needed."
    if status == "not_applicable":
        return "This requirement is not applicable to the current formula context."
    if status == "satisfied" and scenario:
        return "Matching scenario evidence is complete for this scope. It is illustrative configuration, not verified real-world evidence."
    if status == "satisfied":
        return "Verified evidence matches this identity and scope."
    if near and status == "mismatched":
        names = ", ".join(item["document_id"] for item in near)
        entered = (ingredient or {}).get("batch_id") or "the entered batch"
        on_file = next((item.get("batch_id") for item in near if item.get("batch_id")), None)
        representative = any(item.get("representative_sample") for item in near)
        if representative:
            return f"{names} is a representative sample and does not cover batch {entered}."
        if document_type == "coa" or on_file:
            available = f" for batch {on_file}" if on_file else ""
            return (
                f"{names}{available} does not match batch {entered}. "
                "Obtain the correct batch CoA or correct the entered batch."
            )
        if representative:
            return f"{names} is a representative sample and does not cover batch {entered}."
        return f"{names} does not match this formula version or region."
    if near and status == "missing":
        names = ", ".join(item["document_id"] for item in near)
        batch = (ingredient or {}).get("batch_id") or "the entered batch"
        return f"{names} does not cover batch {batch}."
    if status == "needs_review":
        if scope == "raw_material":
            return "A matching document is on file for this material and batch but is not verified evidence. Present—awaiting review."
        return "A matching finished-product document is on file for this formula version and market but is not verified evidence. Present—awaiting review."
    if status == "missing" and document_type == "lab_report":
        return "The finished-formula test summary for this version and region is missing."
    if scenario and scope == "raw_material":
        return "Scenario evidence matching this material and batch is missing."
    if scenario:
        return "Scenario evidence matching this formula version and region is missing."
    if scope == "raw_material":
        return "Verified material evidence matching this identity and batch is required."
    return "Verified finished-product evidence matching this formula version and market is required."


def _composition_total(formula: dict) -> float:
    return round(sum(float(row["concentration_percent"]) for row in formula["ingredients"]), 4)


def _tokens(*values: object) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if value is None:
            continue
        text = str(value).lower().replace("_", " ")
        for piece in text.replace("/", " ").replace("-", " ").split():
            if len(piece) >= 3:
                tokens.add(piece)
    return tokens


def _score_text(text: str, needles: set[str]) -> int:
    haystack = text.lower()
    return sum(1 for needle in needles if needle in haystack)


def _locator_from(item: dict) -> dict:
    locator = item.get("locator") if isinstance(item.get("locator"), dict) else {}
    return {
        "page": item.get("page", locator.get("page")),
        "table": item.get("table", locator.get("table")),
        "row": item.get("row", locator.get("row")),
        "paragraph": item.get("paragraph", locator.get("paragraph")),
    }


def _relevant_document_ids(store: dict, formula: dict, materials: list[dict], regions: list[str], evidence_checks: list[dict]) -> list[str]:
    document_ids: list[str] = []
    seen: set[str] = set()

    def add(document_id: str | None) -> None:
        if document_id and document_id not in seen:
            seen.add(document_id)
            document_ids.append(document_id)

    for material in materials:
        for document_id in material.get("source_document_ids") or []:
            add(document_id)
    for check in evidence_checks:
        for document_id in check.get("document_ids") or []:
            add(document_id)
    material_ids = {item["material_id"] for item in materials}
    cited = set(document_ids)
    entered_batches = {
        row.get("material_id"): row.get("batch_id")
        for row in formula.get("ingredients") or []
    }
    for document in store["documents"]:
        document_id = document.get("document_id")
        if document.get("formula_id") and document.get("formula_id") != formula.get("formula_id"):
            continue
        if document.get("version_id") and document.get("version_id") != formula.get("version_id") and document_id not in cited:
            continue
        document_regions = document.get("regions") or []
        if document_regions and not set(document_regions).intersection(regions) and document_id not in cited:
            continue
        if document.get("material_id") in material_ids:
            material = store["materials_by_id"].get(document.get("material_id")) or {}
            batch = document.get("batch_id")
            entered = entered_batches.get(document.get("material_id"))
            if batch and entered and batch != entered and document_id not in cited:
                continue
            if (
                document.get("supplier_id")
                and material.get("supplier_id")
                and document.get("supplier_id") != material.get("supplier_id")
                and document_id not in cited
            ):
                continue
            add(document_id)
        if document.get("document_type") == "regulatory_summary" and set(document_regions).intersection(regions):
            add(document_id)
        if document.get("formula_id") == formula.get("formula_id") and document.get("version_id") in {None, formula.get("version_id")}:
            add(document_id)
    return document_ids


def _chunks_for_documents(store: dict, document_ids: list[str]) -> tuple[list[dict], list[dict]]:
    by_document = {document_id: [] for document_id in document_ids}
    for chunk in store["chunks"]:
        document_id = chunk.get("document_id")
        if document_id in by_document:
            by_document[document_id].append(chunk)
    missing_ids = [document_id for document_id, chunks in by_document.items() if not chunks]
    extracted_flags = []
    for document_id in missing_ids:
        document = next((item for item in store["documents"] if item["document_id"] == document_id), None)
        if not document:
            continue
        extracted = extract_document(document, Path(store["data_dir"]))
        extracted_flags.append(extracted)
        if extracted.get("ocr_required"):
            continue
        for index, part in enumerate(extracted.get("parts") or [], start=1):
            text = str(part.get("text") or "").strip()
            if not text:
                continue
            by_document[document_id].append({
                "chunk_id": f"{document_id}:EXTRACT:{index}",
                "document_id": document_id,
                "page": part.get("page"),
                "table": part.get("table"),
                "row": part.get("row"),
                "paragraph": part.get("paragraph"),
                "text": text,
                "trust": "unverified_extraction",
            })
    return [chunk for document_id in document_ids for chunk in by_document[document_id]], extracted_flags


def _select_excerpts(store: dict, formula: dict, materials: list[dict], documents: list[dict], chunks: list[dict]) -> list[dict]:
    needles = _tokens(
        formula.get("product_category"),
        formula.get("physical_form"),
        formula.get("intended_use"),
        formula.get("age_group"),
        *[item.get("name") for item in materials],
        *[item.get("material_id") for item in materials],
        *[item.get("cas") for item in materials],
        *[row.get("material_id") for row in formula["ingredients"]],
        *[row.get("batch_id") for row in formula["ingredients"]],
    )
    ranked = []
    for chunk in chunks:
        text = str(chunk.get("text") or "")
        score = _score_text(text, needles)
        if score <= 0:
            continue
        document = next((item for item in documents if item["document_id"] == chunk.get("document_id")), None)
        if not document:
            continue
        ranked.append((score, chunk, document))
    ranked.sort(key=lambda item: (-item[0], str(item[1].get("chunk_id") or "")))
    excerpts = []
    for score, chunk, document in ranked[:MAX_EXCERPTS]:
        locator = _locator_from(chunk)
        excerpts.append({
            "source_id": chunk.get("chunk_id") or document["document_id"],
            "document_id": document["document_id"],
            "filename": document.get("filename"),
            "page": locator.get("page"),
            "table": locator.get("table"),
            "row": locator.get("row"),
            "paragraph": locator.get("paragraph"),
            "locator": locator,
            "relevant_text": str(chunk.get("text") or "")[:MAX_EXCERPT_CHARS],
            "review_status": document.get("review_status") or chunk.get("trust") or "unverified",
            "applicability": {
                "scope": document.get("scope"),
                "material_id": document.get("material_id"),
                "batch_id": document.get("batch_id"),
                "formula_id": document.get("formula_id"),
                "version_id": document.get("version_id"),
                "regions": document.get("regions") or [],
                "document_type": document.get("document_type"),
                "eligible_as_verified_evidence": bool(document.get("eligible_as_verified_evidence")),
                "representative_sample": bool(document.get("representative_sample")),
            },
            "applicability_explanation": (
                f"{document.get('document_type')} scoped to {document.get('scope')}"
                + (f" for {document.get('material_id')}" if document.get("material_id") else "")
                + (f", batch {document.get('batch_id')}" if document.get("batch_id") else "")
                + ("; representative sample only" if document.get("representative_sample") else "")
                + ("; unverified reference, not enabled for decisions" if document.get("document_type") == "regulatory_summary" else "")
            ),
            "relevance_score": score,
        })
    return excerpts


def _reference_claims(store: dict, formula: dict, materials: list[dict], regions: list[str]) -> list[dict]:
    needles = _tokens(
        *[item.get("name") for item in materials],
        *[item.get("material_id") for item in materials],
        *[item.get("cas") for item in materials],
        formula.get("product_category"),
        formula.get("physical_form"),
    )
    claims = []
    for row in store["regulatory_rows"]:
        if row.get("region") not in regions:
            continue
        haystack = " ".join([
            " ".join(str(item) for item in row.get("headers") or []),
            " ".join(str(item) for item in row.get("cells") or []),
            str(row.get("claim_id") or ""),
        ])
        score = _score_text(haystack, needles)
        if score <= 0:
            continue
        claims.append({
            "claim_id": row.get("claim_id"),
            "document_id": row.get("document_id"),
            "region": row.get("region"),
            "locator": row.get("locator"),
            "headers": row.get("headers"),
            "cells": row.get("cells"),
            "review_status": row.get("review_status") or "unverified",
            "enabled_for_decisions": bool(row.get("enabled_for_decisions")),
            "verification": "unverified_reference_summary",
            "note": "Unverified uploaded summary. Not an established regulatory limit and not enabled for decisions.",
            "relevance_score": score,
        })
    claims.sort(key=lambda item: (-int(item["relevance_score"]), str(item.get("claim_id") or "")))
    return claims[:MAX_REFERENCE_CLAIMS]


def _check_base(region: str, row: dict, actual: float, rule: dict | None = None) -> dict:
    return {
        "check_id": f"{region}:{row['material_id']}:{(rule or {}).get('rule_id') or 'NO-RULE'}",
        "material_id": row["material_id"],
        "region": region,
        "rule_id": (rule or {}).get("rule_id"),
        "actual": actual,
        "threshold": None if not rule else rule.get("threshold"),
        "unit": None if not rule else rule.get("unit"),
        "basis": None if not rule else (rule.get("measurement_basis") or rule.get("basis")),
        "rule_provenance": None if not rule else rule.get("provenance"),
        "verified_limit_available": False,
        "illustrative_comparison": None,
        "priority": "medium",
    }


def _illustrative(rule: dict, actual: float) -> dict:
    return {
        "rule_id": rule["rule_id"],
        "threshold": rule["threshold"],
        "unit": rule.get("unit"),
        "basis": rule.get("measurement_basis") or rule.get("basis"),
        "provenance": rule.get("provenance"),
        "within_example": _within(actual, rule),
        "note": "Illustrative software-testing threshold. Not used as a regulatory verdict.",
    }


def _evaluate_material_region(store: dict, formula: dict, row: dict, region: str) -> list[dict]:
    mode = _assessment_mode(formula)
    actual = float(row["concentration_percent"])
    category = formula["product_category"]
    age = formula["age_group"]
    material_rules = _material_rules(store, row["material_id"])
    context_rules = [rule for rule in material_rules if _context_matches(rule, category, age, region)]
    dummy_context = [rule for rule in context_rules if _is_dummy(rule)]
    checks = []

    if mode == "scenario":
        executable = [rule for rule in context_rules if rule.get("enabled") is not False and _is_scenario_rule(rule) and _units_compatible(rule)]
        if executable:
            material_name = store["materials_by_id"].get(row["material_id"], {}).get("name") or row["material_id"]
            for rule in executable:
                passed = _within(actual, rule)
                priority = "high" if not passed else "medium"
                if not passed and str(rule.get("criticality") or "").lower() == "critical":
                    priority = "critical"
                check = _check_base(region, row, actual, rule)
                check.update({
                    "check_id": f"{region}:{row['material_id']}:{rule['rule_id']}",
                    "status": "pass" if passed else "fail",
                    "verified_limit_available": False,
                    "priority": priority,
                    "check_kind": "concentration",
                    **_reason_payload(
                        "scenario_threshold",
                        (
                            f"{material_name} at {_fmt(actual)}% w/w is within the configured scenario maximum of {_fmt(rule['threshold'])}% w/w."
                            if passed
                            else (
                                f"{material_name} at {_fmt(actual)}% w/w exceeds the configured scenario maximum of {_fmt(rule['threshold'])}% w/w. "
                                "Configured scenario limit exceeded."
                            )
                        ),
                        (
                            "No concentration change is required for this configured scenario check."
                            if passed
                            else "Rebalance the formula at or below the configured maximum and assess the new total again. This is not a toxicity or legal finding."
                        ),
                    ),
                })
                checks.append(check)
            return checks
        disabled = [rule for rule in context_rules if rule.get("enabled") is False]
        incompatible = [rule for rule in context_rules if not _units_compatible(rule)]
        if disabled:
            rule = disabled[0]
            check = _check_base(region, row, actual, rule)
            check.update({
                "status": "not_assessed",
                **_reason_payload("rule_disabled", "A configured example rule exists but is disabled.", "Enable the example rule only if you intend to run a scenario check."),
            })
            return [check]
        if incompatible:
            rule = incompatible[0]
            check = _check_base(region, row, actual, rule)
            check.update({
                "status": "not_assessed",
                **_reason_payload("incompatible_units_or_basis", "A configured rule exists but uses incompatible units or measurement basis.", "Supply a concentration percent rule with a finished-formula basis before evaluating."),
            })
            return [check]
        if material_rules and not context_rules:
            check = _check_base(region, row, actual)
            check.update({
                "check_id": f"{region}:{row['material_id']}:APPLICABILITY-UNKNOWN",
                "status": "not_assessed",
                **_reason_payload("applicability_unknown", "Applicability review needed.", "Review whether any configured example rule applies to this category, age group, and region."),
            })
            return [check]
        check = _check_base(region, row, actual)
        check.update({
            "check_id": f"{region}:{row['material_id']}:NO-RULE",
            "status": "not_assessed",
            **_reason_payload("no_rule_configured", "No rule is configured for this material and context.", "Add a reviewed rule or keep the gap visible."),
        })
        return [check]

    verified = [rule for rule in context_rules if _is_verified_rule(rule) and _units_compatible(rule)]
    if verified:
        for rule in verified:
            passed = _within(actual, rule)
            check = _check_base(region, row, actual, rule)
            check.update({
                "check_id": f"{region}:{row['material_id']}:{rule['rule_id']}",
                "status": "pass" if passed else "fail",
                "verified_limit_available": True,
                "priority": "critical" if not passed else "medium",
                **_reason_payload(
                    "verified_threshold",
                    (
                        f"{_fmt(actual)}% is within the verified {_fmt(rule['threshold'])}% {rule.get('unit') or ''} limit ({rule.get('basis')})."
                        if passed
                        else f"{_fmt(actual)}% is outside the verified {_fmt(rule['threshold'])}% {rule.get('unit') or ''} limit ({rule.get('basis')})."
                    ),
                    "Record the comparison against the verified applicable limit.",
                ),
            })
            checks.append(check)
        return checks

    disabled = [rule for rule in context_rules if rule.get("enabled") is False]
    incompatible = [rule for rule in context_rules if not _is_dummy(rule) and not _units_compatible(rule)]
    if disabled and not [rule for rule in context_rules if rule.get("enabled") is not False and not _is_dummy(rule)]:
        rule = disabled[0]
        check = _check_base(region, row, actual, rule)
        check.update({
            "status": "not_assessed",
            "illustrative_comparison": _illustrative(dummy_context[0], actual) if dummy_context else None,
            **_reason_payload("rule_disabled", "A rule exists for this material and context but is disabled.", "Review and enable the rule only after source verification."),
        })
        return [check]
    if incompatible:
        rule = incompatible[0]
        check = _check_base(region, row, actual, rule)
        check.update({
            "status": "not_assessed",
            **_reason_payload("incompatible_units_or_basis", "A rule exists but has incompatible units or measurement basis.", "Do not compare the entered percentage to a migration or assay result."),
        })
        return [check]
    if material_rules and not context_rules:
        check = _check_base(region, row, actual)
        check.update({
            "check_id": f"{region}:{row['material_id']}:APPLICABILITY-UNKNOWN",
            "status": "not_assessed",
            **_reason_payload("applicability_unknown", "Applicability review needed.", "Review whether any packaged rule applies to this category, age group, and region."),
        })
        return [check]
    if dummy_context and not verified:
        check = _check_base(region, row, actual)
        check.update({
            "check_id": f"{region}:{row['material_id']}:NO-VERIFIED-THRESHOLD",
            "status": "not_assessed",
            "illustrative_comparison": _illustrative(dummy_context[0], actual),
            **_reason_payload(
                "no_verified_threshold",
                "No verified applicable threshold available.",
                "Do not treat the example threshold as a regulatory limit. Use scenario mode only to test the editable example rule.",
            ),
        })
        return [check]
    check = _check_base(region, row, actual)
    check.update({
        "check_id": f"{region}:{row['material_id']}:NO-RULE",
        "status": "not_assessed",
        **_reason_payload("no_rule_configured", "No rule is configured for this material and context.", "Keep the gap visible; do not invent a limit."),
    })
    return [check]


def build_context(formula: dict, store: dict | None = None, version_changes: list | None = None) -> dict:
    if _assessment_mode(formula) != "scenario":
        from app.threshold_catalog import build_threshold_context

        return build_threshold_context(formula, version_changes=version_changes)
    store = store_for_mode(formula, store)
    errors = validate_formula(formula, store)
    if errors:
        raise ValueError(errors)
    material_ids = [row["material_id"] for row in formula["ingredients"]]
    materials = [store["materials_by_id"][item] for item in material_ids]
    regions = list(dict.fromkeys(formula["regions"]))
    calculated_checks = []
    evidence_checks = []
    evidence_matches = []
    missing_evidence = []
    limitations = [
        "AP and CL are external certification decisions and are not issued by this assessment.",
        "Supplier assay specifications are raw-material measurements, not finished-product concentration limits.",
        "US/EU document summaries remain unverified reference context and are not treated as established regulations.",
    ]

    mode = _assessment_mode(formula)
    limitations.append(
        "Scenario assessment uses editable example thresholds and is not a regulatory compliance or AP/CL result."
        if mode == "scenario"
        else "Evidence assessment uses reviewed applicable rules only. Example thresholds are not verdicts."
    )
    for region in regions:
        for row in formula["ingredients"]:
            calculated_checks.extend(_evaluate_material_region(store, formula, row, region))
        for requirement in store["requirements"]:
            rows = formula["ingredients"] if requirement["scope"] == "raw_material" else [None]
            for ingredient in rows:
                material_id = ingredient["material_id"] if ingredient else None
                suffix = material_id or formula["version_id"]
                skipped, skip_message = _requirement_applicable(requirement, formula, ingredient, region, store)
                if skipped:
                    check = {
                        "check_id": f"E:{region}:{requirement['requirement_id']}:{suffix}",
                        "requirement_id": requirement["requirement_id"],
                        "document_type": requirement["document_type"],
                        "scope": requirement["scope"],
                        "material_id": material_id,
                        "region": region,
                        "status": skipped,
                        "document_ids": [],
                        "message": skip_message,
                        "reason_code": skipped,
                        "action": "Record applicability before treating this as a coverage gap." if skipped == "applicability_unknown" else "Excluded from coverage because it is not applicable.",
                        "criticality": requirement.get("criticality"),
                        "requirement_basis": requirement.get("requirement_basis") or requirement.get("policy_basis"),
                    }
                    evidence_checks.append(check)
                    if skipped != "not_applicable":
                        missing_evidence.append({**check, "gap_status": skipped, "match_fields": _match_fields(requirement)})
                    continue
                matched = _match_documents(store, requirement, formula, ingredient, region)
                verified_docs = [
                    document
                    for document in matched
                    if mode != "scenario"
                    and document.get("provenance") != "synthetic_scenario"
                    and document.get("review_status") != "scenario_complete"
                    and document.get("eligible_as_verified_evidence")
                    and document.get("review_status") == "verified"
                    and not document.get("representative_sample")
                ]
                scenario_docs = [
                    document
                    for document in matched
                    if mode == "scenario"
                    and document.get("provenance") == "synthetic_scenario"
                    and document.get("review_status") == "scenario_complete"
                    and document.get("eligible_as_verified_evidence") is not True
                    and not document.get("representative_sample")
                ]
                near: list[dict] = []
                if verified_docs:
                    status = "satisfied"
                    gap_status = None
                    ids = [document["document_id"] for document in verified_docs]
                elif scenario_docs:
                    status = "satisfied"
                    gap_status = None
                    ids = [document["document_id"] for document in scenario_docs]
                elif [
                    document for document in matched
                    if mode != "scenario"
                    and document.get("provenance") != "synthetic_scenario"
                    and document.get("review_status") != "scenario_complete"
                ]:
                    review_docs = [
                        document for document in matched
                        if document.get("provenance") != "synthetic_scenario"
                        and document.get("review_status") != "scenario_complete"
                    ]
                    status = "needs_review"
                    gap_status = "unverified"
                    ids = [document["document_id"] for document in review_docs]
                else:
                    status = "missing"
                    gap_status = "missing"
                    fields = _match_fields(requirement)
                    if ingredient and "batch_id" in fields:
                        near = [
                            document
                            for document in store["documents"]
                            if document.get("document_type") == requirement["document_type"]
                            and document.get("scope") == requirement["scope"]
                            and document.get("material_id") == ingredient["material_id"]
                            and document.get("batch_id")
                            and document.get("batch_id") != ingredient.get("batch_id")
                        ]
                    if not near and not ingredient:
                        near = [
                            document
                            for document in store["documents"]
                            if document.get("document_type") == requirement["document_type"]
                            and document.get("scope") == requirement["scope"]
                            and document.get("formula_id") == formula.get("formula_id")
                            and (
                                (document.get("version_id") and document.get("version_id") != formula.get("version_id"))
                                or ("region" in fields and region not in (document.get("regions") or []))
                            )
                        ]
                    if not near and ingredient:
                        near = [
                            document
                            for document in store["documents"]
                            if document.get("document_type") == requirement["document_type"]
                            and document.get("material_id") == ingredient["material_id"]
                        ]
                    ids = [document["document_id"] for document in near[:1]]
                    if near and (
                        any(item.get("batch_id") and item.get("batch_id") != (ingredient or {}).get("batch_id") for item in near)
                        or any(item.get("representative_sample") for item in near)
                        or any(item.get("formula_id") for item in near)
                    ):
                        status = "mismatched"
                        gap_status = "mismatched"
                check = {
                    "check_id": f"E:{region}:{requirement['requirement_id']}:{suffix}",
                    "requirement_id": requirement["requirement_id"],
                    "document_type": requirement["document_type"],
                    "scope": requirement["scope"],
                    "material_id": material_id,
                    "region": region,
                    "status": status,
                    "document_ids": ids,
                    "message": _evidence_message(status, near, ingredient, requirement, scenario=mode == "scenario"),
                    "reason_code": "batch_mismatch" if status == "mismatched" and requirement.get("document_type") == "coa" else status,
                    "action": (
                        "No further scenario evidence is required for this item."
                        if status == "satisfied" and mode == "scenario"
                        else "Retain the verified document for this identity and batch."
                        if status == "satisfied"
                        else "Review existing document."
                        if status == "needs_review"
                        else "Obtain the correct batch CoA or correct the entered batch."
                        if status == "mismatched" and requirement.get("document_type") == "coa"
                        else "Replace the mismatched record with one that matches this version and region."
                        if status == "mismatched"
                        else "Provide the missing document for this identity and scope."
                    ),
                    "criticality": requirement.get("criticality"),
                    "requirement_basis": requirement.get("requirement_basis") or requirement.get("policy_basis"),
                }
                evidence_checks.append(check)
                record = {
                    **check,
                    "match_fields": _match_fields(requirement),
                    "policy_basis": requirement.get("policy_basis"),
                }
                if status == "satisfied":
                    evidence_matches.append(record)
                else:
                    missing_evidence.append({**record, "gap_status": gap_status})

    applicable_verified_rules = []
    seen_rules: set[str] = set()
    for check in calculated_checks:
        if not check.get("verified_limit_available") or not check.get("rule_id") or check["rule_id"] in seen_rules:
            continue
        seen_rules.add(check["rule_id"])
        applicable_verified_rules.append(next(rule for rule in store["rules"] if rule["rule_id"] == check["rule_id"]))

    document_ids = _relevant_document_ids(store, formula, materials, regions, evidence_checks)
    documents = [
        {key: value for key, value in document.items() if key not in {"file_path", "sha256"}}
        for document in store["documents"]
        if document["document_id"] in set(document_ids)
    ]
    facts = [
        {
            **fact,
            "note": "Extracted source value. Review status and measurement basis must be preserved; this is not a finished-product limit unless the source says so.",
        }
        for fact in store["facts"]
        if fact.get("document_id") in set(document_ids)
        and (fact.get("material_id") in set(material_ids) or fact.get("material_id") is None)
    ]
    issues = [issue for issue in store["issues"] if set(issue.get("document_ids") or []).intersection(document_ids)]
    history = [
        case
        for case in store["history"]
        if case.get("product_category") == formula["product_category"]
        and set(case.get("regions") or []).intersection(regions)
        and (
            case.get("formula_id") == formula.get("formula_id")
            and case.get("version_id") == formula.get("version_id")
        )
    ]
    chunks, extraction_flags = _chunks_for_documents(store, document_ids)
    excerpts = _select_excerpts(store, formula, materials, documents, chunks)
    if not excerpts:
        limitations.append("No relevant source excerpts were retrieved for this formula, category, region, and identity set.")
    for flag in extraction_flags:
        if flag.get("ocr_required"):
            limitations.append(
                f"{flag.get('document_id')} extraction/OCR-needed. Empty extraction is not evidence that the document contains no relevant information."
            )
        elif flag.get("status") == "file_missing":
            limitations.append(f"{flag.get('document_id')} is registered but the source file is not available.")
        elif flag.get("status") == "extraction_failed":
            limitations.append(f"{flag.get('document_id')} could not be extracted.")
    reference_claims = _reference_claims(store, formula, materials, regions)
    disabled = sum(1 for row in store["regulatory_rows"] if row.get("enabled_for_decisions") is False)
    total = _composition_total(formula)
    public_formula = {
        "formula_id": formula.get("formula_id"),
        "version_id": formula.get("version_id"),
        "name": formula.get("name"),
        "product_category": formula.get("product_category"),
        "age_group": formula.get("age_group"),
        "regions": regions,
        "physical_form": formula.get("physical_form"),
        "intended_use": formula.get("intended_use"),
        "assessment_mode": mode,
        "composition_total_percent": total,
        "ingredients": [
            {
                "material_id": row["material_id"],
                "name": store["materials_by_id"][row["material_id"]]["name"],
                "concentration_percent": row["concentration_percent"],
                "batch_id": row.get("batch_id"),
                "kind": store["materials_by_id"][row["material_id"]].get("kind"),
                "cas": store["materials_by_id"][row["material_id"]].get("cas"),
                "supplier_grade_available": False,
            }
            for row in formula["ingredients"]
        ],
    }
    return {
        "formula": public_formula,
        "materials": materials,
        "calculated_checks": calculated_checks,
        "applicable_verified_rules": applicable_verified_rules,
        "reference_claims_pending_verification": reference_claims,
        "evidence_requirements": store["requirements"],
        "evidence_matches": evidence_matches,
        "missing_evidence": missing_evidence,
        "source_conflicts": issues,
        "source_excerpts": excerpts,
        "version_changes": version_changes or [],
        "documented_history": history,
        "assessment_limitations": limitations,
        "checks": calculated_checks,
        "evidence_checks": evidence_checks,
        "documents": documents,
        "extracted_facts": facts,
        "source_issues": issues,
        "applicable_rules": applicable_verified_rules,
        "regulatory_reference_status": "Uploaded summaries retained in data but disabled for decisions; no validated regional rules configured.",
        "regulatory_rows_disabled": disabled,
        "historical_cases": history,
        "composition_total_percent": total,
        "assessment_mode": mode,
        "dataset_kind": store.get("dataset_kind"),
        "dataset_version": store.get("version"),
        "data_hash": data_hash(store),
        "scenario_provenance": {
            "dataset_kind": store.get("dataset_kind"),
            "dataset_version": store.get("version"),
            "provenance": "synthetic_scenario" if mode == "scenario" else "packaged_reference",
            "is_regulatory_requirement": False,
            "note": (
                "Scenario results use illustrative thresholds and evidence. They are not AP/CL predictions, regulatory determinations, or verified real-world evidence."
                if mode == "scenario"
                else "Evidence mode does not treat synthetic scenario records as verified evidence."
            ),
        },
        "applicable_scenario_rules": [
            rule for rule in store["rules"]
            if mode == "scenario" and _is_scenario_rule(rule) and rule.get("enabled") is not False and rule["rule_id"] in {item.get("rule_id") for item in calculated_checks}
        ],
    }


def _metrics(checks: list[dict], evidence: list[dict], mode: str = "evidence") -> dict:
    passed = sum(1 for item in checks if item["status"] == "pass")
    failed = sum(1 for item in checks if item["status"] == "fail")
    not_assessed = sum(1 for item in checks if item["status"] == "not_assessed")
    needs_test_data = sum(1 for item in checks if item["status"] == "needs_test_data")
    applicability_unknown_checks = sum(1 for item in checks if item["status"] == "applicability_unknown")
    source_review_required = sum(1 for item in checks if item["status"] == "source_review_required")
    no_matching_rule = sum(1 for item in checks if item["status"] == "no_matching_rule")
    not_applicable_checks = sum(1 for item in checks if item["status"] == "not_applicable")
    decided = passed + failed
    identified = len(checks) - not_applicable_checks
    applicable_evidence = [item for item in evidence if item.get("status") != "not_applicable"]
    satisfied = sum(1 for item in applicable_evidence if item.get("status") == "satisfied")
    missing = sum(1 for item in applicable_evidence if item.get("status") == "missing")
    needs_review = sum(1 for item in applicable_evidence if item.get("status") == "needs_review")
    mismatched = sum(1 for item in applicable_evidence if item.get("status") == "mismatched")
    unknown = sum(1 for item in applicable_evidence if item.get("status") == "applicability_unknown")
    coverage_partial = unknown > 0
    pass_label = "Configured concentration-check pass rate" if mode == "scenario" else "Check pass rate"
    evidence_label = "Scenario evidence completeness" if mode == "scenario" else "Verified evidence coverage"
    return {
        "assessment_mode": mode,
        "passed_checks": passed,
        "failed_checks": failed,
        "concentration_passed_checks": passed,
        "concentration_failed_checks": failed,
        "not_assessed_checks": not_assessed,
        "needs_test_data_checks": needs_test_data,
        "applicability_unknown_checks": applicability_unknown_checks,
        "source_review_required_checks": source_review_required,
        "no_matching_rule_checks": no_matching_rule,
        "not_applicable_checks": not_applicable_checks,
        "evaluated_checks": decided,
        "identified_applicable_checks": identified,
        "check_pass_rate_percent": None if decided == 0 else round(passed / decided * 100, 1),
        "check_pass_rate_label": pass_label,
        "evidence_coverage_label": evidence_label,
        "check_pass_rate_copy": None if decided == 0 else f"{passed} of {decided} evaluated checks passed.",
        "rule_evaluation_coverage_percent": None if identified == 0 else round(decided / identified * 100, 1),
        "rule_evaluation_coverage_copy": (
            "No applicable checks were identified in the configured rule set."
            if identified == 0
            else f"{decided} of {identified} identified applicable checks were evaluated. This is coverage of the configured rule set, not every possible regulation."
        ),
        "evidence_coverage_percent": None if not applicable_evidence else round(satisfied / len(applicable_evidence) * 100, 1),
        "evidence_coverage_partial": coverage_partial,
        "evidence_satisfied": satisfied,
        "evidence_missing": missing,
        "evidence_needs_review": needs_review,
        "evidence_mismatched": mismatched,
        "evidence_applicability_unknown": unknown,
        "evidence_not_applicable": sum(1 for item in evidence if item.get("status") == "not_applicable"),
        "evidence_applicable_count": len(applicable_evidence),
        "metrics_note": (
            f"{pass_label} uses evaluated concentration checks only. "
            f"{evidence_label} counts matching {'scenario_complete records in this configured scenario' if mode == 'scenario' else 'verified applicable requirements'}. "
            "Neither value is an acceptance probability or a real-world verification score."
            if mode == "scenario"
            else
            f"{pass_label} uses evaluated applicable checks only. "
            "Rule evaluation coverage uses the configured rule set. "
            "Verified evidence coverage uses satisfied applicable requirements. Neither value is an acceptance probability."
        ),
        "acceptance_probability": None,
        "model_confidence": None,
        "ap_acceptance_probability": None,
        "ap_acceptance_note": "AP acceptance estimate unavailable: validated outcome data/model required.",
    }


def assessment_support(context: dict, metrics: dict) -> dict:
    checks = context.get("calculated_checks") or []
    evidence = [item for item in (context.get("evidence_checks") or []) if item.get("status") != "not_applicable"]
    evaluated = metrics.get("evaluated_checks") or 0
    essential_gaps = [
        item for item in evidence
        if item.get("status") in {"missing", "needs_review", "mismatched", "applicability_unknown"}
        and item.get("criticality") in {"critical", "high"}
    ]
    unevaluable = any(
        item.get("status") in {"not_assessed", "needs_test_data", "applicability_unknown", "source_review_required", "no_matching_rule"}
        for item in checks
    )
    if evaluated == 0 or essential_gaps:
        level = "insufficient"
        basis = "No applicable checks can be evaluated, or essential identity, evidence, or applicability gaps prevent a complete assessment."
    elif unevaluable or evidence and any(item.get("status") != "satisfied" for item in evidence):
        level = "partial"
        basis = "Some checks can be evaluated, but relevant gaps remain in the configured assessment scope."
    else:
        level = "substantial"
        basis = (
            "The configured scenario scope is covered, including when a concentration check fails. This describes support for the scenario evaluation, not a pass result and not verified real-world evidence."
            if context.get("assessment_mode") == "scenario"
            else "The configured assessment scope is covered. This describes support for the assessment, not whether the formula passes."
        )
    return {
        "level": level,
        "basis": basis,
        "limiting_factors": [
            item.get("message")
            for item in (checks + evidence)
            if item.get("status") in {"not_assessed", "missing", "needs_review", "mismatched", "applicability_unknown", "fail"}
        ][:8],
    }


def constrain_analysis_confidence(confidence: dict | None, context: dict, metrics: dict) -> dict | None:
    support = assessment_support(context, metrics)
    mapped = {"insufficient": "low", "partial": "medium", "substantial": "high"}
    ceiling = mapped[support["level"]]
    if not isinstance(confidence, dict):
        return {
            "level": ceiling,
            "basis": support["basis"],
            "limiting_factors": support["limiting_factors"],
            "source_ids": [],
            "assessment_support": support["level"],
        }
    rank = {"low": 0, "medium": 1, "high": 2}
    level = str(confidence.get("level") or "low").lower()
    if level not in rank:
        level = "low"
    if rank[level] > rank[ceiling]:
        level = ceiling
    factors = [str(item) for item in confidence.get("limiting_factors") or [] if str(item).strip()]
    factors.extend(support["limiting_factors"])
    return {
        "level": level,
        "basis": support["basis"] if rank[level] <= rank[ceiling] else str(confidence.get("basis") or support["basis"]),
        "limiting_factors": list(dict.fromkeys(factors)),
        "source_ids": [str(item) for item in confidence.get("source_ids") or [] if item],
        "assessment_support": support["level"],
    }


def clamp_priorities(items: list[dict], context: dict, key: str = "priority") -> list[dict]:
    failed_verified = {
        item.get("check_id")
        for item in context.get("calculated_checks") or []
        if item.get("status") == "fail" and item.get("verified_limit_available")
    }
    critical_requirements = {
        item.get("requirement_id")
        for item in context.get("evidence_checks") or []
        if item.get("criticality") == "critical" and item.get("status") not in {"satisfied", "not_applicable"}
    }
    allowed = {"critical", "high", "medium", "informational", "low"}
    mapped = {"low": "informational"}
    clamped = []
    for item in items:
        current = str(item.get(key) or item.get("severity") or "medium").lower()
        current = mapped.get(current, current)
        if current not in allowed:
            current = "medium"
        related = set(item.get("related_check_ids") or item.get("source_ids") or [])
        related.add(item.get("check_id"))
        related.add(item.get("requirement_id"))
        can_be_critical = bool(related & failed_verified or related & critical_requirements) or item.get("criticality") == "critical"
        if current == "critical" and not can_be_critical:
            current = "high"
        next_item = dict(item)
        next_item[key] = current
        if "severity" in next_item:
            next_item["severity"] = current
        clamped.append(next_item)
    return clamped


def _region_status(checks: list[dict], evidence: list[dict]) -> str:
    if any(item["status"] == "fail" for item in checks):
        return "changes_required"
    gap_statuses = {"missing", "needs_review", "mismatched", "applicability_unknown", "needs_test_data", "source_review_required"}
    required_gaps = [item for item in evidence if item.get("status") in gap_statuses]
    decided = [item for item in checks if item["status"] in {"pass", "fail"}]
    open_checks = [item for item in checks if item["status"] not in {"pass", "not_applicable"}]
    if open_checks or required_gaps or not decided:
        return "more_information_required"
    if checks and all(item["status"] in {"pass", "not_applicable"} for item in checks):
        return "no_issues_found_in_assessed_scope"
    return "more_information_required"


def screening_status_label(status: str, mode: str) -> str:
    if status == "changes_required":
        return "Changes required"
    if status == "more_information_required":
        return "More information required"
    if mode == "scenario":
        return "Meets configured scenario checks"
    return "No issues found in assessed scope"


def screen_status(context: dict) -> tuple[str, dict]:
    by_region = {}
    for region in context["formula"]["regions"]:
        status = _region_status(
            [item for item in context["calculated_checks"] if item["region"] == region],
            [item for item in context["evidence_checks"] if item["region"] == region],
        )
        by_region[region] = {"screening_status": status, "regulatory_status": "not_assessed", "ap_cl_decision": None}
    statuses = [item["screening_status"] for item in by_region.values()]
    if "changes_required" in statuses:
        overall = "changes_required"
    elif "more_information_required" in statuses or "not_assessed" in statuses:
        overall = "more_information_required"
    else:
        overall = "no_issues_found_in_assessed_scope"
    return overall, by_region


def compare_formulas(previous: dict, current: dict, store: dict | None = None) -> dict:
    store = store or load_store()
    previous_context = build_context(previous, store)
    current_ids = {row["material_id"]: row for row in current["ingredients"]}
    previous_ids = {row["material_id"]: row for row in previous["ingredients"]}
    added = [current_ids[key] for key in current_ids if key not in previous_ids]
    removed = [previous_ids[key] for key in previous_ids if key not in current_ids]
    changes = []
    for key in previous_ids.keys() & current_ids.keys():
        before = float(previous_ids[key]["concentration_percent"])
        after = float(current_ids[key]["concentration_percent"])
        if abs(after - before) > TOLERANCE:
            changes.append({
                "material_id": key,
                "previous_percent": before,
                "current_percent": after,
                "delta_percentage_points": round(after - before, 4),
            })
    context_changes = []
    for field in ("product_category", "age_group", "physical_form", "intended_use", "regions", "assessment_mode"):
        if previous.get(field) != current.get(field):
            context_changes.append({"field": field, "previous": previous.get(field), "current": current.get(field)})
    version_changes = [
        *[
            {
                "kind": "concentration",
                "material_id": item["material_id"],
                "previous": item["previous_percent"],
                "current": item["current_percent"],
                "delta_percentage_points": item["delta_percentage_points"],
            }
            for item in changes
        ],
        *[{"kind": "added", "material_id": item["material_id"]} for item in added],
        *[{"kind": "removed", "material_id": item["material_id"]} for item in removed],
        *[{"kind": "context", **item} for item in context_changes],
    ]
    current_context = build_context(current, store, version_changes=version_changes)
    previous_checks = {item["check_id"]: item for item in previous_context["calculated_checks"]}
    current_checks = {item["check_id"]: item for item in current_context["calculated_checks"]}
    finding_changes = []
    for check_id in sorted(set(previous_checks) | set(current_checks)):
        before = previous_checks.get(check_id)
        after = current_checks.get(check_id)
        before_status = before["status"] if before else None
        after_status = after["status"] if after else None
        before_example = (before or {}).get("illustrative_comparison")
        after_example = (after or {}).get("illustrative_comparison")
        if before_status != after_status or (before_example or {}).get("within_example") != (after_example or {}).get("within_example"):
            finding_changes.append({
                "check_id": check_id,
                "previous_status": before_status,
                "current_status": after_status,
                "previous_illustrative_within": None if not before_example else before_example.get("within_example"),
                "current_illustrative_within": None if not after_example else after_example.get("within_example"),
            })
    previous_evidence = {item["check_id"]: item["status"] for item in previous_context["evidence_checks"]}
    current_evidence = {item["check_id"]: item["status"] for item in current_context["evidence_checks"]}
    evidence_changes = []
    for check_id in sorted(set(previous_evidence) | set(current_evidence)):
        if previous_evidence.get(check_id) != current_evidence.get(check_id):
            evidence_changes.append({
                "check_id": check_id,
                "previous_status": previous_evidence.get(check_id),
                "current_status": current_evidence.get(check_id),
            })
    return {
        "added_ingredients": added,
        "removed_ingredients": removed,
        "concentration_changes": changes,
        "context_changes": context_changes,
        "finding_changes": finding_changes,
        "evidence_changes": evidence_changes,
        "version_changes": version_changes,
        "previous_context": previous_context,
        "current_context": current_context,
    }
