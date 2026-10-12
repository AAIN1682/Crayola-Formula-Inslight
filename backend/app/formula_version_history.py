"""Read-only snapshots of formula composition before a version bump."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.config import DATA
from app.formula_store import Ingredient

HISTORY_PATH = DATA / "formula_version_history.json"
_FILE_LOCK = asyncio.Lock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class VersionSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=40)
    savedAt: str
    ingredients: list[Ingredient]


def _ensure_storage() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    if not HISTORY_PATH.is_file():
        HISTORY_PATH.write_text("{}\n", encoding="utf-8")


async def _read_store() -> dict[str, list[dict[str, Any]]]:
    _ensure_storage()

    def _read() -> dict[str, list[dict[str, Any]]]:
        payload = json.loads(HISTORY_PATH.read_text(encoding="utf-8-sig"))
        if not isinstance(payload, dict):
            raise ValueError("formula_version_history.json must be a JSON object")
        return payload

    return await asyncio.to_thread(_read)


async def _write_store(payload: dict[str, list[dict[str, Any]]]) -> None:
    def _write() -> None:
        _ensure_storage()
        tmp = HISTORY_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, HISTORY_PATH)

    async with _FILE_LOCK:
        await asyncio.to_thread(_write)


async def append_snapshot(formula_id: str, version: str, ingredients: list[Ingredient]) -> VersionSnapshot:
    snapshot = VersionSnapshot(version=version, savedAt=_utc_now_iso(), ingredients=ingredients)
    store = await _read_store()
    rows = store.get(formula_id)
    if not isinstance(rows, list):
        rows = []
    rows.append(snapshot.model_dump(mode="json"))
    store[formula_id] = rows
    await _write_store(store)
    return snapshot


async def list_snapshots(formula_id: str) -> list[VersionSnapshot]:
    store = await _read_store()
    rows = store.get(formula_id)
    if not isinstance(rows, list):
        return []
    result: list[VersionSnapshot] = []
    for item in rows:
        if isinstance(item, dict):
            result.append(VersionSnapshot.model_validate(item))
    return result
