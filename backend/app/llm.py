"""Azure explanation. Credentials stay in the server environment."""

from __future__ import annotations

import json
import logging
import time

from app.config import ROOT, azure_settings

logger = logging.getLogger("affine.llm")
PROMPT = (ROOT / "prompts" / "explanation.txt").read_text(encoding="utf-8")
CONFIDENCE_LEVELS = {"low", "medium", "high"}
GAP_STATUSES = {"missing", "unverified", "mismatched", "conflicting"}
SEVERITIES = {"high", "medium", "low"}
PRIORITIES = {"high", "medium", "low"}


def azure_config() -> dict:
    return azure_settings()


def public_config() -> dict:
    config = azure_config()
    return {"azure_configured": config["ok"], "missing": [] if config["ok"] else config["missing"]}


def sanitize(error: Exception) -> str:
    text = str(error)
    key = azure_config()["key"]
    if key:
        text = text.replace(key, "[redacted]")
    return text[:180]


def classify_error(error: Exception) -> str:
    text = str(error).lower()
    status = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    if status is None and response is not None:
        status = getattr(response, "status_code", None)
    if "not configured" in text:
        return "missing_configuration"
    if status in {401, 403} or "unauthorized" in text or "authentication" in text or "api key" in text:
        return "authentication"
    if status == 429 or "rate limit" in text or "too many requests" in text:
        return "rate_limit"
    if "timeout" in text or status in {408, 504}:
        return "timeout"
    if "deployment" in text or status == 404:
        return "deployment"
    if "did not match" in text or "json" in text or "truncated" in text or "empty" in text:
        return "invalid_output"
    return "request_failed"


def safe_error_message(code: str) -> str:
    return {
        "missing_configuration": "Azure OpenAI is not configured on the server. Set the Azure endpoint, deployment, API version, and key.",
        "authentication": "Azure OpenAI rejected the credentials or the request was unauthorized.",
        "rate_limit": "Azure OpenAI rate-limited the request. Retry later.",
        "timeout": "The Azure OpenAI request timed out. Retry the assessment.",
        "deployment": "The configured Azure OpenAI deployment was not found or does not support this request.",
        "invalid_output": "Azure OpenAI returned output that could not be validated against the assessment schema.",
        "request_failed": "Azure OpenAI did not complete the assessment request.",
    }.get(code, "Azure OpenAI did not complete the assessment request.")


def allowed_ids(context: dict) -> set[str]:
    ids: set[str] = set()
    for check in context.get("calculated_checks") or context.get("checks") or []:
        ids.add(check.get("check_id"))
        if check.get("rule_id"):
            ids.add(check["rule_id"])
        comparison = check.get("illustrative_comparison") or {}
        if comparison.get("rule_id"):
            ids.add(comparison["rule_id"])
        ids.update(check.get("document_ids") or [])
    for check in context.get("evidence_checks") or []:
        ids.add(check.get("check_id"))
        if check.get("requirement_id"):
            ids.add(check["requirement_id"])
        ids.update(check.get("document_ids") or [])
    for item in context.get("evidence_requirements") or []:
        ids.add(item.get("requirement_id"))
    for item in context.get("missing_evidence") or []:
        ids.add(item.get("check_id"))
        ids.add(item.get("requirement_id"))
        ids.update(item.get("document_ids") or [])
    for item in context.get("evidence_matches") or []:
        ids.add(item.get("check_id"))
        ids.add(item.get("requirement_id"))
        ids.update(item.get("document_ids") or [])
    for document in context.get("documents") or []:
        ids.add(document.get("document_id"))
    for fact in context.get("extracted_facts") or []:
        ids.add(fact.get("fact_id"))
        ids.add(fact.get("document_id"))
    for issue in context.get("source_conflicts") or context.get("source_issues") or []:
        ids.add(issue.get("issue_id"))
        ids.update(issue.get("document_ids") or [])
    for excerpt in context.get("source_excerpts") or []:
        ids.add(excerpt.get("source_id"))
        ids.add(excerpt.get("document_id"))
    for claim in context.get("reference_claims_pending_verification") or []:
        ids.add(claim.get("claim_id"))
        ids.add(claim.get("document_id"))
    for rule in context.get("applicable_verified_rules") or []:
        ids.add(rule.get("rule_id"))
    return {item for item in ids if item}


def _string_list(value) -> list[str] | None:
    if value is None:
        return []
    if not isinstance(value, list):
        return None
    items = []
    for item in value:
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def validate_explanation(payload: dict, context: dict) -> dict | None:
    if not isinstance(payload, dict) or not str(payload.get("summary") or "").strip():
        return None
    known = allowed_ids(context)
    check_ids = {
        item.get("check_id")
        for item in (context.get("calculated_checks") or context.get("checks") or []) + (context.get("evidence_checks") or [])
        if item.get("check_id")
    }
    requirement_ids = {
        item.get("requirement_id")
        for item in (context.get("evidence_requirements") or []) + (context.get("missing_evidence") or []) + (context.get("evidence_checks") or [])
        if item.get("requirement_id")
    }
    explanations = []
    for item in payload.get("finding_explanations") or []:
        if not isinstance(item, dict) or item.get("check_id") not in check_ids:
            return None
        sources = _string_list(item.get("source_ids"))
        limitations = _string_list(item.get("limitations"))
        if sources is None or limitations is None or any(source not in known for source in sources):
            return None
        explanations.append({
            "check_id": item["check_id"],
            "explanation": str(item.get("explanation") or "").strip(),
            "source_ids": sources,
            "limitations": limitations,
        })
    evidence_gaps = []
    for item in payload.get("evidence_gaps") or []:
        if not isinstance(item, dict):
            return None
        requirement_id = item.get("requirement_id")
        status = str(item.get("status") or "").strip()
        if requirement_id not in requirement_ids or status not in GAP_STATUSES:
            return None
        sources = _string_list(item.get("source_ids"))
        if sources is None or any(source not in known for source in sources):
            return None
        evidence_gaps.append({
            "requirement_id": requirement_id,
            "status": status,
            "explanation": str(item.get("explanation") or "").strip(),
            "required_action": str(item.get("required_action") or "").strip(),
            "source_ids": sources,
        })
    recommendations = []
    for item in payload.get("recommendations") or []:
        if not isinstance(item, dict) or not str(item.get("action") or "").strip():
            return None
        priority = str(item.get("priority") or "medium").strip().lower()
        if priority not in PRIORITIES:
            return None
        sources = _string_list(item.get("source_ids"))
        checks = _string_list(item.get("related_check_ids"))
        if sources is None or checks is None:
            return None
        if any(source not in known for source in sources) or any(check not in check_ids for check in checks):
            return None
        recommendations.append({
            "priority": priority,
            "action": str(item["action"]).strip(),
            "rationale": str(item.get("rationale") or "").strip(),
            "related_check_ids": checks,
            "source_ids": sources,
            "requires_testing_or_review": bool(item.get("requires_testing_or_review", True)),
        })
    alerts = []
    for item in payload.get("alerts") or []:
        if not isinstance(item, dict) or not str(item.get("message") or "").strip():
            return None
        severity = str(item.get("severity") or "medium").strip().lower()
        if severity not in SEVERITIES:
            return None
        sources = _string_list(item.get("source_ids"))
        if sources is None or any(source not in known for source in sources):
            return None
        alerts.append({
            "severity": severity,
            "title": str(item.get("title") or "Alert").strip(),
            "message": str(item["message"]).strip(),
            "source_ids": sources,
        })
    confidence = payload.get("analysis_confidence")
    if not isinstance(confidence, dict):
        return None
    level = str(confidence.get("level") or "").strip().lower()
    if level not in CONFIDENCE_LEVELS or not str(confidence.get("basis") or "").strip():
        return None
    limiting = _string_list(confidence.get("limiting_factors"))
    conf_sources = _string_list(confidence.get("source_ids"))
    if limiting is None or conf_sources is None or any(source not in known for source in conf_sources):
        return None
    version_change = payload.get("version_comparison_summary")
    if version_change in (None, ""):
        version_value = None
    elif isinstance(version_change, str):
        version_value = version_change.strip()
    else:
        return None
    limitations = _string_list(payload.get("limitations"))
    if limitations is None:
        return None
    return {
        "summary": str(payload["summary"]).strip(),
        "finding_explanations": explanations,
        "evidence_gaps": evidence_gaps,
        "recommendations": recommendations,
        "alerts": alerts,
        "analysis_confidence": {
            "level": level,
            "basis": str(confidence["basis"]).strip(),
            "limiting_factors": limiting,
            "source_ids": conf_sources,
        },
        "version_comparison_summary": version_value,
        "limitations": limitations,
        "version_change": version_value,
    }


def _public_context(context: dict) -> dict:
    hidden = {"file_path", "sha256"}
    documents = [{key: value for key, value in document.items() if key not in hidden} for document in context.get("documents") or []]
    return {
        "formula": context.get("formula"),
        "materials": [
            {key: item.get(key) for key in ("material_id", "name", "kind", "cas", "notes", "verified_crayola_ingredient")}
            for item in context.get("materials") or []
        ],
        "calculated_checks": context.get("calculated_checks") or context.get("checks") or [],
        "applicable_verified_rules": context.get("applicable_verified_rules") or [],
        "reference_claims_pending_verification": context.get("reference_claims_pending_verification") or [],
        "evidence_requirements": context.get("evidence_requirements") or [],
        "evidence_matches": context.get("evidence_matches") or [],
        "missing_evidence": context.get("missing_evidence") or [],
        "source_conflicts": context.get("source_conflicts") or context.get("source_issues") or [],
        "source_excerpts": context.get("source_excerpts") or [],
        "version_changes": context.get("version_changes") or [],
        "documented_history": context.get("documented_history") or context.get("historical_cases") or [],
        "assessment_limitations": context.get("assessment_limitations") or [],
        "metrics": context.get("metrics"),
        "regulatory_reference_status": context.get("regulatory_reference_status"),
    }


def _usage_dict(response) -> dict | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    if hasattr(usage, "model_dump"):
        payload = usage.model_dump()
        return payload if isinstance(payload, dict) else None
    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def _response_ids(response) -> tuple[str | None, str | None]:
    response_id = getattr(response, "id", None)
    request_id = getattr(response, "_request_id", None)
    if request_id is None:
        extra = getattr(response, "model_extra", None) or {}
        if isinstance(extra, dict):
            request_id = extra.get("request_id")
    return (str(response_id) if response_id else None, str(request_id) if request_id else None)


def empty_explanation(limitations: list[str] | None = None) -> dict:
    return {
        "summary": "",
        "finding_explanations": [],
        "evidence_gaps": [],
        "recommendations": [],
        "alerts": [],
        "analysis_confidence": None,
        "version_comparison_summary": None,
        "limitations": limitations or [],
        "version_change": None,
    }


def explain(context: dict) -> dict:
    config = azure_config()
    if not config["ok"]:
        raise RuntimeError("Azure OpenAI is not configured.")
    from openai import AzureOpenAI

    started = time.perf_counter()
    client = AzureOpenAI(
        api_key=config["key"],
        azure_endpoint=config["endpoint"],
        api_version=config["api_version"],
        timeout=90,
        max_retries=0,
    )
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": json.dumps({"assessment_context": _public_context(context)}, ensure_ascii=False)},
    ]
    last_error: Exception | None = None
    last_response = None
    for json_mode in (True, False):
        try:
            request = {
                "model": config["deployment"],
                "messages": messages,
                "max_completion_tokens": 4000,
            }
            if json_mode:
                request["response_format"] = {"type": "json_object"}
            response = client.chat.completions.create(**request)
            last_response = response
            text = ((response.choices[0].message.content if response.choices else None) or "").strip()
            if not text:
                raise RuntimeError("Azure OpenAI returned an empty explanation.")
            cleaned = text.removeprefix("```json").removesuffix("```").strip()
            parsed = json.loads(cleaned)
            validated = validate_explanation(parsed, context)
            if not validated:
                raise RuntimeError("Explanation did not match the expected structure.")
            response_id, request_id = _response_ids(response)
            return {
                "content": validated,
                "execution": {
                    "llm_status": "succeeded",
                    "llm_provider": "azure_openai",
                    "deployment": config["deployment"],
                    "response_id": response_id,
                    "request_id": request_id,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "usage": _usage_dict(response),
                    "error_code": None,
                    "error_message": None,
                },
            }
        except Exception as error:
            last_error = error
            logger.info("azure_explanation_failed code=%s", classify_error(error))
    code = classify_error(last_error or RuntimeError("request_failed"))
    response_id = request_id = None
    usage = None
    if last_response is not None:
        response_id, request_id = _response_ids(last_response)
        usage = _usage_dict(last_response)
    raise AzureExplanationError(
        safe_error_message(code),
        code=code,
        execution={
            "llm_status": "failed",
            "llm_provider": "azure_openai",
            "deployment": config["deployment"],
            "response_id": response_id,
            "request_id": request_id,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "usage": usage,
            "error_code": code,
            "error_message": safe_error_message(code),
        },
    ) from last_error


class AzureExplanationError(RuntimeError):
    def __init__(self, message: str, code: str, execution: dict):
        super().__init__(message)
        self.code = code
        self.execution = execution
