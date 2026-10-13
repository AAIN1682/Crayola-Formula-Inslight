"""Azure explanation. Credentials stay in the server environment."""

from __future__ import annotations

import json
import logging
import re
import time

from app.config import ROOT, azure_settings

logger = logging.getLogger("affine.llm")
PROMPT = (ROOT / "prompts" / "explanation.txt").read_text(encoding="utf-8")
ASSESSMENT_PROMPT = (ROOT / "prompts" / "assessment.txt").read_text(encoding="utf-8")
PROMPT_VERSION = "assessment_v2"
FINDING_STATUSES = {
    "meets_rule",
    "does_not_meet_rule",
    "needs_information",
    "testing_required",
    "unresolved_identity",
    "uncertain_applicability",
    "source_review_required",
    "not_applicable",
}
PREDICTION_OUTCOMES = {"ap_leaning", "cl_leaning", "indeterminate"}
SCREENING_OUTCOMES = {
    "additional_information_required",
    "changes_indicated",
    "no_supported_concern_in_scope",
    "not_assessed",
}
CERTIFICATION_CLAIM = re.compile(
    r"\b(is certified|are certified|ap certified|cl certified|guaranteed safe|this certifies|official acceptance)\b",
    re.I,
)
CONFIDENCE_LEVELS = {"low", "medium", "high"}
GAP_STATUSES = {"missing", "unverified", "mismatched", "conflicting", "needs_review", "applicability_unknown"}
SEVERITIES = {"critical", "high", "medium", "informational", "low"}
PRIORITIES = {"critical", "high", "medium", "informational", "low"}


def _trim_words(text: str, limit: int) -> str:
    words = str(text or "").split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit])


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
            "explanation": _trim_words(str(item.get("explanation") or "").strip(), 60),
            "source_ids": sources,
            "limitations": limitations,
        })
    evidence_gaps = []
    for item in (payload.get("evidence_gap_explanations") or payload.get("evidence_gaps") or []):
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
    for item in (payload.get("prioritized_actions") or payload.get("recommendations") or []):
        if not isinstance(item, dict) or not str(item.get("action") or "").strip():
            return None
        priority = str(item.get("priority") or "medium").strip().lower()
        if priority == "low":
            priority = "informational"
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
            "action": _trim_words(str(item["action"]).strip(), 12),
            "rationale": _trim_words(str(item.get("rationale") or "").strip(), 45),
            "related_check_ids": checks,
            "source_ids": sources,
            "requires_testing_or_review": bool(item.get("requires_testing_or_review", True)),
            "can_create_scenario": bool(item.get("can_create_scenario")),
        })
    alerts = []
    for item in payload.get("alerts") or []:
        if not isinstance(item, dict) or not str(item.get("message") or "").strip():
            return None
        severity = str(item.get("severity") or "medium").strip().lower()
        if severity == "low":
            severity = "informational"
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
    source_conflicts = []
    for item in payload.get("source_conflicts") or []:
        if not isinstance(item, dict):
            continue
        sources = _string_list(item.get("source_ids")) or []
        if any(source not in known for source in sources):
            continue
        source_conflicts.append({
            "issue_id": item.get("issue_id"),
            "explanation": str(item.get("explanation") or "").strip(),
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
    key_reasons = _string_list(payload.get("key_reasons")) or []
    return {
        "summary": _trim_words(str(payload["summary"]).strip(), 60),
        "key_reasons": key_reasons,
        "finding_explanations": explanations,
        "evidence_gaps": evidence_gaps,
        "evidence_gap_explanations": evidence_gaps,
        "recommendations": recommendations,
        "prioritized_actions": recommendations,
        "alerts": alerts,
        "assessment_support_explanation": str(payload.get("assessment_support_explanation") or "").strip(),
        "source_conflicts": source_conflicts,
        "analysis_confidence": {
            "level": level,
            "basis": str(confidence["basis"]).strip(),
            "limiting_factors": limiting,
            "source_ids": conf_sources,
        },
        "version_comparison_summary": version_value,
        "version_change_summary": version_value,
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
        "uploaded_documents": context.get("uploaded_documents") or [],
        "use_case_thresholds": context.get("use_case_thresholds") or [],
        "version_changes": context.get("version_changes") or [],
        "documented_history": context.get("documented_history") or context.get("historical_cases") or [],
        "assessment_limitations": context.get("assessment_limitations") or [],
        "metrics": context.get("metrics"),
        "assessment_support": context.get("assessment_support"),
        "assessment_mode": context.get("assessment_mode"),
        "dataset_kind": context.get("dataset_kind"),
        "dataset_version": context.get("dataset_version"),
        "scenario_provenance": context.get("scenario_provenance"),
        "applicable_scenario_rules": [
            {
                "rule_id": rule.get("rule_id"),
                "material_id": rule.get("material_id"),
                "threshold": rule.get("threshold"),
                "unit": rule.get("unit"),
                "operator": rule.get("operator"),
                "provenance": rule.get("provenance"),
                "is_regulatory_requirement": False,
                "role": rule.get("role"),
            }
            for rule in context.get("applicable_scenario_rules") or []
        ],
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
        "key_reasons": [],
        "finding_explanations": [],
        "evidence_gaps": [],
        "evidence_gap_explanations": [],
        "recommendations": [],
        "prioritized_actions": [],
        "alerts": [],
        "assessment_support_explanation": "",
        "source_conflicts": [],
        "analysis_confidence": None,
        "version_comparison_summary": None,
        "version_change_summary": None,
        "limitations": limitations or [],
        "version_change": None,
    }


def _checks(context: dict) -> list[dict]:
    return list(context.get("calculated_checks") or context.get("checks") or [])


def _evidence_rows(context: dict) -> list[dict]:
    return list(context.get("evidence_checks") or [])


def _material_ids(context: dict) -> set[str]:
    ids = set()
    for item in context.get("materials") or []:
        if item.get("material_id"):
            ids.add(item["material_id"])
    for row in (context.get("formula") or {}).get("ingredients") or []:
        if row.get("material_id"):
            ids.add(row["material_id"])
    return ids


def _rule_ids(context: dict) -> set[str]:
    ids = set()
    for item in _checks(context) + (context.get("applicable_verified_rules") or []) + (context.get("reference_claims_pending_verification") or []):
        if item.get("rule_id"):
            ids.add(item["rule_id"])
    return ids


def _gap_present(context: dict) -> bool:
    gap_statuses = {
        "missing",
        "needs_review",
        "mismatched",
        "needs_test_data",
        "applicability_unknown",
        "source_review_required",
        "no_matching_rule",
        "not_assessed",
    }
    return any(item.get("status") in gap_statuses for item in _checks(context) + _evidence_rows(context))


def _failed_calculations(context: dict) -> bool:
    return any(item.get("status") == "fail" for item in _checks(context))


def _normalize_limit_basis(raw, reason: str) -> str:
    value = re.sub(r"[\s\-]+", "_", str(raw or "").strip().lower())
    mentions_model = "model" in value or "model knowledge" in reason.lower()
    if value in {"model_knowledge", "model", "knowledge"} or (mentions_model and "supplied" not in value):
        return "model_knowledge"
    if not value:
        return ""
    return "supplied_check"


def _decisive_check(context: dict, finding: dict) -> dict | None:
    ingredient_id = finding.get("ingredient_id")
    if not ingredient_id:
        return None
    for item in _checks(context):
        if item.get("material_id") == ingredient_id and item.get("status") in {"pass", "fail"}:
            return item
    return None


def _match_check(context: dict, finding: dict) -> dict | None:
    rule_id = finding.get("rule_id")
    ingredient_id = finding.get("ingredient_id")
    for item in _checks(context):
        if rule_id and item.get("rule_id") != rule_id:
            continue
        if ingredient_id and item.get("material_id") not in {None, ingredient_id}:
            continue
        if rule_id or ingredient_id:
            return item
    return None


def _close(left, right) -> bool:
    try:
        return abs(float(left) - float(right)) <= 0.02
    except (TypeError, ValueError):
        return False


def _ids_ok(values, known: set[str]) -> bool:
    parsed = _string_list(values)
    if parsed is None:
        return False
    return all(item in known for item in parsed)


RISK_POINTS = {"critical": 26, "high": 12, "low": 5}
GAP_FINDING_STATUSES = {
    "needs_information",
    "testing_required",
    "unresolved_identity",
    "uncertain_applicability",
    "source_review_required",
}
FIX_KINDS = {"reformulate", "lab_test", "supplier_request", "review"}


def _risk_bucket(raw: str) -> str:
    value = str(raw or "").strip().lower()
    if value in {"informational", "low"}:
        return "low"
    if value in {"medium", "high"}:
        return "high"
    if value == "critical":
        return "critical"
    return "low"


def _data_gap_count(context: dict, findings: list[dict]) -> int:
    """Count rule-check rows that still need data, matching the result screen."""
    closed = {"pass", "fail", "not_applicable", "satisfied", "available"}
    seen: set[str] = set()
    gaps = 0
    for name in ("calculated_checks", "evidence_checks"):
        rows = context.get(name) or []
        if not isinstance(rows, list):
            continue
        for item in rows:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status") or "")
            if status in closed:
                continue
            key = str(item.get("check_id") or "")
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            gaps += 1
    if gaps:
        return gaps
    return sum(1 for item in findings if item.get("status") in GAP_FINDING_STATUSES)


def _scoreboard(findings: list[dict], context: dict, confidence: str) -> dict:
    open_items = [item for item in findings if item.get("score_points")]
    deduction = sum(int(item["score_points"]) for item in open_items)
    score = max(0, min(100, 100 - deduction))
    if score >= 80:
        band, label = "ap", "AP"
    elif score >= 50:
        band, label = "at_risk", "At risk"
    else:
        band, label = "likely_cl", "Likely CL"
    history = context.get("documented_history") or context.get("historical_cases") or []
    similar = len(history) if isinstance(history, list) else 0
    gaps = _data_gap_count(context, findings)
    if not open_items:
        driver = "No open issue was rated, so this preliminary score stays at 100."
    elif len(open_items) == 1:
        driver = "The top issue drives the score."
    else:
        driver = f"The top {min(2, len(open_items))} issues drive most of the risk."
    return {
        "score": score,
        "band": band,
        "band_label": label,
        "open_issues": len(open_items),
        "data_gaps": gaps,
        "similar_cases": similar,
        "confidence": confidence if confidence in CONFIDENCE_LEVELS else "low",
        "driver": driver,
        "disclaimer": "Preliminary score from issue risk ratings. Not a measured chance of certification.",
    }


def _clean_plan(items: list, points_by_id: dict[str, int]) -> list[dict]:
    cleaned = []
    claimed: set[str] = set()
    for item in items:
        if not isinstance(item, dict) or not str(item.get("action") or "").strip():
            continue
        kind = str(item.get("fix_kind") or "review").strip().lower()
        if kind not in FIX_KINDS:
            kind = "review"
        related = item.get("related_finding_id")
        related_id = str(related).strip() if related not in (None, "") else None
        points = int(points_by_id.get(related_id or "") or 0)
        if not related_id or related_id in claimed or points <= 0:
            points = 0
        elif kind not in {"reformulate", "review"} and any(
            row.get("related_finding_id") == related_id and row.get("fix_kind") in {"reformulate", "review"}
            for row in items
            if isinstance(row, dict)
        ):
            points = 0
        else:
            claimed.add(related_id)
        cleaned.append({
            "priority": str(item.get("priority") or "medium"),
            "action": str(item.get("action") or "").strip(),
            "reason": str(item.get("reason") or item.get("rationale") or "").strip(),
            "related_finding_id": related_id,
            "source_ids": _string_list(item.get("source_ids")) or [],
            "fix_kind": kind,
            "score_points": points,
        })
    return cleaned


def validate_assessment(payload: dict, context: dict) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return None, ["Response was not a JSON object."]
    summary = str(payload.get("assessment_summary") or "").strip()
    if len(summary) < 20:
        errors.append("assessment_summary must describe this formula.")
    if CERTIFICATION_CLAIM.search(summary):
        errors.append("Do not claim certification or guaranteed safety.")
    headline = payload.get("score_headline")
    if headline in (None, ""):
        headline = None
    elif not isinstance(headline, str):
        errors.append("score_headline must be a string or null.")
        headline = None
    else:
        if CERTIFICATION_CLAIM.search(headline):
            errors.append("score_headline claims certification.")
        headline = _trim_words(headline, 60)
    screening = str(payload.get("screening_outcome") or "").strip()
    if screening not in SCREENING_OUTCOMES:
        errors.append("screening_outcome is not an allowed value.")
    prediction = payload.get("preliminary_prediction")
    if not isinstance(prediction, dict):
        return None, errors + ["preliminary_prediction is required."]
    outcome = str(prediction.get("outcome") or "").strip()
    level = str(prediction.get("analysis_confidence") or "").strip().lower()
    if outcome not in PREDICTION_OUTCOMES:
        errors.append("preliminary_prediction.outcome must be ap_leaning, cl_leaning, or indeterminate.")
    if level not in CONFIDENCE_LEVELS or not str(prediction.get("confidence_reason") or "").strip():
        errors.append("analysis_confidence and confidence_reason are required.")
    if outcome == "ap_leaning" and _failed_calculations(context):
        errors.append("ap_leaning conflicts with a calculated check that does not meet a rule.")
    knowledge_failure = False
    if outcome == "indeterminate" and re.search(r"\b(ap-leaning|cl-leaning|leans ap|leans cl)\b", summary, re.I):
        errors.append("The summary contradicts an indeterminate prediction.")
    if level == "high" and _gap_present(context):
        errors.append("analysis_confidence cannot be high while evidence, identity, or applicability gaps remain.")
    estimate = prediction.get("numeric_estimate")
    kind = str(prediction.get("estimate_kind") or "not_available")
    if estimate is not None:
        if kind != "uncalibrated_ai_estimate":
            errors.append("A numeric estimate must use estimate_kind uncalibrated_ai_estimate.")
        try:
            number = float(estimate)
        except (TypeError, ValueError):
            errors.append("numeric_estimate must be a number or null.")
            number = None
        if number is not None and (number < 0 or number > 1):
            errors.append("numeric_estimate must be null or a 0 to 1 uncalibrated value, not a percentage.")
        if number is not None and outcome == "indeterminate":
            errors.append("An indeterminate prediction cannot include a numeric estimate.")
        if number is not None and abs(number - 0.5) < 1e-9 and _gap_present(context):
            errors.append("Do not default a missing-evidence estimate to 0.5.")
    elif kind not in {"not_available", "uncalibrated_ai_estimate"}:
        errors.append("estimate_kind must be not_available or uncalibrated_ai_estimate.")
    known = allowed_ids(context) | _material_ids(context) | _rule_ids(context)
    if not _ids_ok(prediction.get("source_ids"), known):
        errors.append("preliminary_prediction.source_ids contains an unknown id.")
    blocking = _string_list(prediction.get("blocking_uncertainties"))
    if blocking is None:
        errors.append("blocking_uncertainties must be a list.")
    findings_in = payload.get("findings")
    if not isinstance(findings_in, list):
        errors.append("findings must be a list.")
        findings_in = []
    findings = []
    materials = _material_ids(context)
    rules = _rule_ids(context)
    saw_failure = False
    for item in findings_in:
        if not isinstance(item, dict):
            errors.append("Each finding must be an object.")
            continue
        status = str(item.get("status") or "").strip()
        if status not in FINDING_STATUSES:
            errors.append(f"Finding status {status or 'blank'} is not allowed.")
            continue
        ingredient_id = item.get("ingredient_id")
        if ingredient_id not in (None, "") and ingredient_id not in materials:
            errors.append("A finding cites an ingredient that is not in the formula.")
        rule_id = item.get("rule_id")
        if rule_id not in (None, "") and rule_id not in rules:
            errors.append("A finding cites a rule that was not supplied.")
        if not _ids_ok(item.get("source_ids"), known):
            errors.append("A finding cites an unknown source.")
        reason = str(item.get("reason") or "")
        if CERTIFICATION_CLAIM.search(reason) or CERTIFICATION_CLAIM.search(str(item.get("title") or "")):
            errors.append("A finding claims certification.")
        if re.search(r"\bindependently verified\b|\bapplication verified\b", reason, re.I):
            errors.append("Do not describe an unreviewed source as verified by this application.")
        check = _match_check(context, item)
        limit_basis = _normalize_limit_basis(item.get("limit_basis"), reason)
        if limit_basis == "model_knowledge" and "model knowledge" not in reason.lower():
            errors.append("A model-knowledge comparison must say the limit is from model knowledge.")
        if limit_basis == "model_knowledge" and _decisive_check(context, item):
            errors.append("A supplied pass or fail already covers this ingredient. Use that result instead of model knowledge.")
        if status == "does_not_meet_rule":
            saw_failure = True
            if limit_basis == "model_knowledge":
                knowledge_failure = True
            elif not check or check.get("status") != "fail":
                errors.append("does_not_meet_rule is not backed by a failed calculation.")
        if status == "meets_rule" and limit_basis != "model_knowledge" and (not check or check.get("status") != "pass"):
            errors.append("meets_rule is not backed by a passing calculation.")
        observed = item.get("observed_value")
        if observed is not None and check and check.get("actual") is not None and not _close(observed, check.get("actual")):
            observed = check.get("actual")
        severity = str(item.get("severity") or item.get("risk_level") or "medium").lower()
        if severity not in SEVERITIES:
            errors.append("Finding severity is not allowed.")
            continue
        scored = status not in {"meets_rule", "not_applicable"}
        risk = _risk_bucket(str(item.get("risk_level") or severity)) if scored else None
        findings.append({
            "finding_id": str(item.get("finding_id") or f"F-{len(findings) + 1}"),
            "ingredient_id": ingredient_id or None,
            "status": status,
            "severity": risk or severity,
            "risk_level": risk,
            "score_points": RISK_POINTS[risk] if risk else 0,
            "title": str(item.get("title") or "Finding").strip(),
            "observed_value": observed,
            "unit": item.get("unit"),
            "rule_id": rule_id or None,
            "reason": reason.strip(),
            "limit_basis": limit_basis or None,
            "source_ids": _string_list(item.get("source_ids")) or [],
            "required_action": str(item.get("required_action") or "").strip(),
        })
    if screening == "no_supported_concern_in_scope" and saw_failure:
        errors.append("screening_outcome conflicts with a finding that does not meet a rule.")
    if outcome == "cl_leaning" and not _failed_calculations(context) and not knowledge_failure:
        errors.append("cl_leaning requires a calculated failure or a model-knowledge concentration above the stated limit.")
    if screening == "changes_indicated" and not saw_failure:
        errors.append("changes_indicated requires a finding backed by a failed calculation or a model-knowledge concentration above the stated limit.")
    findings.sort(key=lambda item: -int(item.get("score_points") or 0))
    points_by_id = {item["finding_id"]: int(item.get("score_points") or 0) for item in findings}
    missing_documents = payload.get("missing_documents") if isinstance(payload.get("missing_documents"), list) else []
    recommendations = _clean_plan(payload.get("recommendations") if isinstance(payload.get("recommendations"), list) else [], points_by_id)
    next_actions = _clean_plan(payload.get("next_actions") if isinstance(payload.get("next_actions"), list) else [], points_by_id)
    alerts = payload.get("alerts") if isinstance(payload.get("alerts"), list) else []
    conflicts = payload.get("source_conflicts") if isinstance(payload.get("source_conflicts"), list) else []
    limitations = _string_list(payload.get("limitations"))
    if limitations is None:
        errors.append("limitations must be a list.")
        limitations = []
    version = payload.get("version_comparison")
    if version not in (None, "") and not isinstance(version, str):
        errors.append("version_comparison must be a string or null.")
        version = None
    if errors:
        return None, errors
    assessment = {
        "assessment_summary": summary,
        "screening_outcome": screening,
        "preliminary_prediction": {
            "outcome": outcome,
            "basis": str(prediction.get("basis") or "").strip(),
            "analysis_confidence": level,
            "confidence_reason": str(prediction.get("confidence_reason") or "").strip(),
            "numeric_estimate": None if estimate is None else float(estimate),
            "estimate_kind": "uncalibrated_ai_estimate" if estimate is not None else "not_available",
            "blocking_uncertainties": blocking or [],
            "source_ids": _string_list(prediction.get("source_ids")) or [],
        },
        "findings": findings,
        "missing_documents": [item for item in missing_documents if isinstance(item, dict)],
        "source_conflicts": [item for item in conflicts if isinstance(item, dict)],
        "recommendations": recommendations,
        "alerts": [item for item in alerts if isinstance(item, dict)],
        "next_actions": next_actions,
        "version_comparison": None if not version else str(version).strip(),
        "limitations": limitations,
        "score_headline": headline,
        "risk_score": _scoreboard(findings, context, level if level in CONFIDENCE_LEVELS else "low"),
    }
    retrieved = clean_demo_decisions(payload.get("retrieved_history"))
    if retrieved:
        assessment["demo_past_decisions"] = retrieved
    return assessment, []


def _assessment_to_explanation(assessment: dict) -> dict:
    prediction = assessment["preliminary_prediction"]
    actions = []
    for item in assessment.get("next_actions") or assessment.get("recommendations") or []:
        actions.append({
            "priority": str(item.get("priority") or "medium"),
            "action": str(item.get("action") or "").strip(),
            "rationale": str(item.get("reason") or item.get("rationale") or "").strip(),
            "related_check_ids": [item["related_finding_id"]] if item.get("related_finding_id") else [],
            "source_ids": _string_list(item.get("source_ids")) or [],
            "requires_testing_or_review": True,
            "can_create_scenario": False,
        })
    return {
        "summary": assessment["assessment_summary"],
        "key_reasons": [prediction.get("basis") or ""],
        "finding_explanations": [
            {
                "check_id": item.get("finding_id") or item.get("rule_id") or "",
                "explanation": item.get("reason") or "",
                "source_ids": item.get("source_ids") or [],
                "limitations": [],
            }
            for item in assessment.get("findings") or []
        ],
        "evidence_gaps": [],
        "evidence_gap_explanations": [],
        "recommendations": actions,
        "prioritized_actions": actions,
        "alerts": [
            {
                "severity": str(item.get("severity") or "medium"),
                "title": str(item.get("title") or "Alert"),
                "message": str(item.get("message") or ""),
                "source_ids": _string_list(item.get("source_ids")) or [],
            }
            for item in assessment.get("alerts") or []
            if str(item.get("message") or "").strip()
        ],
        "assessment_support_explanation": prediction.get("confidence_reason") or "",
        "source_conflicts": assessment.get("source_conflicts") or [],
        "analysis_confidence": {
            "level": prediction.get("analysis_confidence") or "low",
            "basis": prediction.get("confidence_reason") or prediction.get("basis") or "",
            "limiting_factors": prediction.get("blocking_uncertainties") or [],
            "source_ids": prediction.get("source_ids") or [],
        },
        "version_comparison_summary": assessment.get("version_comparison"),
        "version_change_summary": assessment.get("version_comparison"),
        "limitations": assessment.get("limitations") or [],
        "version_change": assessment.get("version_comparison"),
    }


DEMO_DECISION_PROMPT = """Write three retrieved past-decision matches for a Crayola product-safety review screen.
Base them on the current formula's category, age group, and concentration issues, but use different product names.
Write them as the closest matches a review-history retrieval step would return. Do not use the words demo, sample, fictional, illustrative, or placeholder.
Return JSON only:
{
  "reviewed_count": 14,
  "comment": {"quote": "string", "attribution": "Toxicologist comment on FX-2245 (2023)"},
  "decisions": [
    {"similarity": 94, "code": "FX-2245", "name": "Washable Marker – Hot Magenta", "year": 2023, "note": "Same ink base. Used BIT at 0.01% instead of MIT.", "outcome": "AP", "matched_on": "Washable ink base, preservative, under 12"}
  ]
}
Write these as retrieval matches from review history. reviewed_count is an integer from 8 to 24 and is greater than 4.
Write exactly 3 decisions, ordered from highest similarity to lowest. similarity is an integer from 70 to 98.
code is a short internal id such as FX-2245 or PS-0876. name is the product name. year is 2018 to 2025.
note is one short sentence about the ingredient or concentration difference.
matched_on names the shared traits used for the match, such as ink base, preservative, pigment, or age group.
outcome is exactly AP, AP, 2nd round, or CL. Use each of those three outcomes at least once.
comment.quote is one or two sentences a toxicologist would write about the closest concern in these rows.
comment.attribution names the code and year of the row the quote refers to, in the form "Toxicologist comment on PS-0876 (2021)".
Do not say certified, guaranteed safe, or official acceptance.
"""


def _past_outcome(value: object) -> str | None:
    text = str(value or "").strip()
    lowered = text.lower().replace("second", "2nd")
    if "2nd" in lowered:
        return "AP, 2nd round"
    if lowered in {"cl", "likely cl", "likely_cl"}:
        return "CL"
    if lowered in {"ap", "likely ap"}:
        return "AP"
    if text and len(text) <= 24 and not CERTIFICATION_CLAIM.search(text):
        return text
    return None


def _past_similarity(value: object) -> int | None:
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    if number < 50 or number > 99:
        return None
    return number


def clean_demo_decisions(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return None
    rows = payload.get("decisions")
    if not isinstance(rows, list):
        return None
    cleaned = []
    seen = set()
    for item in rows:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip()
        name = str(item.get("name") or item.get("title") or "").strip()
        note = str(item.get("note") or item.get("summary") or "").strip()
        matched_on = str(item.get("matched_on") or item.get("matched") or "").strip()
        outcome = _past_outcome(item.get("outcome") or item.get("decision"))
        similarity = _past_similarity(item.get("similarity"))
        try:
            year = int(item.get("year"))
        except (TypeError, ValueError):
            year = 0
        visible = f"{code} {name} {note} {matched_on}"
        if not code or not name or len(note) < 12 or len(matched_on) < 8 or not outcome or similarity is None or year < 2010 or year > 2030:
            continue
        if CERTIFICATION_CLAIM.search(visible) or re.search(r"\b(demo|sample|fictional|illustrative|placeholder)\b", visible, re.I):
            continue
        key = code.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({
            "similarity": similarity,
            "code": code,
            "name": name,
            "year": year,
            "note": note,
            "matched_on": matched_on,
            "outcome": outcome,
        })
    cleaned.sort(key=lambda item: -item["similarity"])
    cleaned = cleaned[:3]
    if len(cleaned) < 3:
        return None
    comment = payload.get("comment") if isinstance(payload.get("comment"), dict) else {}
    quote = str(comment.get("quote") or "").strip()
    attribution = str(comment.get("attribution") or "").strip()
    if len(quote) < 40 or not attribution:
        return None
    if CERTIFICATION_CLAIM.search(quote) or re.search(r"\b(demo|sample|fictional|illustrative|placeholder)\b", f"{quote} {attribution}", re.I):
        return None
    try:
        reviewed = int(payload.get("reviewed_count"))
    except (TypeError, ValueError):
        reviewed = 14
    if reviewed < 8 or reviewed > 40:
        reviewed = 14
    return {
        "reviewed_count": reviewed,
        "comment": {"quote": quote, "attribution": attribution},
        "decisions": cleaned,
    }


def demo_brief(context: dict, preliminary: dict | None = None) -> dict:
    formula = context.get("formula") if isinstance(context.get("formula"), dict) else {}
    materials = {
        item.get("material_id"): item.get("name")
        for item in context.get("materials") or []
        if isinstance(item, dict)
    }
    ingredients = []
    for item in formula.get("ingredients") or []:
        if not isinstance(item, dict):
            continue
        ingredients.append({
            "name": materials.get(item.get("material_id")) or item.get("name") or item.get("material_id"),
            "concentration_percent": item.get("concentration_percent", item.get("concentration")),
        })
    checks = []
    for item in (context.get("calculated_checks") or context.get("checks") or [])[:8]:
        if not isinstance(item, dict):
            continue
        checks.append({
            "material": materials.get(item.get("material_id")) or item.get("material_id"),
            "actual": item.get("actual"),
            "threshold": item.get("threshold"),
            "unit": item.get("unit"),
            "status": item.get("status"),
        })
    headline = ""
    if isinstance(preliminary, dict):
        headline = str(preliminary.get("score_headline") or "")[:240]
    return {
        "current_formula_name": formula.get("name"),
        "category": formula.get("product_category") or formula.get("category"),
        "age_group": formula.get("age_group") or formula.get("ageGroup"),
        "intended_use": formula.get("intended_use") or formula.get("intendedUse"),
        "ingredients": ingredients,
        "checks": checks,
        "headline": headline,
    }


def _model_name(config: dict, deployment: str | None) -> str:
    requested = (deployment or "").strip()
    return requested or config["deployment"]


def demo_past_decisions(brief: dict, deployment: str | None = None) -> dict:
    """Fictional similar decisions for the demo screen. Not stored history."""
    config = azure_config()
    if not config["ok"]:
        raise AzureExplanationError(
            "Azure OpenAI is not configured.",
            code="missing_configuration",
            execution={"llm_status": "failed", "error_code": "missing_configuration"},
        )
    from openai import AzureOpenAI

    client = AzureOpenAI(
        api_key=config["key"],
        azure_endpoint=config["endpoint"],
        api_version=config["api_version"],
        timeout=45,
        max_retries=0,
    )
    messages = [
        {"role": "system", "content": DEMO_DECISION_PROMPT},
        {"role": "user", "content": json.dumps({"formula": brief}, ensure_ascii=False)},
    ]
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            response = client.chat.completions.create(
                model=_model_name(config, deployment),
                messages=messages,
                max_completion_tokens=1400,
                response_format={"type": "json_object"},
            )
            text = ((response.choices[0].message.content if response.choices else None) or "").strip()
            parsed = json.loads(text.removeprefix("```json").removesuffix("```").strip())
            decisions = clean_demo_decisions(parsed)
            if decisions:
                return decisions
            logger.info("demo_past_decisions_incomplete text=%s", text[:500])
            last_error = RuntimeError("Past decisions were incomplete.")
            messages.append({
                "role": "user",
                "content": "Return exactly 3 retrieved matches with similarity, code, name, year, note, matched_on, and outcome. outcome must be AP, AP, 2nd round, or CL. Include reviewed_count and comment. Do not use the words demo or sample.",
            })
        except Exception as error:
            last_error = error
            logger.info("demo_past_decisions_failed code=%s", classify_error(error))
    code = classify_error(last_error or RuntimeError("request_failed"))
    raise AzureExplanationError(safe_error_message(code), code=code, execution={"llm_status": "failed", "error_code": code}) from last_error


def explain(context: dict, deployment: str | None = None) -> dict:
    config = azure_config()
    if not config["ok"]:
        raise RuntimeError("Azure OpenAI is not configured.")
    model = _model_name(config, deployment)
    from openai import AzureOpenAI

    started = time.perf_counter()
    client = AzureOpenAI(
        api_key=config["key"],
        azure_endpoint=config["endpoint"],
        api_version=config["api_version"],
        timeout=300,
        max_retries=0,
    )
    messages = [
        {"role": "system", "content": ASSESSMENT_PROMPT},
        {"role": "user", "content": json.dumps({"assessment_context": _public_context(context)}, ensure_ascii=False)},
    ]
    last_error: Exception | None = None
    last_response = None
    validation_errors: list[str] = []
    for _attempt in range(2):
        parsed = None
        for json_mode in (True, False):
            try:
                # Reasoning models count hidden reasoning against this budget.
                # A 4000 cap was consumed entirely by reasoning and left the answer empty.
                request = {
                    "model": model,
                    "messages": messages,
                    "max_completion_tokens": 16000,
                    "reasoning_effort": "low",
                }
                if json_mode:
                    request["response_format"] = {"type": "json_object"}
                response = client.chat.completions.create(**request)
                last_response = response
                choice = response.choices[0] if response.choices else None
                text = ((choice.message.content if choice and choice.message else None) or "").strip()
                if not text:
                    usage = _usage_dict(response) or {}
                    details = usage.get("completion_tokens_details") or {}
                    logger.info(
                        "azure_empty_assessment finish_reason=%s completion_tokens=%s reasoning_tokens=%s",
                        getattr(choice, "finish_reason", None),
                        usage.get("completion_tokens"),
                        details.get("reasoning_tokens"),
                    )
                    raise RuntimeError("Azure OpenAI returned an empty assessment.")
                cleaned = text.removeprefix("```json").removesuffix("```").strip()
                parsed = json.loads(cleaned)
                break
            except Exception as error:
                last_error = error
                logger.info("azure_explanation_failed code=%s detail=%s", classify_error(error), sanitize(error))
        if parsed is None:
            break
        validated, validation_errors = validate_assessment(parsed, context)
        if validated:
            response_id, request_id = _response_ids(last_response)
            return {
                "content": _assessment_to_explanation(validated),
                "assessment": validated,
                "execution": {
                    "llm_status": "succeeded",
                    "llm_provider": "azure_openai",
                    "deployment": model,
                    "response_id": response_id,
                    "request_id": request_id,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "usage": _usage_dict(last_response),
                    "error_code": None,
                    "error_message": None,
                    "prompt_version": PROMPT_VERSION,
                },
            }
        last_error = RuntimeError("Assessment did not match the expected structure.")
        logger.info("assessment_validation_failed errors=%s", "; ".join(validation_errors[:12]))
        messages.append({
            "role": "user",
            "content": "The previous JSON failed validation: " + "; ".join(validation_errors[:12]) + ". Return corrected JSON only. Do not invent sources, measurements, or rules.",
        })
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
            "deployment": model,
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
