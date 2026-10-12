"""Formula library list enrichment from saved assessment runs."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dashboard_service import is_run_current, resolve_latest_run
from app.formula_store import Formula

DisplayStatus = Literal[
    "not-screened",
    "pass-leaning",
    "at-risk",
    "likely-cl",
    "screening-failed",
    "running",
]

ScoreKind = Literal["numeric_estimate", "rule_based", "none"]
ScreeningBand = Literal["all", "likely-ap", "at-risk", "likely-cl", "not-screened"]

RISKY_CHECK_STATUSES = frozenset(
    {"fail", "needs_test_data", "applicability_unknown", "source_review_required", "not_assessed"}
)


class LatestRunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runId: str
    assessmentId: str
    lastScreenedAt: str | None = None
    displayStatus: DisplayStatus
    outdated: bool = False
    scoreValue: float | None = None
    scoreKind: ScoreKind = "none"
    scoreLabel: str | None = None
    topIssue: str | None = None
    extraIssues: int = 0


class LibrarySummaryCounts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total: int
    likelyAp: int
    atRisk: int
    likelyCl: int
    notScreened: int


def _field(record: dict[str, Any] | None, *keys: str, default: Any = None) -> Any:
    if not isinstance(record, dict):
        return default
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return default


def _run_id(run: dict[str, Any]) -> str:
    return str(
        _field(run, "assessment_id", "id", "run_id", "runId")
        or _field(_field(run, "formulaAssessment", "formula_assessment"), "assessment_id")
        or ""
    )


def _calculated_checks(run: dict[str, Any]) -> list[dict[str, Any]]:
    context = _field(run, "llm_context")
    if isinstance(context, dict):
        checks = _field(context, "calculated_checks")
        if isinstance(checks, list):
            return [item for item in checks if isinstance(item, dict)]
    checks = _field(run, "calculated_checks")
    if isinstance(checks, list):
        return [item for item in checks if isinstance(item, dict)]
    return []


def _issue_messages(run: dict[str, Any]) -> list[str]:
    messages: list[str] = []
    for check in _calculated_checks(run):
        status = str(_field(check, "status", default="") or "").lower()
        if status not in RISKY_CHECK_STATUSES:
            continue
        message = str(_field(check, "message", default="") or "").strip()
        if message:
            messages.append(message)
    prelim = _field(run, "preliminary_assessment")
    if isinstance(prelim, dict):
        for finding in _field(prelim, "findings", default=[]) or []:
            if not isinstance(finding, dict):
                continue
            text = str(_field(finding, "summary", "message", "title", default="") or "").strip()
            if text:
                messages.append(text)
    support = _field(_field(run, "metrics"), "assessment_support")
    if isinstance(support, dict):
        for factor in _field(support, "limiting_factors", default=[]) or []:
            text = str(factor or "").strip()
            if text and text not in messages:
                messages.append(text)
    return messages


def compute_display_status(run: dict[str, Any] | None) -> DisplayStatus:
    if not run:
        return "not-screened"
    explanation = _field(run, "explanation")
    execution = _field(run, "execution")
    llm_status = str(_field(execution, "llm_status", default="") or "").lower()
    if isinstance(explanation, dict) and explanation.get("status") == "failed":
        return "screening-failed"
    if llm_status == "failed" and not _field(run, "screening_status"):
        return "screening-failed"

    prelim = _field(run, "preliminary_assessment")
    outcome = ""
    if isinstance(prelim, dict):
        prediction = _field(prelim, "preliminary_prediction")
        if isinstance(prediction, dict):
            outcome = str(_field(prediction, "outcome", default="") or "").lower()

    screening = str(_field(run, "screening_status", default="") or "").lower()
    if outcome == "cl_leaning" or screening == "changes_required":
        return "likely-cl"
    if outcome == "ap_leaning" or screening == "no_issues_found_in_assessed_scope":
        return "pass-leaning"
    if screening in {"more_information_required", "not_assessed"} or outcome == "indeterminate":
        return "at-risk"
    if screening:
        return "at-risk"
    return "at-risk"


def band_for_display(status: DisplayStatus) -> ScreeningBand | None:
    if status == "not-screened":
        return "not-screened"
    if status == "pass-leaning":
        return "likely-ap"
    if status == "likely-cl":
        return "likely-cl"
    if status in {"at-risk", "screening-failed"}:
        return "at-risk"
    return None


def compute_score(run: dict[str, Any] | None) -> tuple[float | None, ScoreKind, str | None]:
    if not run:
        return None, "none", None
    prelim = _field(run, "preliminary_assessment")
    if isinstance(prelim, dict):
        prediction = _field(prelim, "preliminary_prediction")
        if isinstance(prediction, dict):
            estimate = _field(prediction, "numeric_estimate")
            if isinstance(estimate, (int, float)):
                value = float(estimate)
                if 0 <= value <= 1:
                    return round(value * 100, 1), "numeric_estimate", None
                if 0 <= value <= 100:
                    return round(value, 1), "numeric_estimate", None

    metrics = _field(run, "metrics")
    if isinstance(metrics, dict):
        rate = _field(metrics, "check_pass_rate_percent")
        if isinstance(rate, (int, float)):
            return float(rate), "rule_based", "rule-based"
    return None, "none", None


def build_latest_run_summary(formula: Formula, run: dict[str, Any] | None, *, outdated: bool) -> LatestRunSummary | None:
    if not run:
        return None
    run_id = _run_id(run)
    if not run_id:
        return None
    issues = _issue_messages(run)
    score_value, score_kind, score_label = compute_score(run)
    return LatestRunSummary(
        runId=run_id,
        assessmentId=run_id,
        lastScreenedAt=_field(run, "created_at", "runAt", "run_at", "createdAt"),
        displayStatus=compute_display_status(run),
        outdated=outdated,
        scoreValue=score_value,
        scoreKind=score_kind,
        scoreLabel=score_label,
        topIssue=issues[0] if issues else None,
        extraIssues=max(0, len(issues) - 1),
    )


def is_formula_outdated(formula: Formula, run: dict[str, Any] | None) -> bool:
    if not run:
        return False
    if not formula.screeningCurrent:
        return True
    return not is_run_current(formula.model_dump(), run)


def enrich_formula_row(
    formula: Formula,
    runs: list[dict[str, Any]],
    latest_index: dict[str, Any],
) -> tuple[LatestRunSummary | None, DisplayStatus]:
    run = resolve_latest_run(formula.id, runs, latest_index)
    outdated = is_formula_outdated(formula, run)
    summary = build_latest_run_summary(formula, run, outdated=outdated)
    status = summary.displayStatus if summary else "not-screened"
    return summary, status


def count_summary(rows: list[tuple[Formula, DisplayStatus]]) -> LibrarySummaryCounts:
    counts = {"likely-ap": 0, "at-risk": 0, "likely-cl": 0, "not-screened": 0}
    for _, status in rows:
        band = band_for_display(status)
        if band and band != "all":
            counts[band] += 1
    return LibrarySummaryCounts(
        total=len(rows),
        likelyAp=counts["likely-ap"],
        atRisk=counts["at-risk"],
        likelyCl=counts["likely-cl"],
        notScreened=counts["not-screened"],
    )


def matches_band(status: DisplayStatus, band: ScreeningBand | None) -> bool:
    if not band or band == "all":
        return True
    mapped = band_for_display(status)
    if band == "at-risk":
        return status in {"at-risk", "screening-failed"}
    return mapped == band
