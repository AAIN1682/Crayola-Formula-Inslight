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
MAX_EXCERPTS = 12
MAX_EXCERPT_CHARS = 700
MAX_REFERENCE_CLAIMS = 16


def _load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def load_store() -> dict:
    materials = _load("materials.json")
    rules = [rule for rule in _load("rules.json") if rule.get("enabled")]
    return {
        "version": _load("manifest.json").get("dataset_version", "1.0.0"),
        "materials": materials,
        "materials_by_id": {item["material_id"]: item for item in materials},
        "rules": rules,
        "documents": _load("documents.json"),
        "facts": _load("extracted_facts.json"),
        "requirements": _load("evidence_requirements.json"),
        "issues": _load("source_issues.json"),
        "history": _load("historical_cases.json"),
        "examples": _load("example_formulas.json"),
        "chunks": _load("source_chunks.json"),
        "regulatory_rows": _load("regulatory_reference_rows.json"),
        "data_dir": str(DATA),
    }


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
        provenance in {"dummy_editable", "dummy", "illustrative", "example"}
        or rule.get("is_regulatory_limit") is not True
    )


def _is_verified_rule(rule: dict) -> bool:
    return (
        rule.get("enabled") is not False
        and rule.get("is_regulatory_limit") is True
        and not _is_dummy(rule)
        and rule.get("source_document_ids")
    )


def validate_formula(formula: dict, store: dict) -> list[dict]:
    errors: list[dict] = []
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
        if rule["material_id"] == material_id
        and category in rule.get("product_categories", [])
        and age in rule.get("age_groups", [])
        and region in rule.get("regions", [])
    ]


def _match_documents(store: dict, requirement: dict, formula: dict, ingredient: dict | None, region: str) -> list[dict]:
    matched = []
    for document in store["documents"]:
        if document.get("document_type") != requirement["document_type"]:
            continue
        if document.get("scope") != requirement["scope"]:
            continue
        ok = True
        for field in requirement.get("match_fields", []):
            if field == "material_id" and document.get("material_id") != (ingredient or {}).get("material_id"):
                ok = False
            elif field == "batch_id" and document.get("batch_id") != (ingredient or {}).get("batch_id"):
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


def _evidence_message(status: str, near: list[dict], ingredient: dict | None) -> str:
    if near and status == "missing":
        names = ", ".join(item["document_id"] for item in near)
        batch = (ingredient or {}).get("batch_id") or "the entered batch"
        representative = any(item.get("representative_sample") for item in near)
        if representative:
            return f"{names} is a representative sample and does not cover batch {batch}."
        return f"{names} does not cover batch {batch}."
    if status == "needs_review":
        return "A matching document is on file but is not verified evidence for this material, batch, formula version, and region."
    return "Relevant evidence must be verified for this material/batch or formula version and region."


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
    for document in store["documents"]:
        if document.get("material_id") in material_ids:
            add(document["document_id"])
        if document.get("document_type") == "regulatory_summary" and set(document.get("regions") or []).intersection(regions):
            add(document["document_id"])
        if document.get("formula_id") == formula.get("formula_id") and document.get("version_id") in {None, formula.get("version_id")}:
            add(document["document_id"])
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


def build_context(formula: dict, store: dict | None = None, version_changes: list | None = None) -> dict:
    store = store or load_store()
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

    for region in regions:
        for row in formula["ingredients"]:
            applicable = _rules_for(store, row["material_id"], formula["product_category"], formula["age_group"], region)
            verified = [rule for rule in applicable if _is_verified_rule(rule)]
            illustrative = [rule for rule in applicable if _is_dummy(rule)]
            actual = float(row["concentration_percent"])
            if verified:
                for rule in verified:
                    passed = _within(actual, rule)
                    calculated_checks.append({
                        "check_id": f"{region}:{row['material_id']}:{rule['rule_id']}",
                        "status": "pass" if passed else "fail",
                        "material_id": row["material_id"],
                        "region": region,
                        "rule_id": rule["rule_id"],
                        "actual": actual,
                        "threshold": rule["threshold"],
                        "unit": rule.get("unit"),
                        "basis": rule.get("basis"),
                        "rule_provenance": rule.get("provenance"),
                        "verified_limit_available": True,
                        "illustrative_comparison": None,
                        "message": (
                            f"{_fmt(actual)}% is within the verified {_fmt(rule['threshold'])}% {rule.get('unit') or ''} limit ({rule.get('basis')})."
                            if passed
                            else f"{_fmt(actual)}% is outside the verified {_fmt(rule['threshold'])}% {rule.get('unit') or ''} limit ({rule.get('basis')})."
                        ),
                    })
            else:
                illustrative_comparison = None
                if illustrative:
                    rule = illustrative[0]
                    illustrative_comparison = {
                        "rule_id": rule["rule_id"],
                        "threshold": rule["threshold"],
                        "unit": rule.get("unit"),
                        "basis": rule.get("basis"),
                        "provenance": rule.get("provenance"),
                        "within_example": _within(actual, rule),
                        "note": "Illustrative software-testing threshold. Not used as a regulatory verdict.",
                    }
                calculated_checks.append({
                    "check_id": f"{region}:{row['material_id']}:NO-VERIFIED-THRESHOLD",
                    "status": "not_assessed",
                    "material_id": row["material_id"],
                    "region": region,
                    "rule_id": None,
                    "actual": actual,
                    "threshold": None,
                    "unit": "percent_w_w",
                    "basis": "as_supplied_material_in_finished_formula",
                    "rule_provenance": None,
                    "verified_limit_available": False,
                    "illustrative_comparison": illustrative_comparison,
                    "message": "No verified applicable threshold available.",
                })
        for requirement in store["requirements"]:
            rows = formula["ingredients"] if requirement["scope"] == "raw_material" else [None]
            for ingredient in rows:
                matched = _match_documents(store, requirement, formula, ingredient, region)
                verified_docs = [
                    document
                    for document in matched
                    if document.get("eligible_as_verified_evidence")
                    and document.get("review_status") == "verified"
                    and not document.get("representative_sample")
                ]
                material_id = ingredient["material_id"] if ingredient else None
                suffix = material_id or formula["version_id"]
                near: list[dict] = []
                if verified_docs:
                    status = "available"
                    gap_status = None
                    ids = [document["document_id"] for document in verified_docs]
                elif matched:
                    status = "needs_review"
                    gap_status = "unverified"
                    ids = [document["document_id"] for document in matched]
                else:
                    status = "missing"
                    gap_status = "missing"
                    if ingredient:
                        near = [
                            document
                            for document in store["documents"]
                            if document.get("document_type") == requirement["document_type"]
                            and document.get("material_id") == ingredient["material_id"]
                        ]
                    ids = [document["document_id"] for document in near[:1]]
                    if near and any(item.get("representative_sample") for item in near):
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
                    "message": _evidence_message(status, near, ingredient),
                }
                evidence_checks.append(check)
                record = {
                    **check,
                    "match_fields": requirement.get("match_fields") or [],
                    "policy_basis": requirement.get("policy_basis"),
                }
                if status == "available":
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
            limitations.append(f"{flag.get('document_id')} appears to need OCR; extracted text was empty or insufficient.")
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
    }


def _metrics(checks: list[dict], evidence: list[dict]) -> dict:
    passed = sum(1 for item in checks if item["status"] == "pass")
    failed = sum(1 for item in checks if item["status"] == "fail")
    not_assessed = sum(1 for item in checks if item["status"] == "not_assessed")
    decided = passed + failed
    verified = sum(1 for item in evidence if item["status"] == "available")
    return {
        "passed_checks": passed,
        "failed_checks": failed,
        "not_assessed_checks": not_assessed,
        "check_pass_rate_percent": None if decided == 0 else round(passed / decided * 100, 1),
        "evidence_coverage_percent": None if not evidence else round(verified / len(evidence) * 100, 1),
        "metrics_note": "Pass rate uses verified applicable checks only. Evidence coverage uses verified, in-scope, identity-matched documents. Neither value is an acceptance probability.",
        "acceptance_probability": None,
        "model_confidence": None,
        "ap_acceptance_probability": None,
    }


def _region_status(checks: list[dict]) -> str:
    if not checks or all(item["status"] == "not_assessed" for item in checks):
        return "not_assessed"
    if any(item["status"] == "fail" for item in checks):
        return "changes_required"
    return "review_required"


def screen_status(context: dict) -> tuple[str, dict]:
    by_region = {}
    for region in context["formula"]["regions"]:
        status = _region_status([item for item in context["calculated_checks"] if item["region"] == region])
        by_region[region] = {"screening_status": status, "regulatory_status": "not_assessed", "ap_cl_decision": None}
    statuses = [item["screening_status"] for item in by_region.values()]
    if "changes_required" in statuses:
        overall = "changes_required"
    elif "review_required" in statuses:
        overall = "review_required"
    else:
        overall = "not_assessed"
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
    for field in ("product_category", "age_group", "physical_form", "intended_use", "regions"):
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
