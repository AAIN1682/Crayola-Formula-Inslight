"""Overview dashboard aggregation from formulas and assessment run stores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.config import DATA
from app.threshold_catalog import build_threshold_context, normalize_category

router = APIRouter()

SCREENING_STATUSES = ("green", "amber", "red", "not-screened")
GAP_EVIDENCE_STATUSES = frozenset({"missing", "needs_review", "mismatched", "applicability_unknown"})
PHYSICAL_FORM_TO_API = {
    "Liquid": "liquid",
    "Gel": "gel",
    "Paste": "paste",
    "Solid stick": "solid",
    "Powder": "powder",
}
PHYSICAL_FORM_FROM_API = {value: key for key, value in PHYSICAL_FORM_TO_API.items()}


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _field(record: dict[str, Any] | None, *keys: str, default: Any = None) -> Any:
    if not isinstance(record, dict):
        return default
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return default


def _normalize_ingredients(rows: list[Any] | None) -> list[dict[str, Any]]:
    ingredients: list[dict[str, Any]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        material_id = _field(row, "material_id", "rawMaterialId", "raw_material_id")
        concentration = _field(row, "concentration_percent", "concentration")
        if not material_id or concentration is None:
            continue
        batch_id = _field(row, "batchId", "batch_id")
        ingredients.append(
            {
                "material_id": str(material_id),
                "rawMaterialId": str(material_id),
                "concentration": float(concentration),
                "concentration_percent": float(concentration),
                "batchId": batch_id,
                "batch_id": batch_id,
            }
        )
    return ingredients


def normalize_formula_record(record: dict[str, Any]) -> dict[str, Any]:
    """Flatten example_formulas-style entries (optional wrapper + input) for dashboard use."""
    payload = record.get("input") if isinstance(record.get("input"), dict) else record
    formula_id = str(
        _field(payload, "formula_id")
        or _field(record, "formula_id")
        or _field(record, "id")
        or ""
    ).strip()
    version = str(
        _field(payload, "version_id")
        or _field(record, "version")
        or _field(record, "version_id")
        or ""
    ).strip()
    product_category = str(_field(payload, "product_category") or _field(record, "product_category") or "")
    category = normalize_category(product_category) or _field(record, "category") or product_category
    regions = list(_field(payload, "regions") or _field(record, "targetMarkets", "target_markets") or [])
    physical_api = str(_field(payload, "physical_form") or _field(record, "physical_form") or "liquid").lower()
    physical_ui = _field(record, "physicalForm", "physical_form") or PHYSICAL_FORM_FROM_API.get(physical_api, physical_api)
    ingredients = _normalize_ingredients(_field(payload, "ingredients") or _field(record, "ingredients"))
    lifecycle = _field(record, "lifecycle") or _field(payload, "lifecycle") or "active"
    return {
        "id": formula_id,
        "formula_id": formula_id,
        "name": str(_field(payload, "name") or _field(record, "name") or "Unnamed formula"),
        "version": version,
        "version_id": version,
        "category": category,
        "product_category": product_category or category,
        "ageGroup": _field(payload, "age_group") or _field(record, "ageGroup", "age_group"),
        "age_group": _field(payload, "age_group") or _field(record, "ageGroup", "age_group"),
        "targetMarkets": regions,
        "regions": regions,
        "physicalForm": physical_ui,
        "physical_form": physical_api,
        "intendedUse": _field(payload, "intended_use") or _field(record, "intendedUse", "intended_use") or "",
        "intended_use": _field(payload, "intended_use") or _field(record, "intendedUse", "intended_use") or "",
        "ingredients": ingredients,
        "lifecycle": lifecycle,
        "reviewStatus": _field(record, "reviewStatus", "review_status"),
        "review_status": _field(record, "reviewStatus", "review_status"),
        "screeningStatus": _field(record, "screeningStatus", "screening_status"),
        "screening_status": _field(record, "screeningStatus", "screening_status"),
        "createdAt": _field(record, "createdAt", "created_at"),
        "created_at": _field(record, "createdAt", "created_at"),
        "updatedAt": _field(record, "updatedAt", "updated_at"),
        "updated_at": _field(record, "updatedAt", "updated_at"),
        "reviewerName": _field(record, "reviewerName", "reviewer_name"),
        "reviewer_name": _field(record, "reviewerName", "reviewer_name"),
        "compositionCompleteness": _field(payload, "composition_completeness", "compositionCompleteness")
        or _field(record, "compositionCompleteness", "composition_completeness"),
        "usStates": _field(payload, "us_states") or _field(record, "usStates", "us_states") or [],
        "intendedAgeDetail": _field(payload, "intended_age_detail") or _field(record, "intendedAgeDetail", "intended_age_detail"),
        "toyChildcareScope": _field(payload, "toy_childcare_scope") or _field(record, "toyChildcareScope", "toy_childcare_scope"),
        "componentType": _field(payload, "component_type") or _field(record, "componentType", "component_type"),
        "testMaterialCategory": _field(payload, "test_material_category")
        or _field(record, "testMaterialCategory", "test_material_category"),
        "evidenceIds": _field(record, "evidenceIds", "evidence_ids") or [],
        "example_id": _field(record, "example_id"),
    }


def load_formulas() -> list[dict[str, Any]]:
    """Read the formula library through formula_store, then flatten records for dashboard fields."""
    from app.formula_store import Formula, _ensure_storage
    from app.formula_store import FORMULAS_PATH as formulas_path

    _ensure_storage()
    if not formulas_path.is_file():
        return []
    try:
        raw = json.loads(formulas_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail="Saved formulas could not be read.") from error
    except OSError as error:
        raise HTTPException(status_code=500, detail="Saved formulas could not be read.") from error
    if not isinstance(raw, list):
        raise HTTPException(status_code=500, detail="Saved formulas could not be read.")
    try:
        models = [Formula.model_validate(item) for item in raw]
    except Exception as error:
        raise HTTPException(status_code=500, detail="Saved formulas could not be read.") from error
    return [normalize_formula_record(item.model_dump()) for item in models if item.id]


def load_assessment_store() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Use screening history, including its derived latest map and read errors."""
    from app.screening_service import ScreeningServiceError, load_runs

    try:
        history = load_runs()
    except ScreeningServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    return list(history["runs"]), dict(history["latest"])


def _parse_time(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _map_package_screening_status(status: str) -> str:
    normalized = str(status or "").strip().lower()
    if normalized == "changes_required":
        return "red"
    if normalized == "no_issues_found_in_assessed_scope":
        return "green"
    if normalized in {"more_information_required", "not_assessed"}:
        return "amber"
    return "amber"


def _run_formula_id(run: dict[str, Any]) -> str:
    direct = str(_field(run, "formulaId", "formula_id", default="") or "")
    if direct:
        return direct
    snapshot = _field(run, "input_snapshot")
    if isinstance(snapshot, dict):
        found = str(_field(snapshot, "formula_id", default="") or "")
        if found:
            return found
    assessment = _field(run, "formulaAssessment", "formula_assessment", "assessment")
    if isinstance(assessment, dict):
        nested = _field(assessment, "input_snapshot", default={}) or {}
        return str(_field(nested, "formula_id", default="") or "")
    return ""


def _run_id(run: dict[str, Any]) -> str:
    return str(
        _field(run, "id", "run_id", "runId", "assessment_id")
        or _field(_field(run, "formulaAssessment", "formula_assessment", "assessment"), "assessment_id")
        or ""
    )


def _latest_run_by_time(formula_id: str, runs: list[dict[str, Any]]) -> dict[str, Any] | None:
    matches = [run for run in runs if _run_formula_id(run) == formula_id]
    if not matches:
        return None

    def sort_key(run: dict[str, Any]) -> tuple[float, str]:
        run_at = _parse_time(_field(run, "runAt", "run_at", "created_at", "createdAt"))
        assessment = _field(run, "formulaAssessment", "formula_assessment", "assessment")
        if not run_at and isinstance(assessment, dict):
            run_at = _parse_time(_field(assessment, "created_at"))
        return (run_at.timestamp() if run_at else 0.0, _run_id(run))

    return max(matches, key=sort_key)


def _run_for_pointer(pointer: Any, runs: list[dict[str, Any]]) -> dict[str, Any] | None:
    if isinstance(pointer, str) and pointer:
        wanted = pointer
    elif isinstance(pointer, dict):
        wanted = str(_field(pointer, "assessment_id", "id", "run_id", "runId") or "")
    else:
        return None
    if not wanted:
        return None
    for run in runs:
        if _run_id(run) == wanted:
            return run
    return None


def resolve_latest_run(formula_id: str, runs: list[dict[str, Any]], latest: dict[str, Any]) -> dict[str, Any] | None:
    """Return the saved assessment for a formula.

    screening_service stores latest[formula_id] as a status summary, not the run.
    A summary is used only to find assessment_id. The matching run is what status
    and currentness read.
    """
    if not formula_id:
        return None
    pointer = latest.get(formula_id) if isinstance(latest, dict) else None
    matched = _run_for_pointer(pointer, runs)
    if matched:
        return matched
    by_time = _latest_run_by_time(formula_id, runs)
    if by_time:
        return by_time
    return pointer if isinstance(pointer, dict) else None


def _ingredient_signature(ingredients: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for row in ingredients:
        if not isinstance(row, dict):
            continue
        material = _field(row, "rawMaterialId", "raw_material_id", "material_id", "name", default="")
        concentration = _field(row, "concentration", "concentration_percent", default="")
        try:
            concentration = f"{float(concentration):g}"
        except (TypeError, ValueError):
            concentration = str(concentration)
        batch = _field(row, "batchId", "batch_id", default="")
        parts.append(f"{material}@{concentration}@{batch or ''}")
    return "|".join(sorted(parts))


def _run_input_snapshot(run: dict[str, Any]) -> dict[str, Any]:
    assessment = _field(run, "formulaAssessment", "formula_assessment", "assessment")
    if isinstance(assessment, dict):
        snapshot = _field(assessment, "input_snapshot", default={})
        if isinstance(snapshot, dict):
            return snapshot
    snapshot = _field(run, "input_snapshot", default={})
    return snapshot if isinstance(snapshot, dict) else {}


def is_run_current(formula: dict[str, Any], run: dict[str, Any] | None) -> bool:
    if not run:
        return False
    if _field(run, "legacySample", "legacy_sample", default=False):
        return False
    snapshot = _run_input_snapshot(run)
    run_version = (
        _field(run, "formulaVersion", "formula_version")
        or _field(snapshot, "version_id")
        or _field(run, "version_id")
        or ""
    )
    formula_version = str(_field(formula, "version", "version_id", default=""))
    if not run_version or not formula_version or str(run_version) != formula_version:
        return False
    run_age = _field(run, "ageGroup", "age_group") or _field(snapshot, "age_group")
    formula_age = _field(formula, "ageGroup", "age_group")
    if run_age and run_age != formula_age:
        return False
    run_markets = _field(run, "targetMarkets", "target_markets") or _field(snapshot, "regions") or []
    formula_markets = _field(formula, "targetMarkets", "target_markets", "regions", default=[]) or []
    if run_markets and set(run_markets) != set(formula_markets):
        return False
    run_physical = _field(run, "physicalForm", "physical_form") or _field(snapshot, "physical_form")
    formula_physical = _field(formula, "physical_form") or _field(formula, "physicalForm")
    if run_physical and formula_physical:
        run_physical_key = str(run_physical).lower()
        formula_physical_key = str(formula_physical).lower()
        if run_physical_key != formula_physical_key and PHYSICAL_FORM_FROM_API.get(run_physical_key) != formula_physical:
            return False
    run_use = _field(run, "intendedUse", "intended_use") or _field(snapshot, "intended_use")
    formula_use = _field(formula, "intendedUse", "intended_use")
    if run_use and formula_use and run_use != formula_use:
        return False
    run_category = _field(run, "category") or normalize_category(str(_field(snapshot, "product_category") or ""))
    formula_category = _field(formula, "category") or normalize_category(str(_field(formula, "product_category") or ""))
    if run_category and formula_category and run_category != formula_category:
        return False
    snapshot_ingredients = _field(run, "ingredientSnapshot", "ingredient_snapshot") or _field(snapshot, "ingredients") or []
    if not snapshot_ingredients:
        return False
    current = _field(formula, "ingredients", default=[])
    return _ingredient_signature(current) == _ingredient_signature(snapshot_ingredients)


def _mapped_engine_status(record: dict[str, Any] | None) -> str | None:
    if not isinstance(record, dict):
        return None
    engine_status = _field(record, "screening_status")
    if not engine_status:
        return None
    return _map_package_screening_status(str(engine_status))


def screening_status_for(formula: dict[str, Any], run: dict[str, Any] | None) -> str:
    if not run:
        stored = _field(formula, "screeningStatus", "screening_status")
        if stored in SCREENING_STATUSES:
            return str(stored)
        return "not-screened"
    direct = _field(run, "status")
    if direct in SCREENING_STATUSES and direct != "not-screened":
        return str(direct)
    mapped = _mapped_engine_status(run)
    if mapped:
        return mapped
    assessment = _field(run, "formulaAssessment", "formula_assessment")
    mapped = _mapped_engine_status(assessment if isinstance(assessment, dict) else None)
    if mapped:
        return mapped
    stored = _field(formula, "screeningStatus", "screening_status")
    if stored in SCREENING_STATUSES:
        return str(stored)
    return "amber"


def _formula_to_threshold_input(formula: dict[str, Any]) -> dict[str, Any] | None:
    regions = [
        market
        for market in (_field(formula, "targetMarkets", "target_markets", "regions", default=[]) or [])
        if market in {"US", "EU"}
    ]
    if not regions:
        return None
    category = _field(formula, "category") or normalize_category(str(_field(formula, "product_category", default="") or ""))
    if not category:
        return None
    age_group = _field(formula, "ageGroup", "age_group")
    if age_group not in {"under_12", "12_and_above"}:
        return None
    physical = _field(formula, "physical_form") or _field(formula, "physicalForm", default="liquid")
    physical_form = PHYSICAL_FORM_TO_API.get(str(physical), str(physical).lower())
    ingredients: list[dict[str, Any]] = []
    for row in _field(formula, "ingredients", default=[]) or []:
        if not isinstance(row, dict):
            continue
        material_id = _field(row, "rawMaterialId", "raw_material_id", "material_id")
        if not material_id:
            continue
        concentration = _field(row, "concentration", "concentration_percent")
        if concentration is None:
            continue
        ingredients.append(
            {
                "material_id": str(material_id),
                "concentration_percent": float(concentration),
                "batch_id": _field(row, "batchId", "batch_id"),
            }
        )
    if not ingredients:
        return None
    formula_id = str(_field(formula, "id", "formula_id", default=""))
    version_id = str(_field(formula, "version", "version_id", default=""))
    product_category = str(_field(formula, "product_category") or category)
    if not formula_id or not version_id:
        return None
    return {
        "formula_id": formula_id,
        "version_id": version_id,
        "name": str(_field(formula, "name", default="Unnamed formula")),
        "product_category": product_category,
        "age_group": age_group,
        "regions": list(dict.fromkeys(regions)),
        "physical_form": physical_form,
        "intended_use": str(_field(formula, "intendedUse", "intended_use", default="") or "General use"),
        "ingredients": ingredients,
        "legacy_materials": [],
        "assessment_mode": "evidence",
        "composition_completeness": _field(formula, "compositionCompleteness", "composition_completeness") or "partial",
        "us_states": _field(formula, "usStates", "us_states", default=[]) or [],
        "intended_age_detail": _field(formula, "intendedAgeDetail", "intended_age_detail"),
        "toy_childcare_scope": _field(formula, "toyChildcareScope", "toy_childcare_scope"),
        "component_type": _field(formula, "componentType", "component_type"),
        "test_material_category": _field(formula, "testMaterialCategory", "test_material_category"),
        "document_ids": _field(formula, "evidenceIds", "evidence_ids", default=[]) or [],
    }


def missing_evidence_count(formula: dict[str, Any], run: dict[str, Any] | None) -> int:
    if run:
        required = _field(run, "requiredEvidenceCount", "required_evidence_count")
        present = _field(run, "presentEvidenceCount", "present_evidence_count")
        if isinstance(required, (int, float)) and isinstance(present, (int, float)):
            return max(0, int(required) - int(present))
        for source in (run, _field(run, "formulaAssessment", "formula_assessment")):
            if not isinstance(source, dict):
                continue
            metrics = _field(source, "metrics", default={}) or {}
            missing = metrics.get("evidence_missing") if isinstance(metrics, dict) else None
            if isinstance(missing, (int, float)):
                return max(0, int(missing))
            checks = (_field(source, "llm_context", default={}) or {}).get("evidence_checks") or []
            if isinstance(checks, list) and checks:
                return sum(1 for item in checks if isinstance(item, dict) and item.get("status") in GAP_EVIDENCE_STATUSES)
    payload = _formula_to_threshold_input(formula)
    if not payload:
        return 0
    try:
        context = build_threshold_context(payload)
    except ValueError:
        return 0
    missing = context.get("missing_evidence") or []
    return len(missing) if isinstance(missing, list) else 0


def main_concern(formula: dict[str, Any], run: dict[str, Any] | None, screening_current: bool) -> str:
    if not run:
        return "Not screened yet"
    if not screening_current:
        return "Formula changed since last screening"
    findings = _field(run, "findings", default=[]) or []
    if isinstance(findings, list):
        for severity in ("high", "medium"):
            for finding in findings:
                if isinstance(finding, dict) and finding.get("severity") == severity:
                    text = _field(finding, "concern", "explanation", default="")
                    if text:
                        return str(text)
    review_status = _field(formula, "reviewStatus", "review_status")
    if review_status == "awaiting-evidence":
        return "Awaiting requested evidence"
    return "No open concerns from the demo checks"


def _last_month_starts(count: int) -> list[datetime]:
    cursor = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months: list[datetime] = []
    for offset in range(count - 1, -1, -1):
        year = cursor.year
        month = cursor.month - offset
        while month <= 0:
            month += 12
            year -= 1
        months.append(datetime(year, month, 1, tzinfo=timezone.utc))
    return months


def _total_trend(formulas: list[dict[str, Any]], months: list[datetime]) -> list[int]:
    trend: list[int] = []
    for month_start in months:
        if month_start.month == 12:
            month_end = datetime(month_start.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            month_end = datetime(month_start.year, month_start.month + 1, 1, tzinfo=timezone.utc)
        count = 0
        for formula in formulas:
            created = _parse_time(_field(formula, "createdAt", "created_at"))
            if created and created.timestamp() < month_end.timestamp():
                count += 1
        trend.append(count)
    return trend


def build_dashboard_summary() -> dict[str, Any]:
    all_formulas = load_formulas()
    runs, latest_by_formula = load_assessment_store()
    archived = [formula for formula in all_formulas if _field(formula, "lifecycle") == "archived"]
    active = [formula for formula in all_formulas if _field(formula, "lifecycle") != "archived"]

    rows: list[dict[str, Any]] = []
    for formula in active:
        formula_id = str(_field(formula, "id", "formula_id", default=""))
        latest = resolve_latest_run(formula_id, runs, latest_by_formula) if formula_id else None
        current = is_run_current(formula, latest)
        status = screening_status_for(formula, latest)
        missing = missing_evidence_count(formula, latest)
        rows.append(
            {
                "formula": formula,
                "formula_id": formula_id,
                "latest_run": latest,
                "screening_status": status,
                "screening_current": current,
                "missing_evidence_count": missing,
                "main_concern": main_concern(formula, latest, current),
                "reviewer_name": str(_field(formula, "reviewerName", "reviewer_name", default="Unassigned") or "Unassigned"),
                "updated_at": str(_field(formula, "updatedAt", "updated_at", default="") or ""),
            }
        )

    awaiting_review = [
        row
        for row in rows
        if row["screening_status"] != "not-screened"
        and _field(row["formula"], "reviewStatus", "review_status") != "complete"
    ]
    missing_evidence = [row for row in rows if row["missing_evidence_count"] > 0]
    outdated = [
        row for row in rows if row["screening_status"] != "not-screened" and not row["screening_current"]
    ]

    months = _last_month_starts(6)
    metrics = [
        {
            "key": "total",
            "label": "Total formulas",
            "value": len(active),
            "caption": f"{len(archived)} archived",
            "to": "/formulas",
            "trend": _total_trend(all_formulas, months),
        },
        {
            "key": "awaiting-review",
            "label": "Awaiting review",
            "value": len(awaiting_review),
            "caption": "Screened, internal review not complete",
            "to": "/formulas?review=pending",
        },
        {
            "key": "missing-evidence",
            "label": "Missing evidence",
            "value": len(missing_evidence),
            "caption": "At least one required document absent",
            "to": "/formulas?evidence=missing",
        },
    ]

    status_distribution = []
    for status in SCREENING_STATUSES:
        count = sum(1 for row in rows if row["screening_status"] == status)
        share = 0 if not active else count / len(active)
        status_distribution.append({"status": status, "count": count, "share": share})

    priority_queue: list[dict[str, Any]] = []
    for row in rows:
        formula = row["formula"]
        priority = 0
        screening_status = row["screening_status"]
        review_status = _field(formula, "reviewStatus", "review_status")
        if screening_status == "red" and review_status != "complete":
            priority += 100
        if screening_status != "not-screened" and not row["screening_current"]:
            priority += 70
        if row["missing_evidence_count"] > 0:
            priority += 45
        if screening_status == "amber" and review_status != "complete":
            priority += 40
        if screening_status == "not-screened":
            priority += 30
        if review_status == "returned":
            priority += 25
        if priority <= 0:
            continue
        priority_queue.append(
            {
                "formulaId": row["formula_id"],
                "formulaName": str(_field(formula, "name", default="Unnamed formula")),
                "version": str(_field(formula, "version", default="")),
                "category": _field(formula, "category", default="Paints"),
                "screeningStatus": screening_status,
                "screeningCurrent": row["screening_current"],
                "mainConcern": row["main_concern"],
                "reviewerName": row["reviewer_name"],
                "updatedAt": row["updated_at"],
                "priority": priority,
            }
        )

    priority_queue.sort(
        key=lambda item: (
            -int(item["priority"]),
            -(_parse_time(item.get("updatedAt")) or datetime.min.replace(tzinfo=timezone.utc)).timestamp(),
        )
    )
    priority_queue = priority_queue[:7]

    return {
        "metrics": metrics,
        "statusDistribution": status_distribution,
        "outcomeTrend": [],
        "priorityQueue": priority_queue,
        "recentActivity": [],
        "outdatedCount": len(outdated),
        "dueForReviewCount": 0,
    }


@router.get("/api/dashboard")
def get_dashboard() -> dict[str, Any]:
    return build_dashboard_summary()
