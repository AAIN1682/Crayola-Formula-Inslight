"""Persist assessments for a formula the caller already saved.

User formulas live in the browser dataset. The only formulas this process can
load by id are packaged examples. A request that includes the saved formula
assesses that payload. Results are appended to assessment_runs.json.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import threading
from pathlib import Path

from fastapi import HTTPException

from app.config import DATA
from app.engine import load_scenario_store, load_store

logger = logging.getLogger("affine.screening")

_LOCK = threading.Lock()


class ScreeningServiceError(Exception):
    def __init__(self, status_code: int, detail: str | list):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def runs_path() -> Path:
    configured = os.environ.get("ASSESSMENT_RUNS_PATH", "").strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
        return path
    return (DATA / "assessment_runs.json").resolve()


def _require_formula_id(formula_id: str) -> str:
    text = str(formula_id or "").strip()
    if not text or len(text) > 100:
        raise ScreeningServiceError(
            422,
            [{"loc": ["formula_id"], "msg": "A formula id is required.", "type": "value_error"}],
        )
    return text


def _example_inputs() -> list[dict]:
    inputs: list[dict] = []
    for store in (load_scenario_store(), load_store()):
        for example in store.get("examples") or []:
            item = example.get("input") if isinstance(example, dict) else None
            if isinstance(item, dict):
                inputs.append(item)
    return inputs


def load_saved_formula(formula_id: str) -> dict:
    """Return the one packaged example saved under this formula id."""
    wanted = _require_formula_id(formula_id)
    found: list[dict] = []
    seen: set[str] = set()
    for item in _example_inputs():
        if item.get("formula_id") != wanted:
            continue
        fingerprint = json.dumps(item, sort_keys=True, default=str)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        found.append(copy.deepcopy(item))
    if not found:
        raise ScreeningServiceError(404, "That formula is not saved.")
    if len(found) > 1:
        raise ScreeningServiceError(
            422,
            "More than one saved example uses this formula id. Send the saved formula to assess a specific version.",
        )
    return found[0]


def load_runs() -> dict:
    path = runs_path()
    if not path.is_file():
        return {"runs": [], "latest": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ScreeningServiceError(500, "Saved assessment history could not be read.") from error
    except OSError as error:
        raise ScreeningServiceError(500, "Saved assessment history could not be read.") from error
    if isinstance(payload, list):
        payload = {"runs": payload}
    if not isinstance(payload, dict) or not isinstance(payload.get("runs"), list):
        raise ScreeningServiceError(500, "Saved assessment history could not be read.")
    runs = [item for item in payload["runs"] if isinstance(item, dict)]
    return {"runs": runs, "latest": _latest_index(runs)}


def _latest_index(runs: list[dict]) -> dict:
    latest: dict[str, dict] = {}
    for run in runs:
        snapshot = run.get("input_snapshot") if isinstance(run, dict) else None
        formula_id = snapshot.get("formula_id") if isinstance(snapshot, dict) else None
        if not formula_id:
            continue
        latest[str(formula_id)] = {
            "assessment_id": run.get("assessment_id"),
            "screening_status": run.get("screening_status"),
            "screening_status_label": run.get("screening_status_label"),
            "assessment_mode": run.get("assessment_mode"),
            "created_at": run.get("created_at"),
            "version_id": snapshot.get("version_id"),
        }
    return latest


def latest_screening_status(formula_id: str) -> dict | None:
    """Latest saved status for one formula, using the assessment's own fields."""
    wanted = str(formula_id or "").strip()
    if not wanted:
        return None
    history = load_runs()
    status = history["latest"].get(wanted)
    return status if isinstance(status, dict) else None


def _write_history(path: Path, history: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
    except OSError:
        try:
            if temporary.is_file():
                temporary.unlink()
        except OSError:
            pass
        raise


def append_assessment(result: dict) -> dict:
    if not isinstance(result, dict) or not result.get("assessment_id"):
        raise ScreeningServiceError(500, "The assessment could not be completed.")
    path = runs_path()
    with _LOCK:
        history = load_runs()
        history["runs"].append(result)
        history["latest"] = _latest_index(history["runs"])
        try:
            _write_history(path, history)
        except OSError as error:
            raise ScreeningServiceError(500, "The assessment result could not be saved.") from error
    return result


def assess_saved_formula(formula_id: str, formula, assess) -> dict:
    """Run an existing assessment callable and append the result."""
    wanted = _require_formula_id(formula_id)
    actual = formula.formula_id if hasattr(formula, "formula_id") else (formula or {}).get("formula_id")
    if actual != wanted:
        raise ScreeningServiceError(
            422,
            [{"loc": ["formula_id"], "msg": "The formula id does not match the requested formula.", "type": "value_error"}],
        )
    try:
        result = assess(formula)
    except HTTPException:
        raise
    except ScreeningServiceError:
        raise
    except Exception as error:
        logger.exception("saved_formula_assessment_failed formula_id=%s", wanted)
        raise ScreeningServiceError(500, "The assessment could not be completed.") from error
    saved = append_assessment(result)
    logger.info(
        "assessment_persisted formula_id=%s assessment_id=%s screening_status=%s",
        wanted,
        saved.get("assessment_id"),
        saved.get("screening_status"),
    )
    return saved
