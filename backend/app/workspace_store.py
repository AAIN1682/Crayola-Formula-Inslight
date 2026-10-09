"""Read/write Formula Insight workspace files under WORKSPACE_DATA_DIR."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app.workspace_config import WORKSPACE

FILE_MAP = {
    "people": "people.json",
    "formulas": "formulas.json",
    "rawMaterials": "raw_materials.json",
    "documents": "documents.json",
    "submissions": "submissions.json",
    "alerts": "alerts.json",
    "decisions": "decisions.json",
    "activities": "activities.json",
    "settings": "settings.json",
    "sourceReviewDrafts": "source_review_drafts.json",
}


def _path(name: str) -> Path:
    return WORKSPACE / name


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def load_assessment_runs() -> dict[str, Any]:
    raw = _read_json(_path("assessment_runs.json"), {"runs": [], "latest": {}})
    if not isinstance(raw, dict):
        return {"runs": [], "latest": {}}
    runs = raw.get("runs")
    latest = raw.get("latest")
    return {
        "runs": runs if isinstance(runs, list) else [],
        "latest": latest if isinstance(latest, dict) else {},
    }


def save_assessment_runs(runs: list[Any], latest: dict[str, Any]) -> None:
    _write_json(_path("assessment_runs.json"), {"runs": runs, "latest": latest})


def load_dataset() -> dict[str, Any]:
    runs_payload = load_assessment_runs()
    settings = _read_json(_path(FILE_MAP["settings"]), {})
    if not isinstance(settings, dict) or not settings:
        settings = {
            "currentUserId": "usr-dana",
            "defaultReviewerId": "usr-marcus",
            "tableDensity": "comfortable",
        }
    drafts = _read_json(_path(FILE_MAP["sourceReviewDrafts"]), [])
    return {
        "people": _read_json(_path(FILE_MAP["people"]), []),
        "formulas": _read_json(_path(FILE_MAP["formulas"]), []),
        "rawMaterials": _read_json(_path(FILE_MAP["rawMaterials"]), []),
        "documents": _read_json(_path(FILE_MAP["documents"]), []),
        "submissions": _read_json(_path(FILE_MAP["submissions"]), []),
        "alerts": _read_json(_path(FILE_MAP["alerts"]), []),
        "runs": runs_payload["runs"],
        "decisions": _read_json(_path(FILE_MAP["decisions"]), []),
        "activities": _read_json(_path(FILE_MAP["activities"]), []),
        "settings": settings,
        "sourceReviewDrafts": drafts if isinstance(drafts, list) else [],
    }


def save_dataset(dataset: dict[str, Any]) -> None:
    for key, filename in FILE_MAP.items():
        if key in dataset:
            _write_json(_path(filename), dataset[key])
    runs = dataset.get("runs")
    if isinstance(runs, list):
        latest: dict[str, str] = {}
        for formula in dataset.get("formulas") or []:
            if isinstance(formula, dict):
                formula_id = formula.get("id")
                latest_run_id = formula.get("latestRunId")
                if formula_id and latest_run_id:
                    latest[str(formula_id)] = str(latest_run_id)
        save_assessment_runs(runs, latest)


def reset_from_seed() -> dict[str, Any]:
    seed_dir = WORKSPACE / "_seed"
    if not seed_dir.is_dir():
        raise FileNotFoundError(f"Seed snapshot missing: {seed_dir}")
    for item in seed_dir.iterdir():
        if item.is_file() and item.suffix == ".json":
            shutil.copy2(item, _path(item.name))
    return load_dataset()
