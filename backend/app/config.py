"""Server configuration. Credentials stay in the process environment."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

REQUIRED_DATA_FILES = (
    "materials.json",
    "rules.json",
    "documents.json",
    "extracted_facts.json",
    "evidence_requirements.json",
    "source_issues.json",
    "regulatory_reference_rows.json",
    "source_chunks.json",
    "historical_cases.json",
    "manifest.json",
)


def _first(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def resolve_data_dir() -> Path:
    configured = _first("BACKEND_DATA_DIR")
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
    else:
        path = (ROOT / "data").resolve()
    missing = [name for name in REQUIRED_DATA_FILES if not (path / name).is_file()]
    if missing:
        raise RuntimeError(
            "Backend data directory is not configured correctly. "
            f"Resolved path: {path}. Missing required files: {', '.join(missing)}. "
            "Set BACKEND_DATA_DIR to the folder that contains the packaged JSON files. "
            "No alternate sample folder will be loaded."
        )
    return path


DATA = resolve_data_dir()


def azure_settings() -> dict:
    key = _first("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_KEY")
    endpoint = _first("AZURE_OPENAI_ENDPOINT")
    deployment = _first("AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_DEPLOYMENT_NAME")
    api_version = _first("AZURE_OPENAI_API_VERSION", "OPENAI_API_VERSION")
    missing = [
        name
        for name, value in (
            ("AZURE_OPENAI_API_KEY", key),
            ("AZURE_OPENAI_ENDPOINT", endpoint),
            ("AZURE_OPENAI_DEPLOYMENT", deployment),
            ("AZURE_OPENAI_API_VERSION", api_version),
        )
        if not value
    ]
    return {
        "ok": not missing,
        "missing": missing,
        "key": key,
        "endpoint": endpoint,
        "deployment": deployment,
        "api_version": api_version,
    }
