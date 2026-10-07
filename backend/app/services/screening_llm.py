from __future__ import annotations

import json
import logging
from typing import Any

from openai import AzureOpenAI

from app.config import settings
from app.evidence import summarize_evidence

logger = logging.getLogger(__name__)

SCREENING_SYSTEM = """You are an internal product-safety screening assistant for Crayola formula records.
You produce structured JSON only. You do NOT certify AP/ACMI acceptance and you do NOT claim regulatory compliance.
Use severity high/medium/low/info. Status must be:
- red: at least one high-severity finding
- amber: no high, but medium findings, missing required evidence, or incomplete assessment inputs
- green: no high or medium concerns and required evidence is complete (informational findings allowed)

Findings must include ruleId (use DR-01 through DR-09 style or LLM-XX for advisory items), concern, explanation,
evidenceReference, recommendedAction, scope (ingredient|formula), reference, reviewState open.
exposureInputs: list objects with key, label, unit, available (bool), value (string optional), source (string).
comparisons: historical overlap records if relevant (can be empty array for new formulas).
nextActions: list with id, kind (request-supplier-documentation|add-laboratory-evidence|expert-review|review-alternative|complete-formula-record), label, detail, optional relatedReference.
"""


def _client() -> AzureOpenAI:
    if not settings.azure_openai_api_key or not settings.azure_openai_endpoint:
        raise RuntimeError("Azure OpenAI is not configured. Set AZURE_OPENAI_* in backend/.env.")
    return AzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.azure_openai_endpoint.rstrip("/"),
        api_version=settings.azure_openai_api_version,
    )


def _build_user_payload(
    formula: dict[str, Any],
    raw_materials: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    submissions: list[dict[str, Any]],
) -> dict[str, Any]:
    material_by_id = {m["id"]: m for m in raw_materials}
    enriched_ingredients = []
    for ing in formula.get("ingredients", []):
        rm = material_by_id.get(ing.get("rawMaterialId") or "")
        enriched_ingredients.append(
            {
                **ing,
                "material": (
                    {
                        "id": rm.get("id"),
                        "name": rm.get("name"),
                        "role": rm.get("role"),
                        "requiresExpertAssessment": rm.get("requiresExpertAssessment"),
                        "demoConcentrationCeiling": rm.get("demoConcentrationCeiling"),
                        "requiresLabReport": rm.get("requiresLabReport"),
                        "supplier": rm.get("supplier"),
                    }
                    if rm
                    else None
                ),
            }
        )

    evidence = summarize_evidence(formula, raw_materials, documents)
    total = sum(float(i.get("concentration") or 0) for i in formula.get("ingredients", []))

    return {
        "formula": {
            **formula,
            "ingredients": enriched_ingredients,
            "compositionTotalPercent": round(total, 3),
        },
        "evidenceSummary": evidence,
        "submissionCount": len(submissions),
        "instructions": (
            "Return JSON with keys: status (green|amber|red), summary (string), findings (array), "
            "exposureInputs (array), comparisons (array), nextActions (array). "
            "Use evidenceSummary counts for requiredEvidenceCount/presentEvidenceCount in your reasoning; "
            "status must reflect missing evidence and expert-assessment materials."
        ),
    }


def _normalize_finding(raw: dict[str, Any], index: int) -> dict[str, Any]:
    severity = raw.get("severity", "medium")
    if severity not in ("high", "medium", "low", "info"):
        severity = "medium"
    scope = raw.get("scope", "formula")
    if scope not in ("ingredient", "formula"):
        scope = "formula"
    return {
        "id": raw.get("id") or f"LLM-F-{index + 1}",
        "severity": severity,
        "scope": scope,
        "reference": raw.get("reference") or "Formula",
        "ruleId": raw.get("ruleId") or "LLM-01",
        "concern": raw.get("concern") or "Review item flagged by screening",
        "explanation": raw.get("explanation") or "",
        "evidenceReference": raw.get("evidenceReference") or "",
        "recommendedAction": raw.get("recommendedAction") or "",
        "reviewState": raw.get("reviewState") or "open",
    }


def _normalize_status(raw_status: str, findings: list[dict[str, Any]], missing_evidence: int) -> str:
    status = (raw_status or "amber").lower()
    if status not in ("green", "amber", "red"):
        status = "amber"
    high = any(f.get("severity") == "high" for f in findings)
    medium = any(f.get("severity") == "medium" for f in findings)
    if high:
        return "red"
    if medium or missing_evidence > 0:
        return "amber"
    if status == "green" and missing_evidence == 0 and not medium and not high:
        return "green"
    return status if status != "green" or missing_evidence == 0 else "amber"


def run_llm_screening(
    formula: dict[str, Any],
    raw_materials: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    submissions: list[dict[str, Any]],
) -> dict[str, Any]:
    evidence = summarize_evidence(formula, raw_materials, documents)
    payload = _build_user_payload(formula, raw_materials, documents, submissions)

    client = _client()
    response = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": SCREENING_SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Azure OpenAI returned an empty screening response.")

    parsed = json.loads(content)
    findings = [_normalize_finding(f, i) for i, f in enumerate(parsed.get("findings") or [])]
    status = _normalize_status(parsed.get("status", "amber"), findings, evidence["missingCount"])

    return {
        "status": status,
        "summary": parsed.get("summary")
        or f"Screening completed with status {status.upper()}.",
        "findings": findings,
        "exposureInputs": parsed.get("exposureInputs") or [],
        "comparisons": parsed.get("comparisons") or [],
        "nextActions": parsed.get("nextActions") or [],
        "evidence": evidence,
    }
