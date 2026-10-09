"""Workspace API: full dataset load/save for the Formula Insight UI."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.workspace_store import load_dataset, reset_from_seed, save_dataset

router = APIRouter()


class WorkspacePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    people: list[Any] = Field(default_factory=list)
    formulas: list[Any] = Field(default_factory=list)
    rawMaterials: list[Any] = Field(default_factory=list)
    documents: list[Any] = Field(default_factory=list)
    submissions: list[Any] = Field(default_factory=list)
    alerts: list[Any] = Field(default_factory=list)
    runs: list[Any] = Field(default_factory=list)
    decisions: list[Any] = Field(default_factory=list)
    activities: list[Any] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)
    sourceReviewDrafts: list[Any] = Field(default_factory=list)


@router.get("/api/workspace")
def get_workspace() -> dict[str, Any]:
    return load_dataset()


@router.put("/api/workspace")
def put_workspace(body: WorkspacePayload) -> dict[str, Any]:
    payload = body.model_dump()
    save_dataset(payload)
    return load_dataset()


@router.post("/api/workspace/reset")
def post_workspace_reset() -> dict[str, Any]:
    try:
        return reset_from_seed()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
