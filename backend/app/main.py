from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import settings
from app.store import DataStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_FILE = Path(settings.data_path)
store = DataStore(DATA_FILE)

app = FastAPI(title="Formula Insight API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngredientInput(BaseModel):
    id: str | None = None
    name: str
    rawMaterialId: str | None = None
    concentration: float = 0
    casNumber: str | None = None
    supplier: str | None = None
    evidenceIds: list[str] | None = None
    addedInVersion: str | None = None
    notes: str | None = None


class FormulaInput(BaseModel):
    name: str
    category: str | None = None
    ageGroup: str | None = None
    physicalForm: str | None = None
    intendedUse: str
    markets: list[str] | None = None
    ownerId: str
    reviewerId: str | None = None
    version: str | None = None
    description: str | None = None
    nextReviewDate: str | None = None
    lifecycle: str | None = None
    ingredients: list[IngredientInput] = Field(default_factory=list)
    evidenceIds: list[str] = Field(default_factory=list)


@app.get("/api/health")
def health() -> dict[str, str]:
    azure = bool(settings.azure_openai_api_key and settings.azure_openai_endpoint)
    return {"status": "ok", "azureConfigured": str(azure).lower()}


@app.get("/api/dataset")
def get_dataset() -> dict:
    return store.get_dataset()


@app.post("/api/dataset/reset")
def reset_dataset() -> dict[str, str]:
    store.reset_from_seed()
    return {"status": "reset"}


@app.post("/api/formulas")
def create_formula(body: FormulaInput) -> dict:
    try:
        return store.create_formula(body.model_dump(exclude_none=True))
    except Exception as exc:
        logger.exception("create_formula failed")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/formulas/{formula_id}")
def update_formula(formula_id: str, body: FormulaInput) -> dict:
    try:
        return store.update_formula(formula_id, body.model_dump(exclude_none=True))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("update_formula failed")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/formulas/{formula_id}/screening/runs")
def run_screening(formula_id: str) -> dict:
    try:
        return store.run_screening(formula_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("run_screening failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("run_screening failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
