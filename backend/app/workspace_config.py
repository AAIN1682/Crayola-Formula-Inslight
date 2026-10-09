"""Workspace JSON store (formulas, runs, demo dataset) separate from reference screening data."""

from __future__ import annotations

import os
from pathlib import Path

from app.config import ROOT

DEFAULT_WORKSPACE = (ROOT / "datanew").resolve()


def resolve_workspace_dir() -> Path:
    configured = os.environ.get("WORKSPACE_DATA_DIR", "").strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
    else:
        path = DEFAULT_WORKSPACE
    path.mkdir(parents=True, exist_ok=True)
    return path


WORKSPACE = resolve_workspace_dir()
