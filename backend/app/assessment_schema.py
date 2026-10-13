"""Azure structured-output JSON schema for formula assessments."""

from __future__ import annotations

FINDING_STATUSES = sorted([
    "meets_rule",
    "does_not_meet_rule",
    "needs_information",
    "testing_required",
    "unresolved_identity",
    "uncertain_applicability",
    "source_review_required",
    "not_applicable",
])
PREDICTION_OUTCOMES = sorted(["ap_leaning", "cl_leaning", "indeterminate"])
SCREENING_OUTCOMES = sorted([
    "additional_information_required",
    "changes_indicated",
    "no_supported_concern_in_scope",
    "not_assessed",
])
CONFIDENCE_LEVELS = sorted(["low", "medium", "high"])
SEVERITIES = sorted(["critical", "high", "medium", "informational", "low"])
FIX_KINDS = sorted(["reformulate", "lab_test", "supplier_request", "review"])


def _nullable_string() -> dict:
    return {"type": ["string", "null"]}


def _string_array() -> dict:
    return {"type": "array", "items": {"type": "string"}}


def assessment_structured_response_format() -> dict:
    finding = {
        "type": "object",
        "properties": {
            "finding_id": {"type": "string"},
            "ingredient_id": _nullable_string(),
            "status": {"type": "string", "enum": FINDING_STATUSES},
            "severity": {"type": "string", "enum": SEVERITIES},
            "risk_level": _nullable_string(),
            "title": {"type": "string"},
            "observed_value": {"type": ["number", "null"]},
            "unit": _nullable_string(),
            "rule_id": _nullable_string(),
            "reason": {"type": "string"},
            "required_reason_text": _nullable_string(),
            "source_ids": _string_array(),
            "required_action": {"type": "string"},
        },
        "required": [
            "finding_id",
            "ingredient_id",
            "status",
            "severity",
            "risk_level",
            "title",
            "observed_value",
            "unit",
            "rule_id",
            "reason",
            "required_reason_text",
            "source_ids",
            "required_action",
        ],
        "additionalProperties": False,
    }
    prediction = {
        "type": "object",
        "properties": {
            "outcome": {"type": "string", "enum": PREDICTION_OUTCOMES},
            "basis": {"type": "string"},
            "analysis_confidence": {"type": "string", "enum": CONFIDENCE_LEVELS},
            "confidence_reason": {"type": "string"},
            "numeric_estimate": {"type": ["number", "null"]},
            "estimate_kind": {"type": "string", "enum": ["not_available", "uncalibrated_ai_estimate"]},
            "blocking_uncertainties": _string_array(),
            "source_ids": _string_array(),
        },
        "required": [
            "outcome",
            "basis",
            "analysis_confidence",
            "confidence_reason",
            "numeric_estimate",
            "estimate_kind",
            "blocking_uncertainties",
            "source_ids",
        ],
        "additionalProperties": False,
    }
    plan_item = {
        "type": "object",
        "properties": {
            "priority": {"type": "string"},
            "action": {"type": "string"},
            "reason": {"type": "string"},
            "related_finding_id": _nullable_string(),
            "fix_kind": {"type": "string", "enum": FIX_KINDS},
            "source_ids": _string_array(),
        },
        "required": ["priority", "action", "reason", "related_finding_id", "fix_kind", "source_ids"],
        "additionalProperties": False,
    }
    missing_doc = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "document_type": {"type": "string"},
            "reason": {"type": "string"},
            "ingredient_id": _nullable_string(),
            "source_ids": _string_array(),
        },
        "required": ["title", "document_type", "reason", "ingredient_id", "source_ids"],
        "additionalProperties": False,
    }
    schema = {
        "type": "object",
        "properties": {
            "assessment_summary": {"type": "string"},
            "score_headline": _nullable_string(),
            "screening_outcome": {"type": "string", "enum": SCREENING_OUTCOMES},
            "preliminary_prediction": prediction,
            "findings": {"type": "array", "items": finding},
            "missing_documents": {"type": "array", "items": missing_doc},
            "source_conflicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "explanation": {"type": "string"},
                        "source_ids": _string_array(),
                    },
                    "required": ["explanation", "source_ids"],
                    "additionalProperties": False,
                },
            },
            "recommendations": {"type": "array", "items": plan_item},
            "alerts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string"},
                        "title": {"type": "string"},
                        "message": {"type": "string"},
                        "source_ids": _string_array(),
                    },
                    "required": ["severity", "title", "message", "source_ids"],
                    "additionalProperties": False,
                },
            },
            "next_actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "priority": {"type": "string"},
                        "action": {"type": "string"},
                        "reason": {"type": "string"},
                        "related_finding_id": _nullable_string(),
                    },
                    "required": ["priority", "action", "reason", "related_finding_id"],
                    "additionalProperties": False,
                },
            },
            "version_comparison": _nullable_string(),
            "limitations": _string_array(),
        },
        "required": [
            "assessment_summary",
            "score_headline",
            "screening_outcome",
            "preliminary_prediction",
            "findings",
            "missing_documents",
            "source_conflicts",
            "recommendations",
            "alerts",
            "next_actions",
            "version_comparison",
            "limitations",
        ],
        "additionalProperties": False,
    }
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "formula_assessment",
            "strict": True,
            "schema": schema,
        },
    }
