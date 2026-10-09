"""HTTP routes for the formula assessment package."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.config import DATA, azure_settings
from app.engine import (
    _assessment_mode,
    _metrics,
    assessment_support,
    build_context,
    clamp_priorities,
    compare_formulas,
    constrain_analysis_confidence,
    data_hash,
    input_hash,
    load_scenario_store,
    load_store,
    screen_status,
    screening_status_label,
)
from app.llm import AzureExplanationError, empty_explanation, explain, public_config

logger = logging.getLogger("affine.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

app = FastAPI(title="Affine Formula Screening", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

STORE = load_store()


class LegacyMaterial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    legacy_id: str | None = Field(default=None, max_length=120)
    concentration_percent: float | None = None


class Ingredient(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1, max_length=120)
    concentration_percent: float | None = None
    batch_id: str | None = Field(default=None, max_length=100)
    supplier: str | None = Field(default=None, max_length=200)
    grade: str | None = Field(default=None, max_length=200)
    measured_value: float | None = None
    measured_unit: str | None = Field(default=None, max_length=40)
    measured_bound: str | None = Field(default=None, max_length=40)
    measurement_kind: str | None = Field(default=None, max_length=40)
    test_method: str | None = Field(default=None, max_length=200)
    analyte: str | None = Field(default=None, max_length=200)
    below_detection: bool = False


class Formula(BaseModel):
    model_config = ConfigDict(extra="forbid")
    formula_id: str = Field(min_length=1, max_length=100)
    version_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    product_category: str = Field(min_length=1, max_length=100)
    age_group: str
    regions: list[str] = Field(min_length=1, max_length=4)
    physical_form: str = Field(min_length=1, max_length=100)
    intended_use: str = Field(min_length=1, max_length=1000)
    ingredients: list[Ingredient] = Field(default_factory=list, max_length=100)
    legacy_materials: list[LegacyMaterial] = Field(default_factory=list, max_length=100)
    generate_explanation: bool = False
    assessment_mode: str = "evidence"
    composition_completeness: str = "partial"
    us_states: list[str] = Field(default_factory=list, max_length=8)
    intended_age_detail: str | None = Field(default=None, max_length=80)
    toy_childcare_scope: str | None = Field(default=None, max_length=40)
    component_type: str | None = Field(default=None, max_length=80)
    test_material_category: str | None = Field(default=None, max_length=80)
    document_ids: list[str] = Field(default_factory=list, max_length=40)


class Comparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previous: Formula
    current: Formula
    generate_explanation: bool = False
    comparison_kind: str = "reassess"


def _reject(errors: list[dict]) -> None:
    raise HTTPException(status_code=422, detail=errors)


def _public_context(context: dict) -> dict:
    hidden = {"file_path", "sha256"}
    documents = [{key: value for key, value in document.items() if key not in hidden} for document in context.get("documents") or []]
    return {
        "formula": context.get("formula"),
        "materials": context.get("materials"),
        "calculated_checks": context.get("calculated_checks"),
        "applicable_verified_rules": context.get("applicable_verified_rules"),
        "reference_claims_pending_verification": context.get("reference_claims_pending_verification"),
        "evidence_requirements": context.get("evidence_requirements"),
        "evidence_matches": context.get("evidence_matches"),
        "missing_evidence": context.get("missing_evidence"),
        "source_conflicts": context.get("source_conflicts"),
        "source_excerpts": context.get("source_excerpts"),
        "version_changes": context.get("version_changes"),
        "documented_history": context.get("documented_history"),
        "assessment_limitations": context.get("assessment_limitations"),
        "checks": context.get("calculated_checks"),
        "evidence_checks": context.get("evidence_checks"),
        "documents": documents,
        "extracted_facts": context.get("extracted_facts"),
        "source_issues": context.get("source_issues"),
        "applicable_rules": context.get("applicable_verified_rules"),
        "applicable_scenario_rules": context.get("applicable_scenario_rules"),
        "regulatory_reference_status": context.get("regulatory_reference_status"),
        "regulatory_rows_disabled": context.get("regulatory_rows_disabled"),
        "historical_cases": context.get("documented_history"),
        "composition_total_percent": context.get("composition_total_percent"),
        "assessment_mode": context.get("assessment_mode"),
        "dataset_kind": context.get("dataset_kind"),
        "dataset_version": context.get("dataset_version"),
        "scenario_provenance": context.get("scenario_provenance"),
        "applicable_scenario_rules": context.get("applicable_scenario_rules"),
    }


def _execution_base(assessment_id: str, formula: dict, context: dict, generated_at: str) -> dict:
    azure = azure_settings()
    return {
        "assessment_id": assessment_id,
        "execution_mode": "live",
        "llm_provider": "azure_openai",
        "llm_status": "not_requested",
        "deployment": azure["deployment"] or None,
        "response_id": None,
        "request_id": None,
        "generated_at": generated_at,
        "latency_ms": None,
        "usage": None,
        "retrieved_source_count": len(context.get("source_excerpts") or []),
        "input_hash": input_hash(formula),
        "data_hash": context.get("data_hash") or data_hash(STORE),
        "error_code": None,
        "error_message": None,
    }


def _assessment(formula: Formula, version_changes: list | None = None) -> dict:
    assessment_id = str(uuid4())
    generated_at = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()
    payload = formula.model_dump()
    logger.info("assessment_start correlation_id=%s stage=validate", assessment_id)
    try:
        context = build_context(payload, STORE, version_changes=version_changes)
    except ValueError as error:
        _reject(error.args[0])
    logger.info(
        "assessment_stage correlation_id=%s stage=context elapsed_ms=%s retrieved=%s",
        assessment_id,
        int((time.perf_counter() - started) * 1000),
        len(context.get("source_excerpts") or []),
    )
    mode = _assessment_mode(payload)
    metrics = _metrics(context["calculated_checks"], context["evidence_checks"], mode)
    support = assessment_support(context, metrics)
    metrics["assessment_support"] = support
    context["metrics"] = metrics
    context["assessment_support"] = support
    overall, regions = screen_status(context)
    execution = _execution_base(assessment_id, payload, context, generated_at)
    explanation = {
        "status": "not_requested",
        "source": "none",
        "content": empty_explanation(context.get("assessment_limitations")),
    }
    if formula.generate_explanation:
        logger.info("assessment_stage correlation_id=%s stage=azure_request", assessment_id)
        try:
            generated = explain(context)
            content = generated["content"]
            content["analysis_confidence"] = constrain_analysis_confidence(
                content.get("analysis_confidence"), context, metrics
            )
            content["recommendations"] = clamp_priorities(content.get("recommendations") or [], context)
            content["alerts"] = clamp_priorities(content.get("alerts") or [], context, key="severity")
            content["prioritized_actions"] = clamp_priorities(content.get("prioritized_actions") or content.get("recommendations") or [], context)
            explanation = {"status": "generated", "source": "azure", "content": content}
            execution.update(generated["execution"])
            execution["generated_at"] = generated_at
            execution["retrieved_source_count"] = len(context.get("source_excerpts") or [])
            execution["input_hash"] = input_hash(payload)
            execution["data_hash"] = context.get("data_hash") or data_hash(STORE)
        except AzureExplanationError as error:
            logger.info("assessment_stage correlation_id=%s stage=azure_failed code=%s", assessment_id, error.code)
            explanation = {
                "status": "failed",
                "source": "none",
                "content": empty_explanation([
                    *(context.get("assessment_limitations") or []),
                    f"AI analysis failed: {error.execution.get('error_message')}",
                ]),
            }
            execution.update(error.execution)
        except Exception as error:
            logger.info("assessment_stage correlation_id=%s stage=azure_failed code=request_failed", assessment_id)
            explanation = {
                "status": "failed",
                "source": "none",
                "content": empty_explanation([
                    *(context.get("assessment_limitations") or []),
                    "AI analysis failed: Azure OpenAI did not complete the assessment request.",
                ]),
            }
            execution.update({
                "llm_status": "failed",
                "error_code": "request_failed",
                "error_message": "Azure OpenAI did not complete the assessment request.",
                "latency_ms": int((time.perf_counter() - started) * 1000),
            })
            del error
    confidence = None if explanation["status"] != "generated" else explanation["content"].get("analysis_confidence")
    logger.info(
        "assessment_done correlation_id=%s stage=complete llm_status=%s elapsed_ms=%s",
        assessment_id,
        execution["llm_status"],
        int((time.perf_counter() - started) * 1000),
    )
    return {
        "assessment_id": assessment_id,
        "created_at": generated_at,
        "data_version": context.get("dataset_version") or STORE["version"],
        "dataset_kind": context.get("dataset_kind"),
        "screening_status_label": screening_status_label(overall, mode),
        "data_hash": execution["data_hash"],
        "input_hash": execution["input_hash"],
        "input_snapshot": payload,
        "screening_status": overall,
        "regulatory_status": "not_assessed",
        "ap_cl_decision": None,
        "acceptance_probability": None,
        "ap_acceptance_probability": None,
        "model_confidence": None,
        "analysis_confidence": confidence,
        "assessment_support": support,
        "assessment_mode": mode,
        "metrics": {key: value for key, value in metrics.items() if key not in {"acceptance_probability", "model_confidence", "ap_acceptance_probability"}},
        "regions": regions,
        "llm_context": _public_context(context),
        "explanation": explanation,
        "execution": execution,
    }


@app.get("/api/health")
def health():
    azure = public_config()
    return {
        "status": "ok",
        "data_version": STORE["version"],
        "data_dir": STORE.get("data_dir"),
        "azure_configured": azure["azure_configured"],
        "missing_azure": azure["missing"],
    }


@app.get("/api/catalog")
def catalog():
    from app.threshold_catalog import catalog_public, load_catalog

    reference = catalog_public()
    substances = load_catalog()["substances"]
    return {
        "data_version": reference["dataset_version"],
        "dataset_kind": reference["dataset_kind"],
        "materials": [
            {
                "material_id": item["substance_id"],
                "name": item["name"],
                "kind": item["role"],
                "cas": item.get("cas_number"),
            }
            for item in substances.values()
        ],
        "product_categories": [item["category_name"] for item in reference["categories"]],
        "regions": reference["regions"],
        "age_groups": [item["id"] for item in reference["age_groups"]],
        "catalog_coverage_incomplete": True,
        "coverage_note": reference["coverage_note"],
        "source_files": reference["source_files"],
    }


@app.get("/api/reference")
def reference():
    from app.threshold_catalog import catalog_public

    return catalog_public()


@app.get("/api/reference/material-types")
def reference_material_types(regions: str, category: str, age_group: str):
    from app.threshold_catalog import material_types, normalize_age, normalize_category, normalize_region

    region_list = [normalize_region(item) for item in regions.split(",") if item.strip()]
    category_name = normalize_category(category)
    age = normalize_age(age_group)
    if not category_name or age not in {"under_12", "12_and_above"} or any(item not in {"US", "EU"} for item in region_list):
        raise HTTPException(status_code=422, detail="Select US or EU, a reference category, and an age group.")
    return {"composition_types": material_types(region_list, category_name, age)}


@app.get("/api/reference/substances")
def reference_substances(regions: str, category: str, age_group: str, composition_type: str | None = None):
    from app.threshold_catalog import normalize_age, normalize_category, normalize_region, substances_for

    region_list = [normalize_region(item) for item in regions.split(",") if item.strip()]
    category_name = normalize_category(category)
    age = normalize_age(age_group)
    if not category_name or age not in {"under_12", "12_and_above"} or any(item not in {"US", "EU"} for item in region_list):
        raise HTTPException(status_code=422, detail="Select US or EU, a reference category, and an age group.")
    rows = substances_for(region_list, category_name, age, composition_type or None)
    return {
        "substances": rows,
        "catalog_coverage_incomplete": True,
        "coverage_note": "Catalog coverage incomplete. These entries are not an approved recipe.",
    }


class FieldCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field_id: str
    value: str
    bound: str | None = None


class ReviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    corrections: list[FieldCorrection] = Field(default_factory=list, max_length=80)


@app.post("/api/documents")
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form(...),
    scope: str = Form(...),
    material_id: str | None = Form(default=None),
    supplier: str | None = Form(default=None),
    grade: str | None = Form(default=None),
    batch_id: str | None = Form(default=None),
    formula_id: str | None = Form(default=None),
    version_id: str | None = Form(default=None),
    regions: str | None = Form(default=None),
    test_scope: str | None = Form(default=None),
):
    from app.uploads import UploadError, save_upload

    content = await file.read()
    region_list = [item.strip() for item in (regions or "").split(",") if item.strip()]
    try:
        record = save_upload(content, file.filename or "upload.pdf", {
            "document_type": document_type,
            "scope": scope,
            "material_id": material_id,
            "supplier": supplier,
            "grade": grade,
            "batch_id": batch_id,
            "formula_id": formula_id,
            "version_id": version_id,
            "regions": region_list,
            "test_scope": test_scope,
        })
    except UploadError as error:
        raise HTTPException(status_code=422, detail=error.message) from error
    return record


@app.get("/api/documents/{document_id}/status")
def document_status(document_id: str):
    from app.uploads import get_upload

    match = get_upload(document_id)
    if not match:
        raise HTTPException(status_code=404, detail="That document is not on file.")
    return {
        "document_id": match["document_id"],
        "extraction_status": match.get("extraction_status"),
        "ocr_required": match.get("ocr_required"),
        "ocr_message": match.get("ocr_message"),
        "review_status": match.get("review_status"),
        "authenticity_status": match.get("authenticity_status"),
        "applicability_status": match.get("applicability_status"),
    }


@app.post("/api/documents/{document_id}/review")
def document_review(document_id: str, body: ReviewBody):
    from app.uploads import UploadError, review_upload

    try:
        return review_upload(document_id, [item.model_dump() for item in body.corrections])
    except UploadError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@app.get("/api/examples")
def examples():
    scenario = load_scenario_store()
    return {
        "examples": scenario["examples"],
        "dataset_version": scenario["version"],
        "dataset_kind": "scenario",
        "note": "Illustrative scenario compositions. Not Crayola recipes or approved materials.",
    }


@app.post("/api/context")
def context(formula: Formula):
    try:
        built = build_context(formula.model_dump(), STORE)
    except ValueError as error:
        _reject(error.args[0])
    return _public_context(built)


@app.post("/api/assessments")
def assessments(formula: Formula):
    return _assessment(formula)


@app.post("/api/compare")
def compare(body: Comparison):
    try:
        diff = compare_formulas(body.previous.model_dump(), body.current.model_dump(), STORE)
    except ValueError as error:
        _reject(error.args[0])
    previous = _assessment(body.previous.model_copy(update={"generate_explanation": False}))
    current = _assessment(body.current.model_copy(update={"generate_explanation": False}))
    explanation = {
        "status": "not_requested",
        "source": "none",
        "content": empty_explanation(["Comparison describes calculated differences only. It does not predict acceptance."]),
    }
    execution = _execution_base(str(uuid4()), body.current.model_dump(), diff["current_context"], datetime.now(timezone.utc).isoformat())
    if body.generate_explanation:
        context = diff["current_context"]
        context["version_changes"] = diff.get("version_changes") or []
        context["metrics"] = current["metrics"]
        try:
            generated = explain(context)
            content = generated["content"]
            content["analysis_confidence"] = constrain_analysis_confidence(
                content.get("analysis_confidence"), context, current["metrics"]
            )
            content["recommendations"] = clamp_priorities(content.get("recommendations") or [], context)
            content["alerts"] = clamp_priorities(content.get("alerts") or [], context, key="severity")
            explanation = {"status": "generated", "source": "azure", "content": content}
            execution.update(generated["execution"])
        except AzureExplanationError as error:
            explanation = {
                "status": "failed",
                "source": "none",
                "content": empty_explanation([f"AI analysis failed: {error.execution.get('error_message')}"]),
            }
            execution.update(error.execution)
        except Exception:
            explanation = {
                "status": "failed",
                "source": "none",
                "content": empty_explanation(["AI analysis failed: Azure OpenAI did not complete the comparison request."]),
            }
            execution.update({"llm_status": "failed", "error_code": "request_failed"})
    return {
        "previous": previous,
        "current": current,
        "changes": {key: value for key, value in diff.items() if not key.endswith("_context")},
        "comparison_kind": body.comparison_kind,
        "explanation": explanation,
        "execution": execution,
    }


@app.get("/api/documents/{document_id}")
def document(document_id: str):
    from app.uploads import file_for, get_upload

    upload = get_upload(document_id)
    if upload:
        path = file_for(document_id)
        if path is None:
            hidden = {"url"}
            return JSONResponse({key: value for key, value in upload.items() if key not in hidden})
        return FileResponse(path, filename=upload.get("original_filename") or path.name, media_type="application/pdf")
    scenario_match = next((item for item in load_scenario_store()["documents"] if item["document_id"] == document_id), None)
    if scenario_match:
        hidden = {"file_path", "sha256"}
        return JSONResponse({key: value for key, value in scenario_match.items() if key not in hidden})
    match = next((item for item in STORE["documents"] if item["document_id"] == document_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="That document is not in the reference set.")
    folder = (DATA / "source_documents").resolve()
    path = (folder / Path(match["filename"]).name).resolve()
    if folder not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="The registered file is not available.")
    return FileResponse(path, filename=path.name)
