"""HTTP routes for the formula assessment package."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from app.config import DATA, azure_settings
from app.engine import build_context, compare_formulas, data_hash, input_hash, load_store, screen_status, _metrics
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


class Ingredient(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1, max_length=100)
    concentration_percent: float = Field(gt=0, le=100)
    batch_id: str | None = Field(default=None, max_length=100)


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
    ingredients: list[Ingredient] = Field(min_length=1, max_length=100)
    generate_explanation: bool = False


class Comparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previous: Formula
    current: Formula
    generate_explanation: bool = False


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
        "regulatory_reference_status": context.get("regulatory_reference_status"),
        "regulatory_rows_disabled": context.get("regulatory_rows_disabled"),
        "historical_cases": context.get("documented_history"),
        "composition_total_percent": context.get("composition_total_percent"),
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
        "data_hash": data_hash(STORE),
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
    metrics = _metrics(context["calculated_checks"], context["evidence_checks"])
    context["metrics"] = metrics
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
            explanation = {"status": "generated", "source": "azure", "content": generated["content"]}
            execution.update(generated["execution"])
            execution["generated_at"] = generated_at
            execution["retrieved_source_count"] = len(context.get("source_excerpts") or [])
            execution["input_hash"] = input_hash(payload)
            execution["data_hash"] = data_hash(STORE)
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
        "data_version": STORE["version"],
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
    return {
        "data_version": STORE["version"],
        "materials": [
            {
                "material_id": item["material_id"],
                "name": item["name"],
                "kind": item["kind"],
                "cas": item.get("cas"),
            }
            for item in STORE["materials"]
        ],
        "product_categories": ["paint", "chalk", "glue_stick", "washable_marker", "modeling_compound"],
        "regions": ["US", "EU", "UK", "CA"],
        "age_groups": ["under_12", "12_and_above"],
    }


@app.get("/api/examples")
def examples():
    return {"examples": STORE["examples"], "note": "Illustrative compositions. Not Crayola recipes."}


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
            explanation = {"status": "generated", "source": "azure", "content": generated["content"]}
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
        "explanation": explanation,
        "execution": execution,
    }


@app.get("/api/documents/{document_id}")
def document(document_id: str):
    match = next((item for item in STORE["documents"] if item["document_id"] == document_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="That document is not in the reference set.")
    folder = (DATA / "source_documents").resolve()
    path = (folder / Path(match["filename"]).name).resolve()
    if folder not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="The registered file is not available.")
    return FileResponse(path, filename=path.name)
