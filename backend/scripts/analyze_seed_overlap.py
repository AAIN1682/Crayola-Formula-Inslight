"""Report overlap between engine examples, library seed, and materials catalog."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def main() -> None:
    examples = json.loads((DATA / "example_formulas.json").read_text(encoding="utf-8-sig"))
    formulas = json.loads((DATA / "formulas.json").read_text(encoding="utf-8-sig"))
    materials_raw = json.loads((DATA / "materials.json").read_text(encoding="utf-8-sig"))
    ex_ids = {item["input"]["formula_id"] for item in examples}
    lib_ids = {item["id"] for item in formulas}
    if isinstance(materials_raw, list):
        rm_ids = {item.get("material_id") or item.get("id") for item in materials_raw if isinstance(item, dict)}
    else:
        rm_ids = set(materials_raw.get("materials_by_id", {}).keys())
    lib_rm = {
        ing.get("rawMaterialId")
        for f in formulas
        for ing in f.get("ingredients", [])
        if ing.get("rawMaterialId")
    }
    ex_mat = {
        ing.get("material_id")
        for item in examples
        for ing in item.get("input", {}).get("ingredients", [])
    }
    print("example formula_ids", sorted(ex_ids))
    print("library formula_ids count", len(lib_ids))
    print("id overlap", ex_ids & lib_ids)
    print("library rawMaterialIds sample", sorted(list(lib_rm))[:5], "count", len(lib_rm))
    print("example material_ids", sorted(ex_mat))
    print("example mats in materials.json", ex_mat & rm_ids)
    print("library RM in materials.json", lib_rm & rm_ids, "missing", lib_rm - rm_ids)


if __name__ == "__main__":
    main()
