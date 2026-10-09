"""Formula metadata persistence for Formula Library and New Formula flows."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.config import DATA

logger = logging.getLogger("affine.formula_store")

FORMULAS_PATH = DATA / "formulas.json"
FORMULAS_SEED_PATH = DATA / "formulas.seed.json"
_FILE_LOCK = asyncio.Lock()
_ID_PATTERN = re.compile(r"^FML-(\d+)$")

ScreeningStatus = Literal["green", "amber", "red", "not-screened"]
ReviewStatus = Literal["not-started", "in-review", "awaiting-evidence", "complete", "returned"]
Lifecycle = Literal["draft", "active", "archived"]
AgeGroup = Literal["under_12", "12_and_above"]
TargetMarket = Literal["US", "EU", "UK", "CA"]
PhysicalForm = Literal["Liquid", "Gel", "Paste", "Solid stick", "Powder"]
ProductCategory = Literal[
    "Markers",
    "Paints",
    "Crayons",
    "Modeling Compounds",
    "Future / Novelty Products",
    "Glue",
]
ScreeningRole = Literal["formulation_ingredient", "contaminant_analyte", "role_requires_review"]
AssessmentMode = Literal["evidence", "scenario"]
CompositionCompleteness = Literal["partial", "complete"]

router = APIRouter(tags=["formulas"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Ingredient(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    rawMaterialId: str | None = None
    concentration: float
    supplier: str | None = None
    evidenceIds: list[str] = Field(default_factory=list)
    addedInVersion: str | None = None
    notes: str | None = None
    batchId: str | None = None
    compositionType: str | None = None
    screeningRole: ScreeningRole | None = None
    needsCorrection: bool | None = None
    measuredValue: float | None = None
    measuredUnit: str | None = None
    measuredBound: str | None = None
    measurementKind: str | None = None
    testMethod: str | None = None


class Formula(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(pattern=r"^FML-\d{4}$")
    name: str = Field(min_length=1, max_length=200)
    version: str = Field(min_length=1, max_length=40)
    category: ProductCategory
    ageGroup: AgeGroup
    recordedAgeGroup: str | None = None
    ageGroupNeedsSelection: bool = False
    targetMarkets: list[TargetMarket] = Field(min_length=1)
    physicalForm: PhysicalForm
    intendedUse: str = Field(min_length=1, max_length=1000)
    ownerId: str = Field(min_length=1, max_length=80)
    reviewerId: str | None = None
    lifecycle: Lifecycle
    ingredients: list[Ingredient] = Field(default_factory=list)
    evidenceIds: list[str] = Field(default_factory=list)
    screeningStatus: ScreeningStatus = "not-screened"
    preferredAssessmentMode: AssessmentMode | None = None
    scenarioOfFormulaId: str | None = None
    screeningCurrent: bool = False
    latestRunId: str | None = None
    lastScreenedAt: str | None = None
    reviewStatus: ReviewStatus = "not-started"
    createdAt: str
    updatedAt: str
    nextReviewDate: str | None = None
    originSubmissionId: str | None = None
    description: str | None = None
    compositionCompleteness: CompositionCompleteness | None = None
    usStates: list[str] | None = None
    intendedAgeDetail: str | None = None
    toyChildcareScope: str | None = None
    componentType: str | None = None
    testMaterialCategory: str | None = None
    missingEvidenceCount: int | None = None


class IngredientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    rawMaterialId: str | None = None
    concentration: float
    supplier: str | None = None
    evidenceIds: list[str] = Field(default_factory=list)
    addedInVersion: str | None = None
    notes: str | None = None
    batchId: str | None = None
    compositionType: str | None = None
    screeningRole: ScreeningRole | None = None
    needsCorrection: bool | None = None
    measuredValue: float | None = None
    measuredUnit: str | None = None
    measuredBound: str | None = None
    measurementKind: str | None = None
    testMethod: str | None = None


class FormulaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    version: str | None = None
    category: ProductCategory | None = None
    ageGroup: AgeGroup | None = None
    recordedAgeGroup: str | None = None
    ageGroupNeedsSelection: bool | None = None
    targetMarkets: list[TargetMarket] | None = None
    physicalForm: PhysicalForm | None = None
    intendedUse: str = Field(min_length=1, max_length=1000)
    ownerId: str = Field(min_length=1, max_length=80)
    reviewerId: str | None = None
    lifecycle: Lifecycle | None = None
    ingredients: list[IngredientCreate] = Field(default_factory=list)
    evidenceIds: list[str] = Field(default_factory=list)
    preferredAssessmentMode: AssessmentMode | None = None
    scenarioOfFormulaId: str | None = None
    nextReviewDate: str | None = None
    originSubmissionId: str | None = None
    description: str | None = None
    compositionCompleteness: CompositionCompleteness | None = None
    usStates: list[str] | None = None
    intendedAgeDetail: str | None = None
    toyChildcareScope: str | None = None
    componentType: str | None = None
    testMaterialCategory: str | None = None


class FormulaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    version: str | None = Field(default=None, min_length=1, max_length=40)
    category: ProductCategory | None = None
    ageGroup: AgeGroup | None = None
    recordedAgeGroup: str | None = None
    ageGroupNeedsSelection: bool | None = None
    targetMarkets: list[TargetMarket] | None = None
    physicalForm: PhysicalForm | None = None
    intendedUse: str | None = Field(default=None, min_length=1, max_length=1000)
    ownerId: str | None = Field(default=None, min_length=1, max_length=80)
    reviewerId: str | None = None
    lifecycle: Lifecycle | None = None
    ingredients: list[Ingredient] | None = None
    evidenceIds: list[str] | None = None
    screeningStatus: ScreeningStatus | None = None
    preferredAssessmentMode: AssessmentMode | None = None
    scenarioOfFormulaId: str | None = None
    screeningCurrent: bool | None = None
    latestRunId: str | None = None
    lastScreenedAt: str | None = None
    reviewStatus: ReviewStatus | None = None
    nextReviewDate: str | None = None
    originSubmissionId: str | None = None
    description: str | None = None
    compositionCompleteness: CompositionCompleteness | None = None
    usStates: list[str] | None = None
    intendedAgeDetail: str | None = None
    toyChildcareScope: str | None = None
    componentType: str | None = None
    testMaterialCategory: str | None = None


class PaginatedFormulas(BaseModel):
    items: list[Formula]
    total: int
    page: int
    pageSize: int
    pageCount: int


def _restore_from_seed() -> bool:
    if not FORMULAS_SEED_PATH.is_file():
        return False
    shutil.copyfile(FORMULAS_SEED_PATH, FORMULAS_PATH)
    raw = json.loads(FORMULAS_PATH.read_text(encoding="utf-8-sig"))
    if not isinstance(raw, list):
        raise ValueError("formulas.seed.json must be a JSON array")
    for index, item in enumerate(raw):
        Formula.model_validate(item)
    logger.warning(
        "formulas.json was missing; restored %s record(s) from formulas.seed.json",
        len(raw),
    )
    return True


def _ensure_storage() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    if FORMULAS_PATH.is_file():
        return
    if _restore_from_seed():
        return
    logger.warning("formulas.json and formulas.seed.json are missing; initializing empty library")
    FORMULAS_PATH.write_text("[]\n", encoding="utf-8")


_ensure_storage()


async def _read_raw() -> list[dict[str, Any]]:
    _ensure_storage()

    def _read() -> list[dict[str, Any]]:
        payload = json.loads(FORMULAS_PATH.read_text(encoding="utf-8-sig"))
        if not isinstance(payload, list):
            raise ValueError("formulas.json must be a JSON array")
        return payload

    return await asyncio.to_thread(_read)


async def _write_raw(records: list[dict[str, Any]]) -> None:
    def _write() -> None:
        _ensure_storage()
        tmp = FORMULAS_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, FORMULAS_PATH)

    async with _FILE_LOCK:
        await asyncio.to_thread(_write)


def _dump_storage(formula: Formula) -> dict[str, Any]:
    data = formula.model_dump(mode="json")
    data.pop("missingEvidenceCount", None)
    return data


async def load_formulas() -> list[Formula]:
    raw = await _read_raw()
    return [Formula.model_validate(item) for item in raw]


async def save_formulas(formulas: list[Formula]) -> None:
    await _write_raw([_dump_storage(item) for item in formulas])


async def replace_formula(updated: Formula) -> Formula:
    """integration: update one record without bypassing validation or screeningCurrent rules."""
    store = await load_formulas()
    for index, formula in enumerate(store):
        if formula.id != updated.id:
            continue
        store[index] = updated
        await save_formulas(store)
        return updated
    raise HTTPException(status_code=404, detail=f"Formula {updated.id} was not found.")


async def apply_screening_outcome(
    formula_id: str,
    *,
    screening_status: ScreeningStatus,
    latest_run_id: str,
    last_screened_at: str,
    review_status: ReviewStatus,
    preferred_assessment_mode: str | None,
) -> Formula:
    """integration: persist screening results via formula_store only."""
    store = await load_formulas()
    for index, formula in enumerate(store):
        if formula.id != formula_id:
            continue
        updated = formula.model_copy(
            update={
                "screeningStatus": screening_status,
                "screeningCurrent": True,
                "latestRunId": latest_run_id,
                "lastScreenedAt": last_screened_at,
                "reviewStatus": review_status,
                "preferredAssessmentMode": preferred_assessment_mode or formula.preferredAssessmentMode,
                "updatedAt": _utc_now_iso(),
            }
        )
        store[index] = updated
        await save_formulas(store)
        return updated
    raise HTTPException(status_code=404, detail=f"Formula {formula_id} was not found.")


def _next_formula_id(existing: list[Formula]) -> str:
    highest = 1000
    for formula in existing:
        match = _ID_PATTERN.match(formula.id)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"FML-{highest + 1:04d}"


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _matches_search(formula: Formula, needle: str) -> bool:
    if not needle:
        return True
    fields = [formula.name, formula.id, formula.description or ""]
    return any(needle in field.lower() for field in fields)


def _ingredient_signature(ingredients: list[Ingredient]) -> tuple[tuple[Any, ...], ...]:
    return tuple(
        sorted(
            (
                (item.rawMaterialId or "", item.name.strip().lower(), round(item.concentration, 6)),
            )
            for item in ingredients
        )
    )


def _screening_inputs_changed(previous: Formula, updated: Formula) -> bool:
    if previous.version != updated.version:
        return True
    if previous.ageGroup != updated.ageGroup:
        return True
    if previous.targetMarkets != updated.targetMarkets:
        return True
    if previous.physicalForm != updated.physicalForm:
        return True
    if previous.intendedUse != updated.intendedUse:
        return True
    if previous.category != updated.category:
        return True
    return _ingredient_signature(previous.ingredients) != _ingredient_signature(updated.ingredients)


def _build_from_create(body: FormulaCreate, existing: list[Formula]) -> Formula:
    now = _utc_now_iso()
    formula_id = _next_formula_id(existing)
    ingredients: list[Ingredient] = []
    for index, ingredient in enumerate(body.ingredients):
        row = Ingredient(
            id=ingredient.id or f"{formula_id}-ING-{index + 1:02d}",
            name=ingredient.name.strip(),
            rawMaterialId=ingredient.rawMaterialId,
            concentration=ingredient.concentration if math.isfinite(ingredient.concentration) else 0,
            supplier=ingredient.supplier,
            evidenceIds=ingredient.evidenceIds,
            addedInVersion=ingredient.addedInVersion,
            notes=ingredient.notes,
            batchId=ingredient.batchId,
            compositionType=ingredient.compositionType,
            screeningRole=ingredient.screeningRole,
            needsCorrection=ingredient.needsCorrection,
            measuredValue=ingredient.measuredValue,
            measuredUnit=ingredient.measuredUnit,
            measuredBound=ingredient.measuredBound,
            measurementKind=ingredient.measurementKind,
            testMethod=ingredient.testMethod,
        )
        ingredients.append(row)

    return Formula(
        id=formula_id,
        name=body.name.strip(),
        version=(body.version or "v1.0").strip(),
        category=body.category or "Markers",
        ageGroup=body.ageGroup or "under_12",
        recordedAgeGroup=body.recordedAgeGroup,
        ageGroupNeedsSelection=body.ageGroupNeedsSelection or False,
        targetMarkets=body.targetMarkets or ["US"],
        physicalForm=body.physicalForm or "Liquid",
        intendedUse=body.intendedUse.strip(),
        ownerId=body.ownerId,
        reviewerId=body.reviewerId,
        lifecycle=body.lifecycle or "draft",
        ingredients=ingredients,
        evidenceIds=body.evidenceIds,
        screeningStatus="not-screened",
        reviewStatus="not-started",
        screeningCurrent=False,
        createdAt=now,
        updatedAt=now,
        preferredAssessmentMode=body.preferredAssessmentMode,
        scenarioOfFormulaId=body.scenarioOfFormulaId,
        nextReviewDate=body.nextReviewDate,
        originSubmissionId=body.originSubmissionId,
        description=body.description,
        compositionCompleteness=body.compositionCompleteness,
        usStates=body.usStates,
        intendedAgeDetail=body.intendedAgeDetail,
        toyChildcareScope=body.toyChildcareScope,
        componentType=body.componentType,
        testMaterialCategory=body.testMaterialCategory,
    )


def _apply_update(base: Formula, body: FormulaUpdate) -> Formula:
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=422, detail="No fields provided for update.")
    merged = base.model_dump()
    merged.update(patch)
    merged["updatedAt"] = _utc_now_iso()
    updated = Formula.model_validate(merged)
    if base.latestRunId and _screening_inputs_changed(base, updated):
        updated = updated.model_copy(update={"screeningCurrent": False})
    return updated


def _sort_key(formula: Formula, sort_key: str) -> str | float:
    if sort_key == "name":
        return formula.name.lower()
    if sort_key == "version":
        return formula.version
    if sort_key == "category":
        return formula.category
    if sort_key == "ingredientCount":
        return len(formula.ingredients)
    if sort_key == "screeningStatus":
        return formula.screeningStatus
    if sort_key == "reviewStatus":
        return formula.reviewStatus
    if sort_key == "owner":
        return formula.ownerId
    if sort_key == "updatedAt":
        return formula.updatedAt
    return formula.updatedAt


@router.get("/api/formulas", response_model=PaginatedFormulas)
async def list_formulas(
    search: str | None = Query(default=None),
    category: Annotated[list[str] | None, Query()] = None,
    screeningStatus: Annotated[list[str] | None, Query()] = None,
    reviewStatus: Annotated[list[str] | None, Query()] = None,
    ownerId: Annotated[list[str] | None, Query()] = None,
    lifecycle: Annotated[list[str] | None, Query()] = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=1000),
    sortKey: str = Query(default="updatedAt"),
    sortDirection: Literal["asc", "desc"] = Query(default="desc"),
) -> PaginatedFormulas:
    """List formulas with filters aligned to the frontend FormulaFilters HTTP encoding."""
    store = await load_formulas()
    lifecycle_set = {item.strip() for item in lifecycle} if lifecycle else {"draft", "active"}
    categories = {_normalize(item) for item in category} if category else None
    screenings = {_normalize(item) for item in screeningStatus} if screeningStatus else None
    reviews = {_normalize(item) for item in reviewStatus} if reviewStatus else None
    owners = {_normalize(item) for item in ownerId} if ownerId else None
    needle = _normalize(search)

    filtered: list[Formula] = []
    for formula in store:
        if formula.lifecycle not in lifecycle_set:
            continue
        if categories and _normalize(formula.category) not in categories:
            continue
        if screenings and _normalize(formula.screeningStatus) not in screenings:
            continue
        if reviews and _normalize(formula.reviewStatus) not in reviews:
            continue
        if owners and _normalize(formula.ownerId) not in owners:
            continue
        if not _matches_search(formula, needle):
            continue
        filtered.append(formula)

    reverse = sortDirection == "desc"
    if sortKey == "updatedAt":
        filtered.sort(key=lambda item: item.updatedAt, reverse=reverse)
    else:
        filtered.sort(key=lambda item: _sort_key(item, sortKey), reverse=reverse)

    total = len(filtered)
    page_count = max(1, math.ceil(total / pageSize)) if total else 1
    safe_page = min(page, page_count)
    start = (safe_page - 1) * pageSize
    # Reuse dashboard evidence counting. Imported here so formula storage and dashboard aggregation do not cycle at import.
    from app.dashboard_service import load_assessment_store, missing_evidence_count, resolve_latest_run

    runs, latest = load_assessment_store()
    page_items = filtered[start : start + pageSize]
    items = [
        item.model_copy(
            update={
                "missingEvidenceCount": missing_evidence_count(
                    item.model_dump(),
                    resolve_latest_run(item.id, runs, latest),
                )
            }
        )
        for item in page_items
    ]
    return PaginatedFormulas(
        items=items,
        total=total,
        page=safe_page,
        pageSize=pageSize,
        pageCount=page_count,
    )


@router.post("/api/formulas", response_model=Formula, status_code=201)
async def create_formula(body: FormulaCreate) -> Formula:
    store = await load_formulas()
    created = _build_from_create(body, store)
    store.append(created)
    await save_formulas(store)
    return created


@router.get("/api/formulas/{formula_id}", response_model=Formula)
async def get_formula(formula_id: str) -> Formula:
    store = await load_formulas()
    for formula in store:
        if formula.id == formula_id:
            return formula
    raise HTTPException(status_code=404, detail=f"Formula {formula_id} was not found.")


@router.put("/api/formulas/{formula_id}", response_model=Formula)
async def update_formula(formula_id: str, body: FormulaUpdate) -> Formula:
    store = await load_formulas()
    for index, formula in enumerate(store):
        if formula.id != formula_id:
            continue
        updated = _apply_update(formula, body)
        store[index] = updated
        await save_formulas(store)
        return updated
    raise HTTPException(status_code=404, detail=f"Formula {formula_id} was not found.")


@router.post("/api/formulas/{formula_id}/duplicate", response_model=Formula, status_code=201)
async def duplicate_formula(formula_id: str) -> Formula:
    store = await load_formulas()
    base = next((item for item in store if item.id == formula_id), None)
    if base is None:
        raise HTTPException(status_code=404, detail=f"Formula {formula_id} was not found.")
    now = _utc_now_iso()
    new_id = _next_formula_id(store)
    duplicate = base.model_copy(
        update={
            "id": new_id,
            "name": f"{base.name} (copy)",
            "version": "v1.0",
            "lifecycle": "draft",
            "screeningStatus": "not-screened",
            "screeningCurrent": False,
            "latestRunId": None,
            "lastScreenedAt": None,
            "reviewStatus": "not-started",
            "createdAt": now,
            "updatedAt": now,
            "evidenceIds": list(base.evidenceIds),
            "ingredients": [
                ingredient.model_copy(
                    update={
                        "id": f"{new_id}-ING-{index + 1:02d}",
                        "addedInVersion": None,
                    }
                )
                for index, ingredient in enumerate(base.ingredients)
            ],
        }
    )
    store.append(duplicate)
    await save_formulas(store)
    return duplicate


@router.post("/api/formulas/{formula_id}/archive", response_model=Formula)
async def archive_formula(formula_id: str) -> Formula:
    store = await load_formulas()
    for index, formula in enumerate(store):
        if formula.id != formula_id:
            continue
        archived = formula.model_copy(update={"lifecycle": "archived", "updatedAt": _utc_now_iso()})
        store[index] = archived
        await save_formulas(store)
        return archived
    raise HTTPException(status_code=404, detail=f"Formula {formula_id} was not found.")
