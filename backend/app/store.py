from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.id_utils import next_sequential_id, uid
from app.services.screening_llm import run_llm_screening

logger = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent / "seed" / "dataset.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ingredient_signature(ingredients: list[dict[str, Any]]) -> str:
    def key(ing: dict[str, Any]) -> str:
        rm = ing.get("rawMaterialId")
        return rm if rm else (ing.get("name") or "").strip().lower()

    parts = sorted(f"{key(ing)}@{ing.get('concentration')}" for ing in ingredients)
    return "|".join(parts)


def _snapshot_ingredients(ingredients: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "name": ing.get("name"),
            "rawMaterialId": ing.get("rawMaterialId"),
            "concentration": ing.get("concentration"),
        }
        for ing in ingredients
    ]


class DataStore:
    def __init__(self, data_path: Path) -> None:
        self.data_path = data_path
        self.data: dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        if self.data_path.is_file():
            self.data = json.loads(self.data_path.read_text(encoding="utf-8"))
            return
        self.reset_from_seed()

    def save(self) -> None:
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        self.data_path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")

    def reset_from_seed(self) -> None:
        self.data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        self.save()

    def get_dataset(self) -> dict[str, Any]:
        return deepcopy(self.data)

    def _require_formula(self, formula_id: str) -> dict[str, Any]:
        for formula in self.data.get("formulas", []):
            if formula.get("id") == formula_id:
                return formula
        raise KeyError(f"Formula {formula_id} was not found.")

    def _current_user_id(self) -> str:
        return self.data.get("settings", {}).get("currentUserId", "USR-001")

    def _add_activity(self, event: dict[str, Any]) -> None:
        activities = self.data.setdefault("activities", [])
        activities.insert(
            0,
            {
                "id": uid("ACT"),
                "at": _utc_now(),
                "actorId": self._current_user_id(),
                **event,
            },
        )

    def build_formula_from_input(
        self, input_data: dict[str, Any], base: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        now = _utc_now()
        formula_ids = [f["id"] for f in self.data.get("formulas", [])]
        formula_id = base["id"] if base else next_sequential_id("FML", formula_ids)

        raw_materials = self.data.get("rawMaterials", [])
        rm_by_id = {m["id"]: m for m in raw_materials}

        ingredients = []
        for index, ing in enumerate(input_data.get("ingredients") or []):
            rm_id = ing.get("rawMaterialId")
            supplier = ing.get("supplier") or (rm_by_id.get(rm_id or "") or {}).get("supplier")
            ingredients.append(
                {
                    "id": ing.get("id") or f"{formula_id}-ING-{index + 1:02d}",
                    "name": (ing.get("name") or "").strip(),
                    "rawMaterialId": rm_id,
                    "concentration": float(ing.get("concentration") or 0),
                    "casNumber": (ing.get("casNumber") or "").strip() or None,
                    "supplier": supplier,
                    "evidenceIds": ing.get("evidenceIds") or [],
                    "addedInVersion": ing.get("addedInVersion"),
                    "notes": ing.get("notes"),
                }
            )

        if base:
            return {
                **base,
                "name": input_data["name"].strip(),
                "version": (input_data.get("version") or base.get("version") or "v1.0").strip(),
                "category": input_data.get("category") or base.get("category") or "Markers",
                "ageGroup": input_data.get("ageGroup") or base.get("ageGroup") or "Below 12",
                "physicalForm": input_data.get("physicalForm") or base.get("physicalForm") or "Liquid",
                "intendedUse": input_data["intendedUse"].strip(),
                "markets": input_data.get("markets") if input_data.get("markets") else base.get("markets"),
                "ownerId": input_data["ownerId"],
                "reviewerId": input_data.get("reviewerId"),
                "lifecycle": input_data.get("lifecycle") or base.get("lifecycle") or "draft",
                "ingredients": ingredients,
                "evidenceIds": input_data.get("evidenceIds") or [],
                "updatedAt": now,
                "nextReviewDate": input_data.get("nextReviewDate") or base.get("nextReviewDate"),
                "description": input_data.get("description") if "description" in input_data else base.get("description"),
            }

        return {
            "id": formula_id,
            "name": input_data["name"].strip(),
            "version": (input_data.get("version") or "v1.0").strip(),
            "category": input_data.get("category") or "Markers",
            "ageGroup": input_data.get("ageGroup") or "Below 12",
            "physicalForm": input_data.get("physicalForm") or "Liquid",
            "intendedUse": input_data["intendedUse"].strip(),
            "markets": input_data.get("markets") or [],
            "ownerId": input_data["ownerId"],
            "reviewerId": input_data.get("reviewerId"),
            "lifecycle": input_data.get("lifecycle") or "draft",
            "ingredients": ingredients,
            "evidenceIds": input_data.get("evidenceIds") or [],
            "screeningStatus": "not-screened",
            "screeningCurrent": False,
            "reviewStatus": "not-started",
            "createdAt": now,
            "updatedAt": now,
            "nextReviewDate": input_data.get("nextReviewDate"),
            "description": input_data.get("description"),
        }

    def create_formula(self, input_data: dict[str, Any]) -> dict[str, Any]:
        formula = self.build_formula_from_input(input_data)
        self.data.setdefault("formulas", []).append(formula)
        self._add_activity(
            {
                "type": "formula-created",
                "summary": f"{formula['name']} created",
                "detail": (
                    "Saved as a draft. Missing fields are listed on the formula record."
                    if formula.get("lifecycle") == "draft"
                    else f"{len(formula.get('ingredients', []))} ingredients recorded."
                ),
                "formulaId": formula["id"],
            }
        )
        self.save()
        return deepcopy(formula)

    def update_formula(self, formula_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
        base = self._require_formula(formula_id)
        updated = self.build_formula_from_input(input_data, base)

        latest_run_id = base.get("latestRunId")
        latest_run = next((r for r in self.data.get("runs", []) if r.get("id") == latest_run_id), None)
        still_current = False
        if latest_run:
            still_current = (
                latest_run.get("formulaVersion") == updated.get("version")
                and _ingredient_signature(updated.get("ingredients", []))
                == _ingredient_signature(latest_run.get("ingredientSnapshot") or [])
            )

        formula = {
            **updated,
            "screeningStatus": base.get("screeningStatus", "not-screened"),
            "screeningCurrent": still_current if latest_run else False,
            "latestRunId": base.get("latestRunId"),
            "lastScreenedAt": base.get("lastScreenedAt"),
            "reviewStatus": base.get("reviewStatus", "not-started"),
            "createdAt": base.get("createdAt"),
            "originSubmissionId": base.get("originSubmissionId"),
        }

        if latest_run and not still_current:
            for run in self.data.get("runs", []):
                if run.get("formulaId") == formula_id:
                    run["outdated"] = True

        idx = next(i for i, f in enumerate(self.data["formulas"]) if f["id"] == formula_id)
        self.data["formulas"][idx] = formula

        detail = (
            "The composition changed, so the previous screening result is marked outdated until screening runs again."
            if latest_run and not still_current
            else "Formula record updated."
        )
        self._add_activity(
            {
                "type": "formula-updated",
                "summary": f"{formula['name']} updated"
                + (f" to {formula['version']}" if formula.get("version") != base.get("version") else ""),
                "detail": detail,
                "formulaId": formula_id,
            }
        )
        self.save()
        return deepcopy(formula)

    def run_screening(self, formula_id: str) -> dict[str, Any]:
        formula = self._require_formula(formula_id)
        computation = run_llm_screening(
            formula,
            self.data.get("rawMaterials", []),
            self.data.get("documents", []),
            self.data.get("submissions", []),
        )

        run_at = _utc_now()
        evidence = computation["evidence"]
        run = {
            "id": uid("RUN"),
            "formulaId": formula["id"],
            "formulaName": formula["name"],
            "formulaVersion": formula["version"],
            "status": computation["status"],
            "evidenceCompleteness": evidence["completeness"],
            "requiredEvidenceCount": evidence["requiredCount"],
            "presentEvidenceCount": evidence["presentCount"],
            "runAt": run_at,
            "runBy": self._current_user_id(),
            "summary": computation["summary"],
            "findings": computation["findings"],
            "exposureInputs": computation["exposureInputs"],
            "comparisons": computation["comparisons"],
            "nextActions": computation["nextActions"],
            "outdated": False,
            "ingredientSnapshot": _snapshot_ingredients(formula.get("ingredients", [])),
        }

        review_status = formula.get("reviewStatus", "not-started")
        if review_status == "not-started":
            review_status = "in-review"

        for existing in self.data.get("runs", []):
            if existing.get("formulaId") == formula_id:
                existing["outdated"] = True

        self.data.setdefault("runs", []).append(run)

        idx = next(i for i, f in enumerate(self.data["formulas"]) if f["id"] == formula_id)
        self.data["formulas"][idx] = {
            **formula,
            "screeningStatus": computation["status"],
            "screeningCurrent": True,
            "latestRunId": run["id"],
            "lastScreenedAt": run_at,
            "reviewStatus": review_status,
            "updatedAt": run_at,
        }

        self._add_activity(
            {
                "type": "screening-run",
                "summary": f"Screening run completed for {formula['name']} {formula['version']}",
                "detail": (
                    f"Result: {computation['status'].upper()} · "
                    f"evidence completeness {evidence['completeness']}%."
                ),
                "formulaId": formula_id,
                "runId": run["id"],
            }
        )
        self.save()
        return deepcopy(run)
