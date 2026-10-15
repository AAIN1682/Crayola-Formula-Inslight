"""Normalized index and typed evaluation for the supplied US/EU threshold files.

Original JSON files are read-only. Null thresholds stay null. Source verification
status is the file's stated status, not an independent check by this application.
"""

from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

from app.config import DATA, composition_tolerance

REFERENCE_FILES = {"US": "us_ 2.json", "EU": "eu_ 2.json"}
LIMITS_FILE = "substance_limits.json"
ALL_REGIONS = "ALL"
TOLERANCE = composition_tolerance()
AGE_TO_SOURCE = {"under_12": "Under_12", "12_and_above": "Age_12_Plus"}
SOURCE_TO_AGE = {value: key for key, value in AGE_TO_SOURCE.items()}
AGE_ALIASES = {
    "under_12": "under_12",
    "under12": "under_12",
    "under_12_years": "under_12",
    "12_and_above": "12_and_above",
    "12_and_over": "12_and_above",
    "12+": "12_and_above",
    "under_12_source": "under_12",
    "age_12_plus": "12_and_above",
}
CATEGORY_ALIASES = {
    "markers": "Markers",
    "washable_marker": "Markers",
    "paints": "Paints",
    "paint": "Paints",
    "crayons": "Crayons",
    "chalk": "Crayons",
    "modeling compounds": "Modeling Compounds",
    "modeling_compound": "Modeling Compounds",
    "modeling_compounds": "Modeling Compounds",
    "future / novelty products": "Future / Novelty Products",
    "future_novelty_products": "Future / Novelty Products",
}
CONCENTRATION_TYPES = {
    "total content limit",
    "state total content limit",
    "regulatory limit",
    "maximum concentration / warning level",
    "labeling trigger concentration (fhsa)",
    "maximum concentration",
    "content limit",
    "total content",
    "clp mixture cut-off",
    "packaging trigger concentration",
}
MIGRATION_TYPES = {"soluble migration limit", "migration limit"}
EXPOSURE_TYPES = {
    "noael",
    "exposure limit",
    "exposure limit (inhalation)",
    "exposure limit (oral)",
    "exposure limit (dnel)",
}
STATUS_TYPES = {"regulatory status", "restriction", "exemption", "certification requirement"}
AMBIGUOUS_TYPES = {"migration / content / emission limit"}
INTENDED_AGES = (
    "under_36_months",
    "age_3_to_under_6",
    "age_6_to_under_12",
    "age_12_to_under_14",
    "age_14_plus",
)
TEST_CATEGORIES = ("en71_cat_i", "en71_cat_ii", "en71_cat_iii")
US_STATES = {"WA": "Washington", "VT": "Vermont", "CA": "California"}


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(text or "").lower()).strip("_")
    return slug[:90] or "item"


def _pointer(parts: list[object]) -> str:
    chunks = []
    for part in parts:
        if isinstance(part, int):
            chunks.append(str(part))
        else:
            chunks.append(str(part).replace("~", "~0").replace("/", "~1"))
    return "/" + "/".join(chunks)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _primary_cas(cas: str | None) -> str | None:
    if not cas or not str(cas).strip():
        return None
    parts = [part.strip() for part in str(cas).split(",") if part.strip()]
    if len(parts) != 1:
        return None
    if re.fullmatch(r"\d{2,7}-\d{2}-\d", parts[0]):
        return parts[0]
    return None


def identity_flags(name: str, cas: str | None) -> list[str]:
    raw = str(name or "").strip()
    upper = raw.upper()
    flags = []
    if re.fullmatch(r"[A-Z0-9]{2,8}", raw) and not _primary_cas(cas):
        flags.append("abbreviation_without_cas")
    if "DNOP" in upper and "HEXYL" in upper:
        flags.append("dnhp_dnop_name_conflict")
    if "DPHP" in upper and "HEXYL" in upper:
        flags.append("dphp_hexyl_name_conflict")
    if cas and "," in str(cas) and "DIISONONYL" not in upper and "DIISODECYL" not in upper:
        flags.append("multiple_cas_numbers")
    return flags


def _name_stem(name: str) -> str:
    base = re.sub(r"\([^)]*\)", " ", str(name or ""))
    return _slug(base)


def substance_id_for(name: str, cas: str | None, flags: list[str]) -> str:
    cas_one = _primary_cas(cas)
    if flags or not cas_one:
        ident = "s_" + _slug(name)
        if cas_one:
            ident += "_" + cas_one.replace("-", "")
        return ident
    return "s_" + _name_stem(name) + "_" + cas_one.replace("-", "")


def _load_roles() -> dict:
    path = DATA / "substance_roles.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_unit(unit: str | None) -> dict:
    raw = None if unit is None else str(unit)
    if not raw or not raw.strip():
        return {"raw_unit": raw, "normalized_unit": None, "quantity": None, "basis": None}
    low = raw.strip().lower().replace("µ", "u")
    if "mg/kg/day" in low or "mg/kg bw/day" in low:
        return {"raw_unit": raw, "normalized_unit": "mg/kg/day", "quantity": "exposure", "basis": "body_weight_day"}
    if "ug/day" in low:
        return {"raw_unit": raw, "normalized_unit": "ug/day", "quantity": "exposure", "basis": "daily_dose"}
    if "plasticis" in low:
        return {"raw_unit": raw, "normalized_unit": "percent", "quantity": "mass_fraction", "basis": "plasticised_material"}
    if "nonvolatile" in low or "dried paint" in low:
        return {"raw_unit": raw, "normalized_unit": "percent", "quantity": "mass_fraction", "basis": "dried_film_or_nonvolatile"}
    if "by weight of the paint" in low or low.endswith("of the paint"):
        return {"raw_unit": raw, "normalized_unit": "percent", "quantity": "mass_fraction", "basis": "paint_weight"}
    if "as tin" in low or "of tin" in low:
        return {"raw_unit": raw, "normalized_unit": "percent", "quantity": "elemental_mass_fraction", "basis": "elemental_tin"}
    if low in {"%", "% by weight"}:
        return {"raw_unit": raw, "normalized_unit": "percent", "quantity": "mass_fraction", "basis": "stated_weight"}
    if low == "ppm":
        return {"raw_unit": raw, "normalized_unit": "ppm", "quantity": "mass_fraction", "basis": "total_content"}
    if low == "mg/kg" or low.startswith("mg/kg"):
        return {"raw_unit": raw, "normalized_unit": "mg/kg", "quantity": "mass_per_mass", "basis": "unspecified_mg_kg"}
    if "mg/l" in low:
        return {"raw_unit": raw, "normalized_unit": "mg/l", "quantity": "migration", "basis": "migration_liquid"}
    if "ml/m3" in low:
        return {"raw_unit": raw, "normalized_unit": "ml/m3", "quantity": "emission", "basis": "emission"}
    return {"raw_unit": raw, "normalized_unit": raw, "quantity": "unknown", "basis": "unknown"}


def _operator(limit_text: str | None) -> tuple[str | None, str, str | None]:
    """Return operator, source, and polarity.

    Trigger polarity means the stated comparison is the condition that fails the check
    (more than, or more, in excess of). Ceiling polarity means the stated comparison
    is the passing condition (less than, not exceed).
    """
    text = str(limit_text or "").lower().replace("≥", ">=").replace("≤", "<=").replace(",", ".")
    if "equal to or greater" in text or "or more" in text or "or greater" in text:
        return ">=", "limit_text", "trigger"
    if "greater than" in text or "more than" in text or "in excess of" in text:
        return ">", "limit_text", "trigger"
    if "less than or equal" in text or "not exceed" in text or "does not exceed" in text or "no more than" in text:
        return "<=", "limit_text", "ceiling"
    if "less than" in text or "below " in text:
        return "<", "limit_text", "ceiling"
    if ">=" in text:
        return ">=", "limit_text", "trigger"
    if "<=" in text:
        return "<=", "limit_text", "ceiling"
    if re.search(r"(?<![<=>])>(?!=)", text):
        return ">", "limit_text", "trigger"
    if re.search(r"(?<![<=>])<(?!=)", text):
        return "<", "limit_text", "ceiling"
    return None, "unresolved", None


def _route(threshold_type: str | None, unit_info: dict) -> str:
    kind = str(threshold_type or "").strip().lower()
    if kind in STATUS_TYPES:
        return "status_text"
    if kind in AMBIGUOUS_TYPES or unit_info.get("quantity") == "emission":
        return "ambiguous"
    if kind in EXPOSURE_TYPES or unit_info.get("quantity") == "exposure":
        return "exposure"
    if kind in MIGRATION_TYPES or "migration" in kind:
        return "migration"
    if kind in CONCENTRATION_TYPES:
        return "concentration"
    if unit_info.get("quantity") == "mass_fraction":
        return "concentration"
    return "ambiguous"


def _state_code(rule: dict) -> str | None:
    blob = " ".join([
        str(rule.get("appliesTo") or ""),
        str(rule.get("limitText") or ""),
        str(rule.get("regulation") or ""),
        str(rule.get("thresholdType") or ""),
    ]).lower()
    if "washington" in blob or "rcw 70.240" in blob:
        return "WA"
    if "vermont" in blob or "v.s.a" in blob:
        return "VT"
    if "california" in blob or "carb" in blob:
        return "CA"
    if "state total content" in blob and "washington" not in blob and "vermont" not in blob:
        return None
    return None


def _test_category(applies_to: str | None) -> str | None:
    text = str(applies_to or "")
    found = []
    if re.search(r"Category I\b", text) and "Category II" not in text and "Category III" not in text:
        found.append("en71_cat_i")
    if re.search(r"Category II\b", text) and "Category I" not in text and "Category III" not in text:
        found.append("en71_cat_ii")
    if re.search(r"Category III\b", text) and "Category I" not in text and "Category II" not in text:
        found.append("en71_cat_iii")
    if len(found) == 1:
        return found[0]
    return None


def _combination(limit_text: str | None, applies_to: str | None) -> bool:
    blob = f"{limit_text or ''} {applies_to or ''}".lower()
    if "not sum" in blob or "individual phthalate, not sum" in blob:
        return False
    return "in combination" in blob or "combined" in blob or "sum of" in blob


def _is_elemental_on_compound(name: str, rule: dict, roles: dict, unit_info: dict | None = None, route: str | None = None) -> bool:
    low_name = str(name or "").lower()
    if not any(marker in low_name for marker in roles.get("compound_markers") or []):
        return False
    blob = f"{rule.get('limitText') or ''} {rule.get('appliesTo') or ''}".lower()
    if "calculated as" in blob or "lead metal" in blob or "lead content" in blob:
        return True
    for element in roles.get("element_analytes") or []:
        if element in blob and "content" in blob and element in low_name:
            return True
    # A ppm or mg/kg content limit stored on a compound or pigment is not a compound percentage.
    if route == "concentration" and (unit_info or {}).get("normalized_unit") in {"ppm", "mg/kg"}:
        return True
    return False


def _apply_use_case_thresholds(substances: dict, entries: list[dict], rules: list[dict], roles: dict) -> dict:
    """Add screening ceilings for ordinary paint ingredients the reference files do not evaluate."""
    path = DATA / "use_case_thresholds.json"
    if not path.is_file():
        return {"rows": [], "sha256": ""}
    payload = json.loads(path.read_text(encoding="utf-8"))
    digest = _sha256(path)
    type_roles = roles.get("composition_type_roles") or {}
    rows = []
    for item in payload.get("ingredients") or []:
        substance_id = str(item.get("substance_id") or "").strip()
        if not substance_id:
            continue
        regions = [normalize_region(str(region)) for region in item.get("regions") or ["US"]]
        categories = list(item.get("categories") or ["Paints"])
        ages = [normalize_age(str(age)) for age in item.get("age_groups") or ["under_12"]]
        try:
            threshold = float(item["threshold_value"])
        except (KeyError, TypeError, ValueError):
            continue
        operator = str(item.get("operator") or "<=")
        polarity = str(item.get("operator_polarity") or "ceiling")
        unit = str(item.get("threshold_unit") or "%")
        if item.get("patch_existing"):
            patched = False
            for rule in rules:
                if rule.get("duplicate_of") or rule.get("state_code"):
                    continue
                if rule.get("substance_id") != substance_id:
                    continue
                if rule.get("region") not in regions or rule.get("category_name") not in categories or rule.get("age_group") not in ages:
                    continue
                if rule.get("route") != "concentration":
                    continue
                if rule.get("threshold_value") is None:
                    continue
                if abs(float(rule["threshold_value"]) - threshold) > 0.001:
                    continue
                rule["operator"] = operator
                rule["operator_source"] = "use_case_threshold"
                rule["operator_polarity"] = polarity
                rule["verification_status"] = "Verified"
                rule["limit_text"] = item.get("limit_text") or rule.get("limit_text")
                rule["regulation"] = item.get("regulation") or rule.get("regulation")
                rule["applies_to"] = item.get("applies_to") or rule.get("applies_to")
                rule["source_filename"] = path.name
                patched = True
                rows.append(_use_case_row(item, rule["rule_id"], rule["region"], rule["category_name"], rule["age_group"]))
            if patched:
                continue
        name = str(item.get("substance") or substance_id)
        composition_type = item.get("composition_type") or "Additives"
        record = substances.setdefault(substance_id, {
            "substance_id": substance_id,
            "name": name,
            "cas_number": item.get("cas_number"),
            "names": [],
            "regions": [],
            "composition_types": [],
            "identity_flags": [],
            "role": None,
            "approved_recipe_ingredient": False,
        })
        if name not in record["names"]:
            record["names"].append(name)
        if composition_type not in record["composition_types"]:
            record["composition_types"].append(composition_type)
        role = type_roles.get(composition_type) or "formulation_ingredient"
        record["role"] = role
        record["role_label"] = {
            "formulation_ingredient": "Formulation ingredient",
            "contaminant_analyte": "Contaminant / laboratory analyte",
            "role_requires_review": "Role requires review",
        }.get(role, "Formulation ingredient")
        record["approved_recipe_ingredient"] = False
        for region in regions:
            if region not in record["regions"]:
                record["regions"].append(region)
            for category_name in categories:
                for age in ages:
                    source_age = AGE_TO_SOURCE.get(age, age)
                    entries.append({
                        "entry_id": f"usecase:{region.lower()}:{_slug(category_name)}:{source_age}:{substance_id}",
                        "substance_id": substance_id,
                        "region": region,
                        "category_name": category_name,
                        "category_id": _slug(category_name),
                        "age_group": age,
                        "source_age_group": source_age,
                        "composition_type": composition_type,
                        "source_filename": path.name,
                        "json_pointer": f"/use_case/{substance_id}",
                        "original": {
                            "substance": name,
                            "casNumber": item.get("cas_number"),
                            "compositionType": composition_type,
                            "maximumRecommendedUsageLevel": threshold,
                            "unit": unit,
                            "hasThreshold": True,
                            "dataAvailability": "Use-case screening threshold",
                        },
                    })
                    rule_id = f"usecase:{region.lower()}:{_slug(category_name)}:{age}:{substance_id}"
                    rules.append({
                        "rule_id": rule_id,
                        "substance_id": substance_id,
                        "region": region,
                        "category_name": category_name,
                        "age_group": age,
                        "source_age_group": source_age,
                        "composition_type": composition_type,
                        "source_filename": path.name,
                        "source_sha256": digest,
                        "json_pointer": f"/use_case/{substance_id}",
                        "threshold_type": "maximum concentration",
                        "threshold_value": threshold,
                        "threshold_unit": unit,
                        "normalized_unit": "percent",
                        "quantity": "mass_fraction",
                        "basis": "stated_weight",
                        "operator": operator,
                        "operator_source": "use_case_threshold",
                        "operator_polarity": polarity,
                        "route": "concentration",
                        "regulation": item.get("regulation"),
                        "applies_to": item.get("applies_to"),
                        "limit_text": item.get("limit_text"),
                        "verification_status": "Verified",
                        "source_url": None,
                        "section": None,
                        "state_code": None,
                        "test_category": None,
                        "combination": False,
                        "elemental_on_compound": False,
                        "contradictory": False,
                        "duplicate_of": None,
                    })
                    rows.append(_use_case_row(item, rule_id, region, category_name, age))
    return {"rows": rows, "sha256": digest}


def _use_case_row(item: dict, rule_id: str, region: str, category_name: str, age: str) -> dict:
    return {
        "rule_id": rule_id,
        "substance_id": item.get("substance_id"),
        "substance": item.get("substance"),
        "region": region,
        "category_name": category_name,
        "age_group": age,
        "threshold_value": item.get("threshold_value"),
        "threshold_unit": item.get("threshold_unit") or "%",
        "operator": item.get("operator") or "<=",
        "limit_text": item.get("limit_text"),
        "regulation": item.get("regulation"),
        "provenance": "use_case_threshold",
    }


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    roles = _load_roles()
    substances: dict[str, dict] = {}
    entries: list[dict] = []
    rules: list[dict] = []
    issues: list[dict] = []
    files = []
    categories: dict[str, dict] = {}
    for region, filename in REFERENCE_FILES.items():
        path = DATA / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        digest = _sha256(path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        summary = payload.get("verificationSummary") or {}
        files.append({
            "region": region,
            "filename": filename,
            "sha256": digest,
            "audit_date": summary.get("auditDate"),
            "verification_status_key": summary.get("statusKey") or {},
        })
        for category_index, category in enumerate(payload.get("productCategories") or []):
            category_name = category.get("categoryName")
            categories.setdefault(category_name, {"category_id": _slug(category_name), "category_name": category_name})
            for age_index, age_group in enumerate(category.get("ageGroups") or []):
                source_age = age_group.get("ageGroup")
                internal_age = SOURCE_TO_AGE.get(source_age)
                for substance_index, row in enumerate(age_group.get("composition") or []):
                    name = str(row.get("substance") or "").strip()
                    cas = row.get("casNumber")
                    flags = identity_flags(name, cas)
                    substance_id = substance_id_for(name, cas, flags)
                    pointer = _pointer(["productCategories", category_index, "ageGroups", age_index, "composition", substance_index])
                    record = substances.setdefault(substance_id, {
                        "substance_id": substance_id,
                        "name": name,
                        "cas_number": cas if cas else None,
                        "names": [],
                        "regions": [],
                        "composition_types": [],
                        "identity_flags": [],
                        "role": None,
                        "approved_recipe_ingredient": False,
                    })
                    if name not in record["names"]:
                        record["names"].append(name)
                    if len(name) > len(record["name"]):
                        record["name"] = name
                    if region not in record["regions"]:
                        record["regions"].append(region)
                    composition_type = row.get("compositionType")
                    if composition_type and composition_type not in record["composition_types"]:
                        record["composition_types"].append(composition_type)
                    for flag in flags:
                        if flag not in record["identity_flags"]:
                            record["identity_flags"].append(flag)
                    entry = {
                        "entry_id": f"{region.lower()}:{_slug(category_name)}:{source_age}:{substance_index}",
                        "substance_id": substance_id,
                        "region": region,
                        "category_name": category_name,
                        "category_id": _slug(category_name),
                        "age_group": internal_age,
                        "source_age_group": source_age,
                        "composition_type": composition_type,
                        "source_filename": filename,
                        "json_pointer": pointer,
                        "original": {
                            "substance": name,
                            "casNumber": cas,
                            "compositionType": composition_type,
                            "typicalCompositionRange": row.get("typicalCompositionRange"),
                            "maximumRecommendedUsageLevel": row.get("maximumRecommendedUsageLevel"),
                            "unit": row.get("unit"),
                            "hasThreshold": row.get("hasThreshold"),
                            "dataAvailability": row.get("dataAvailability"),
                        },
                    }
                    entries.append(entry)
                    if flags:
                        issues.append({
                            "issue_id": f"ID:{substance_id}:{region}:{_slug(category_name)}:{source_age}",
                            "kind": "identity_inconsistency",
                            "substance_id": substance_id,
                            "region": region,
                            "json_pointer": pointer,
                            "source_filename": filename,
                            "message": f"{name} has an unresolved identity flag ({', '.join(flags)}). It is not merged using the abbreviation.",
                        })
                    for rule_index, raw_rule in enumerate(row.get("regulatoryLimits") or []):
                        unit_info = _normalize_unit(raw_rule.get("thresholdUnit"))
                        operator, operator_source, operator_polarity = _operator(raw_rule.get("limitText"))
                        route = _route(raw_rule.get("thresholdType"), unit_info)
                        rule_pointer = pointer + "/regulatoryLimits/" + str(rule_index)
                        value = raw_rule.get("thresholdValue")
                        if value is not None:
                            try:
                                value = float(value)
                            except (TypeError, ValueError):
                                value = None
                        rule = {
                            "rule_id": f"{region.lower()}:{category_index}:{age_index}:{substance_index}:{rule_index}",
                            "substance_id": substance_id,
                            "region": region,
                            "category_name": category_name,
                            "age_group": internal_age,
                            "source_age_group": source_age,
                            "composition_type": composition_type,
                            "source_filename": filename,
                            "source_sha256": digest,
                            "json_pointer": rule_pointer,
                            "threshold_type": raw_rule.get("thresholdType"),
                            "threshold_value": value,
                            "threshold_unit": raw_rule.get("thresholdUnit"),
                            "normalized_unit": unit_info["normalized_unit"],
                            "quantity": unit_info["quantity"],
                            "basis": unit_info["basis"],
                            "operator": operator,
                            "operator_source": operator_source,
                            "operator_polarity": operator_polarity,
                            "route": route,
                            "regulation": raw_rule.get("regulation"),
                            "applies_to": raw_rule.get("appliesTo"),
                            "limit_text": raw_rule.get("limitText"),
                            "verification_status": raw_rule.get("verificationStatus"),
                            "source_url": raw_rule.get("sourceUrl"),
                            "section": raw_rule.get("section"),
                            "state_code": _state_code(raw_rule),
                            "test_category": _test_category(raw_rule.get("appliesTo")),
                            "combination": _combination(raw_rule.get("limitText"), raw_rule.get("appliesTo")),
                            "elemental_on_compound": _is_elemental_on_compound(name, raw_rule, roles, unit_info, route),
                            "contradictory": False,
                            "duplicate_of": None,
                        }
                        rules.append(rule)
    _mark_chromium_conflicts(rules, issues)
    _dedupe_rules(rules, issues)
    _assign_roles(substances, entries, rules, roles)
    use_case = _apply_use_case_thresholds(substances, entries, rules, roles)
    version_hash = hashlib.sha256("".join(item["sha256"] for item in files).encode("utf-8")).hexdigest()
    if use_case.get("sha256"):
        version_hash = hashlib.sha256((version_hash + use_case["sha256"]).encode("utf-8")).hexdigest()
    audit = "-".join(str(item.get("audit_date") or "undated") for item in files)
    return {
        "dataset_version": f"us-eu-thresholds-{audit}-{version_hash[:12]}",
        "dataset_kind": "threshold_reference",
        "source_files": files,
        "data_hash": version_hash,
        "categories": list(categories.values()),
        "substances": substances,
        "entries": entries,
        "rules": rules,
        "issues": issues,
        "catalog_coverage_incomplete": True,
        "coverage_note": (
            "Catalog coverage incomplete. These files list restricted substances, impurities, and test analytes. "
            "They do not contain enough ordinary ingredients to describe a full recipe. "
            "A submission is a partial substance screening unless the user explicitly declares a complete ingredient list totaling 100%."
        ),
        "role_mapping_version": roles.get("mapping_version"),
        "use_case_thresholds": use_case.get("rows") or [],
    }


def _mark_chromium_conflicts(rules: list[dict], issues: list[dict]) -> None:
    grouped: dict[tuple, list[dict]] = {}
    for rule in rules:
        if rule["route"] != "migration" or rule["threshold_value"] is None:
            continue
        substance = rule["substance_id"]
        if "chromium" not in substance:
            continue
        key = (
            rule["region"],
            rule["category_name"],
            rule["age_group"],
            rule["threshold_type"],
            round(float(rule["threshold_value"]), 6),
            rule["threshold_unit"],
        )
        grouped.setdefault(key, []).append(rule)
    species = {}
    catalog = None
    for rule in rules:
        if "chromium" in rule["substance_id"]:
            species.setdefault(rule["substance_id"], rule["substance_id"])
    for key, group in grouped.items():
        ids = {rule["substance_id"] for rule in group}
        if len(ids) < 2:
            continue
        if not any(item.endswith("16065831") or "chromium_iii" in item or item == "s_chromium_16065831" for item in ids):
            # Keep species separate: overlap is only when both Cr(III) and Cr(VI) share the value.
            pass
        iii = [item for item in ids if item.endswith("16065831")]
        vi = [item for item in ids if item.endswith("18540299")]
        if not iii or not vi:
            continue
        for rule in group:
            rule["contradictory"] = True
        issues.append({
            "issue_id": "CR-OVERLAP:" + ":".join(str(part) for part in key),
            "kind": "chromium_species_overlap",
            "json_pointer": group[0]["json_pointer"],
            "source_filename": group[0]["source_filename"],
            "region": key[0],
            "message": (
                "Chromium (III) and Chromium (VI) share this migration threshold in the source file. "
                "The species stay separate and the overlapping value is not applied to either species."
            ),
            "rule_ids": [rule["rule_id"] for rule in group],
            "pointers": [rule["json_pointer"] for rule in group],
        })
    del catalog


def _dedupe_rules(rules: list[dict], issues: list[dict]) -> None:
    seen: dict[tuple, dict] = {}
    for rule in rules:
        key = (
            rule["substance_id"],
            rule["region"],
            rule["category_name"],
            rule["age_group"],
            rule["threshold_type"],
            rule["threshold_value"],
            rule["threshold_unit"],
            rule["operator"],
            rule["applies_to"],
            rule["regulation"],
            rule["route"],
            rule["state_code"],
            rule["test_category"],
        )
        prior = seen.get(key)
        if prior is None:
            seen[key] = rule
            continue
        rule["duplicate_of"] = prior["rule_id"]
        issues.append({
            "issue_id": f"DUP:{rule['rule_id']}",
            "kind": "duplicate_rule",
            "json_pointer": rule["json_pointer"],
            "source_filename": rule["source_filename"],
            "message": f"Rule {rule['rule_id']} repeats {prior['rule_id']} with the same scope, operator, and analyte.",
            "rule_ids": [prior["rule_id"], rule["rule_id"]],
        })


def _assign_roles(substances: dict, entries: list[dict], rules: list[dict], roles: dict) -> None:
    type_roles = roles.get("composition_type_roles") or {}
    elements = set(roles.get("element_analytes") or [])
    elemental_ids = {rule["substance_id"] for rule in rules if rule.get("elemental_on_compound")}
    conflict_ids = {rule["substance_id"] for rule in rules if rule.get("contradictory")}
    for substance_id, record in substances.items():
        types = record["composition_types"]
        mapped = [type_roles.get(item) for item in types if type_roles.get(item)]
        stem = _name_stem(record["name"])
        element_like = stem in elements or stem.split("_")[0] in elements
        if record["identity_flags"] or substance_id in elemental_ids or substance_id in conflict_ids:
            role = "role_requires_review"
        elif element_like or "Heavy Metals" in types:
            role = "contaminant_analyte"
        elif mapped and len(set(mapped)) == 1:
            role = mapped[0]
        else:
            role = "role_requires_review"
        record["role"] = role
        record["role_label"] = {
            "formulation_ingredient": "Formulation ingredient",
            "contaminant_analyte": "Contaminant / laboratory analyte",
            "role_requires_review": "Role requires review",
        }[role]
        record["approved_recipe_ingredient"] = False


def catalog_public() -> dict:
    catalog = load_catalog()
    return {
        "dataset_version": catalog["dataset_version"],
        "dataset_kind": catalog["dataset_kind"],
        "data_hash": catalog["data_hash"],
        "source_files": [
            {"region": item["region"], "filename": item["filename"], "sha256": item["sha256"], "audit_date": item["audit_date"]}
            for item in catalog["source_files"]
        ],
        "regions": ["US", "EU"],
        "categories": catalog["categories"],
        "age_groups": [
            {"id": "under_12", "source_value": "Under_12", "label": "Under 12"},
            {"id": "12_and_above", "source_value": "Age_12_Plus", "label": "12 and above"},
        ],
        "us_states": [{"id": key, "label": value} for key, value in US_STATES.items()],
        "intended_age_details": list(INTENDED_AGES),
        "test_material_categories": list(TEST_CATEGORIES),
        "toy_childcare_scopes": ["yes", "no", "unknown"],
        "component_types": ["finished_formula", "plasticised_material", "substrate", "surface_coating", "dried_film"],
        "catalog_coverage_incomplete": True,
        "coverage_note": catalog["coverage_note"],
        "role_mapping_version": catalog["role_mapping_version"],
        "full_formula_assessment_available": False,
    }


def normalize_region(value: str) -> str:
    text = str(value or "").strip()
    aliases = {"usa": "US", "united_states": "US", "europe": "EU", "european_union": "EU"}
    return aliases.get(text.lower(), text)


def normalize_age(value: str) -> str:
    text = str(value or "").strip()
    mapped = AGE_ALIASES.get(text.lower().replace(" ", "_"), text)
    if text in SOURCE_TO_AGE:
        return SOURCE_TO_AGE[text]
    return mapped


def normalize_category(value: str) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    names = {item["category_name"] for item in load_catalog()["categories"]}
    if text in names:
        return text
    return CATEGORY_ALIASES.get(text.lower())


def material_types(regions: list[str], category: str, age_group: str) -> list[str]:
    catalog = load_catalog()
    found = []
    for entry in catalog["entries"]:
        if entry["region"] not in regions:
            continue
        if entry["category_name"] != category or entry["age_group"] != age_group:
            continue
        if entry["composition_type"] and entry["composition_type"] not in found:
            found.append(entry["composition_type"])
    return found


def substances_for(regions: list[str], category: str, age_group: str, composition_type: str | None = None) -> list[dict]:
    catalog = load_catalog()
    by_id: dict[str, dict] = {}
    for entry in catalog["entries"]:
        if entry["region"] not in regions or entry["category_name"] != category or entry["age_group"] != age_group:
            continue
        if composition_type and entry["composition_type"] != composition_type:
            continue
        substance = catalog["substances"][entry["substance_id"]]
        row = by_id.setdefault(entry["substance_id"], {
            "substance_id": substance["substance_id"],
            "name": substance["name"],
            "cas_number": substance["cas_number"],
            "label": substance["name"] + (f" — {substance['cas_number']}" if substance.get("cas_number") else ""),
            "role": substance["role"],
            "role_label": substance["role_label"],
            "approved_recipe_ingredient": False,
            "regions": [],
            "composition_types": [],
            "identity_flags": substance["identity_flags"],
        })
        if entry["region"] not in row["regions"]:
            row["regions"].append(entry["region"])
        if entry["composition_type"] not in row["composition_types"]:
            row["composition_types"].append(entry["composition_type"])
    rows = list(by_id.values())
    rows.sort(key=lambda item: item["label"].lower())
    return rows


def _fmt(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.10f}".rstrip("0").rstrip(".")


def validate_threshold_formula(formula: dict) -> list[dict]:
    catalog = load_catalog()
    errors = []
    formula["assessment_mode"] = "evidence"
    formula["age_group"] = normalize_age(str(formula.get("age_group") or ""))
    formula["product_category"] = normalize_category(str(formula.get("product_category") or "")) or formula.get("product_category")
    if isinstance(formula.get("regions"), list):
        formula["regions"] = [normalize_region(str(item)) for item in formula["regions"]]
    if formula.get("age_group") not in AGE_TO_SOURCE:
        errors.append({"loc": ["age_group"], "msg": "Choose Under 12 or 12 and above.", "type": "value_error"})
    category = formula.get("product_category")
    names = {item["category_name"] for item in catalog["categories"]}
    regions = formula.get("regions")
    if not isinstance(regions, list) or not regions:
        errors.append({"loc": ["regions"], "msg": "Select at least one of US or EU.", "type": "missing"})
    elif any(region not in {"US", "EU"} for region in regions) or len(regions) != len(set(regions)):
        errors.append({"loc": ["regions"], "msg": "This workflow supports US and EU only.", "type": "value_error"})
    ingredients = formula.get("ingredients") if isinstance(formula.get("ingredients"), list) else []
    legacy = formula.get("legacy_materials") if isinstance(formula.get("legacy_materials"), list) else []
    formula["ingredients"] = ingredients
    formula["legacy_materials"] = legacy
    if not ingredients and not legacy:
        errors.append({"loc": ["ingredients"], "msg": "Add at least one catalog substance or an unmatched row to record as a coverage gap.", "type": "missing"})
        return errors
    formula["category_supported"] = bool(category and category in names)
    if not formula["category_supported"] and ingredients:
        errors.append({"loc": ["product_category"], "msg": "Choose a category from the US/EU reference files.", "type": "value_error"})
    if not formula["category_supported"] or formula.get("age_group") not in AGE_TO_SOURCE or not isinstance(regions, list):
        return errors
    allowed = {item["substance_id"]: item for item in substances_for(regions, category, formula["age_group"])}
    seen = set()
    ingredient_total = 0.0
    saw_amount = True
    for index, row in enumerate(ingredients):
        material_id = row.get("material_id")
        substance = allowed.get(material_id) or catalog["substances"].get(material_id)
        if material_id not in allowed:
            errors.append({
                "loc": ["ingredients", index, "material_id"],
                "msg": f"'{material_id}' is not in the selected category, age group, and region branch. It was not replaced.",
                "type": "value_error",
            })
            saw_amount = False
            continue
        if material_id in seen:
            errors.append({
                "loc": ["ingredients", index, "material_id"],
                "msg": f"{material_id} is listed more than once. Combine it into one row.",
                "type": "value_error",
            })
        seen.add(material_id)
        role = substance["role"]
        row["role"] = role
        amount = row.get("concentration_percent")
        if role == "contaminant_analyte":
            continue
        if amount is None:
            if role == "formulation_ingredient":
                errors.append({
                    "loc": ["ingredients", index, "concentration_percent"],
                    "msg": f"Row {index + 1} needs a numeric concentration.",
                    "type": "value_error",
                })
                saw_amount = False
            continue
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            errors.append({
                "loc": ["ingredients", index, "concentration_percent"],
                "msg": f"Row {index + 1} needs a numeric concentration.",
                "type": "value_error",
            })
            saw_amount = False
            continue
        if amount <= 0 or amount > 100:
            errors.append({
                "loc": ["ingredients", index, "concentration_percent"],
                "msg": f"Row {index + 1} needs a percentage greater than 0 and at most 100.",
                "type": "value_error",
            })
            saw_amount = False
        elif role == "formulation_ingredient":
            ingredient_total += amount
    completeness = str(formula.get("composition_completeness") or "partial")
    if completeness not in {"partial", "complete"}:
        errors.append({"loc": ["composition_completeness"], "msg": "Composition completeness must be partial or complete.", "type": "value_error"})
    elif completeness == "complete" and saw_amount and abs(ingredient_total - 100) > TOLERANCE:
        errors.append({
            "loc": ["ingredients"],
            "msg": f"Declared formulation ingredients total {_fmt(round(ingredient_total, 4))}%. A complete formula must total 100% within {TOLERANCE} percentage points. Contaminant rows are not included.",
            "type": "value_error",
        })
    return errors


def load_substance_limits() -> dict:
    """Read on every assessment so edits to the file apply without a restart."""
    path = DATA / LIMITS_FILE
    payload = json.loads(path.read_text(encoding="utf-8"))
    by_id = {}
    for item in payload.get("substances") or []:
        substance_id = str(item.get("substance_id") or "").strip()
        if substance_id:
            by_id[substance_id] = item
    return {"filename": path.name, "by_id": by_id}


def _limit_value(limit: dict | None) -> float | None:
    if not limit or limit.get("max_percent") is None:
        return None
    try:
        return float(limit["max_percent"])
    except (TypeError, ValueError):
        return None


def _limit_check(row: dict, substance: dict, limit: dict | None) -> dict:
    material_id = row["material_id"]
    name = substance["name"]
    threshold = _limit_value(limit)
    actual = row.get("concentration_percent")
    check = {
        "check_id": f"LIMIT:{material_id}",
        "material_id": material_id,
        "region": ALL_REGIONS,
        "rule_id": f"limit:{material_id}" if threshold is not None else None,
        "actual": actual,
        "threshold": threshold,
        "unit": "%",
        "basis": "stated_weight",
        "operator": "<=",
        "route": "concentration",
        "check_kind": "concentration",
        "verification_status": "Verified" if threshold is not None else None,
        "source_filename": LIMITS_FILE,
        "verified_limit_available": False,
        "priority": "medium",
    }
    if threshold is None:
        return {
            **check,
            "status": "no_matching_rule",
            "reason_code": "no_limit_set",
            "message": f"No limit is set for {name} in {LIMITS_FILE}.",
            "action": f"Add a max_percent for {name} in {LIMITS_FILE} to screen its concentration.",
        }
    try:
        actual = float(actual)
    except (TypeError, ValueError):
        return {
            **check,
            "status": "needs_test_data",
            "reason_code": "needs_test_data",
            "message": f"No concentration is entered for {name}.",
            "action": f"Enter the {name} concentration to compare it with the {_fmt(threshold)}% limit.",
        }
    passed = actual <= threshold
    return {
        **check,
        "status": "pass" if passed else "fail",
        "actual": actual,
        "verified_limit_available": True,
        "priority": "medium" if passed else "high",
        "reason_code": "pass" if passed else "fail",
        "message": (
            f"{_fmt(actual)}% compared with the {_fmt(threshold)}% limit. "
            + ("Within the limit." if passed else "Above the limit.")
        ),
        "action": (
            "No concentration change is needed for this limit."
            if passed
            else f"Reduce {name} to {_fmt(threshold)}% or less and rerun the screening."
        ),
    }


def _limit_rule(substance: dict, limit: dict) -> dict:
    threshold = _limit_value(limit)
    return {
        "rule_id": f"limit:{substance['substance_id']}",
        "substance_id": substance["substance_id"],
        "region": ALL_REGIONS,
        "threshold_type": "maximum concentration",
        "threshold_value": threshold,
        "threshold_unit": "%",
        "normalized_unit": "percent",
        "basis": "stated_weight",
        "operator": "<=",
        "route": "concentration",
        "regulation": "Substance screening limit",
        "applies_to": "All regions, categories, and age groups",
        "limit_text": f"No more than {_fmt(threshold)}% {substance['name']} in the finished formula.",
        "verification_status": "Verified",
        "source_url": None,
        "section": None,
        "json_pointer": f"/substances/{substance['substance_id']}",
        "source_filename": LIMITS_FILE,
        "state_code": None,
    }


def _legacy_checks(formula: dict, regions: list[str], category: str, calculated: list[dict]) -> None:
    del regions
    supported = formula.get("category_supported", True)
    for index, item in enumerate(formula.get("legacy_materials") or []):
        label = str(item.get("name") or "Unnamed ingredient")
        legacy_id = str(item.get("legacy_id") or f"row-{index + 1}")
        category_note = "" if supported else f" {category} is not a category in the US/EU reference files."
        calculated.append({
            "check_id": f"legacy:{legacy_id}:{index}",
            "material_id": legacy_id,
            "region": ALL_REGIONS,
            "rule_id": None,
            "status": "no_matching_rule",
            "actual": item.get("concentration_percent"),
            "threshold": None,
            "unit": None,
            "basis": None,
            "verified_limit_available": False,
            "priority": "medium",
            "reason_code": "unmatched_identity",
            "message": (
                f"{label} is not in the selected category, age group, and region branch.{category_note} "
                "The name was not matched to a catalog substance."
            ),
            "action": "Select a substance from that catalog branch. This row is kept as a coverage gap.",
            "check_kind": "identity",
        })


def build_threshold_context(formula: dict, version_changes: list | None = None) -> dict:
    from app.uploads import documents_for_formula

    errors = validate_threshold_formula(formula)
    if errors:
        raise ValueError(errors)
    catalog = load_catalog()
    limits = load_substance_limits()
    regions = list(dict.fromkeys(formula["regions"]))
    category = formula["product_category"]
    age = formula["age_group"]
    calculated = []
    applicable_rules = []
    limit_rows = []
    if formula.get("category_supported", True):
        for row in formula["ingredients"]:
            substance = catalog["substances"][row["material_id"]]
            limit = limits["by_id"].get(row["material_id"])
            check = _limit_check(row, substance, limit)
            calculated.append(check)
            if limit:
                limit_rows.append(limit)
            if check["status"] in {"pass", "fail"}:
                applicable_rules.append(_limit_rule(substance, limit))
    _legacy_checks(formula, regions, category, calculated)
    documents = documents_for_formula(formula)
    evidence_checks, evidence_matches, missing_evidence = _evidence(formula, documents, catalog)
    substance_ids = {row["material_id"] for row in formula["ingredients"]}
    issues = [
        issue for issue in catalog["issues"]
        if issue.get("kind") == "identity_inconsistency" and issue.get("substance_id") in substance_ids
    ]
    excerpts = _excerpts(documents, formula, catalog)
    ingredient_total = round(sum(
        float(row["concentration_percent"])
        for row in formula["ingredients"]
        if catalog["substances"][row["material_id"]]["role"] == "formulation_ingredient" and row.get("concentration_percent") is not None
    ), 4)
    partial = formula.get("composition_completeness", "partial") != "complete"
    limitations = [
        catalog["coverage_note"],
        f"Concentration limits come only from {limits['filename']}: one limit per substance, the same for every region, category, and age group.",
        "Partial composition." if partial else f"The declared formulation ingredients total 100% within ±{TOLERANCE} percentage points. This is still not an approved-recipe or full regulatory certification.",
    ]
    public_formula = {
        "formula_id": formula.get("formula_id"),
        "version_id": formula.get("version_id"),
        "name": formula.get("name"),
        "product_category": category,
        "age_group": age,
        "regions": regions,
        "physical_form": formula.get("physical_form"),
        "intended_use": formula.get("intended_use"),
        "assessment_mode": "evidence",
        "composition_completeness": "partial" if partial else "complete",
        "partial_composition": partial,
        "catalog_coverage_incomplete": True,
        "composition_total_percent": ingredient_total,
        "us_states": formula.get("us_states") or [],
        "intended_age_detail": formula.get("intended_age_detail"),
        "toy_childcare_scope": formula.get("toy_childcare_scope"),
        "component_type": formula.get("component_type"),
        "test_material_category": formula.get("test_material_category"),
        "ingredients": [
            {
                "material_id": row["material_id"],
                "name": catalog["substances"][row["material_id"]]["name"],
                "concentration_percent": row.get("concentration_percent"),
                "batch_id": row.get("batch_id"),
                "supplier": row.get("supplier"),
                "grade": row.get("grade"),
                "role": catalog["substances"][row["material_id"]]["role"],
                "role_label": catalog["substances"][row["material_id"]]["role_label"],
                "cas": catalog["substances"][row["material_id"]].get("cas_number"),
                "counts_toward_ingredient_total": catalog["substances"][row["material_id"]]["role"] == "formulation_ingredient",
            }
            for row in formula["ingredients"]
        ] + [
            {
                "material_id": item.get("legacy_id") or item.get("name"),
                "name": item.get("name"),
                "concentration_percent": item.get("concentration_percent"),
                "role": "unmatched",
                "role_label": "Not in the selected catalog branch",
                "counts_toward_ingredient_total": False,
            }
            for item in formula.get("legacy_materials") or []
        ],
    }
    if not formula.get("category_supported", True):
        limitations.append(f"{category} is not a category in the US/EU reference files. No threshold branch was applied.")
    if formula.get("legacy_materials"):
        limitations.append("Unmatched ingredient names were kept as coverage gaps and were not replaced with catalog substances.")
    return {
        "formula": public_formula,
        "materials": [
            {
                "material_id": row["material_id"],
                "name": catalog["substances"][row["material_id"]]["name"],
                "kind": catalog["substances"][row["material_id"]]["role"],
                "cas": catalog["substances"][row["material_id"]].get("cas_number"),
            }
            for row in formula["ingredients"]
        ] + [
            {
                "material_id": item.get("legacy_id") or item.get("name"),
                "name": item.get("name"),
                "kind": "unmatched",
            }
            for item in formula.get("legacy_materials") or []
        ],
        "calculated_checks": calculated,
        "applicable_verified_rules": applicable_rules,
        "reference_claims_pending_verification": [],
        "evidence_requirements": _requirements(evidence_checks),
        "evidence_matches": evidence_matches,
        "missing_evidence": missing_evidence,
        "source_conflicts": issues,
        "source_excerpts": excerpts,
        "uploaded_documents": _uploaded_documents(documents),
        "version_changes": version_changes or [],
        "documented_history": [],
        "assessment_limitations": limitations,
        "checks": calculated,
        "evidence_checks": evidence_checks,
        "documents": documents,
        "extracted_facts": [fact for document in documents for fact in document.get("extracted_fields") or []],
        "source_issues": issues,
        "applicable_rules": applicable_rules,
        "regulatory_reference_status": f"Concentration limits come only from {limits['filename']}.",
        "regulatory_rows_disabled": 0,
        "historical_cases": [],
        "composition_total_percent": ingredient_total,
        "assessment_mode": "evidence",
        "dataset_kind": "threshold_reference",
        "dataset_version": catalog["dataset_version"],
        "data_hash": catalog["data_hash"],
        "substance_limits": limit_rows,
        "scenario_provenance": {
            "dataset_kind": "threshold_reference",
            "dataset_version": catalog["dataset_version"],
            "provenance": limits["filename"],
            "is_regulatory_requirement": False,
            "note": f"Each ingredient is compared with its single max_percent in {limits['filename']}. No other threshold source is used.",
        },
        "applicable_scenario_rules": [],
    }


def _requirements(checks: list[dict]) -> list[dict]:
    rows = []
    seen = set()
    for check in checks:
        requirement_id = check.get("requirement_id")
        if not requirement_id or requirement_id in seen:
            continue
        seen.add(requirement_id)
        rows.append({
            "requirement_id": requirement_id,
            "document_type": check.get("document_type"),
            "scope": check.get("scope"),
            "criticality": "high" if check.get("status") in {"missing", "mismatched"} else "medium",
        })
    return rows


DOCUMENT_LABELS = {"coa": "CoA", "sds": "SDS", "lab_report": "laboratory report"}


def _evidence(formula: dict, documents: list[dict], catalog: dict) -> tuple[list[dict], list[dict], list[dict]]:
    from app.uploads import document_material_ids

    checks = []
    matches = []
    missing = []
    for region in formula["regions"]:
        for row in formula["ingredients"]:
            material_id = row["material_id"]
            batch = row.get("batch_id")
            for document_type, scope in (("coa", "material"), ("sds", "material"), ("lab_report", "material")):
                requirement_id = f"REQ:{region}:{material_id}:{document_type}"
                related = [
                    document for document in documents
                    if document.get("document_type") == document_type
                    and document.get("scope") != "finished_product"
                    and material_id in document_material_ids(document)
                    and (not document.get("regions") or region in document.get("regions"))
                ]
                if document_type == "sds":
                    exact = []
                    wrong = []
                    for document in related:
                        supplier_clash = row.get("supplier") and document.get("supplier") and str(row.get("supplier")).strip().lower() != str(document.get("supplier")).strip().lower()
                        grade_clash = row.get("grade") and document.get("grade") and str(row.get("grade")).strip().lower() != str(document.get("grade")).strip().lower()
                        if supplier_clash or grade_clash:
                            wrong.append(document)
                        else:
                            exact.append(document)
                else:
                    wrong = [document for document in related if batch and document.get("batch_id") and document.get("batch_id") != batch]
                    exact = [document for document in related if document not in wrong]
                if document_type in {"coa", "lab_report"} and wrong and not exact:
                    status = "mismatched"
                    ids = [document["document_id"] for document in wrong]
                    message = f"{', '.join(ids)} does not match batch {batch}."
                    action = "Obtain the correct batch document or correct the entered batch."
                elif document_type == "sds" and wrong and not exact:
                    status = "mismatched"
                    ids = [document["document_id"] for document in wrong]
                    message = f"{', '.join(ids)} does not match the recorded supplier or grade. Batch is not required for an SDS."
                    action = "Review the SDS identity. Do not treat a different grade as this material."
                elif exact:
                    status = "satisfied"
                    ids = [document["document_id"] for document in exact]
                    message = f"An uploaded {DOCUMENT_LABELS[document_type]} is on file for this material."
                    action = "No further upload is required for this document."
                elif document_type == "lab_report":
                    continue
                else:
                    status = "missing"
                    ids = []
                    message = (
                        "No matching SDS is on file for this material. Batch is not required for an SDS."
                        if document_type == "sds"
                        else "No matching document is on file for this material and batch."
                    )
                    action = "Upload the document for this ingredient. A product-level file does not satisfy this requirement."
                check = {
                    "check_id": f"E:{region}:{requirement_id}",
                    "requirement_id": requirement_id,
                    "document_type": document_type,
                    "scope": scope,
                    "material_id": material_id,
                    "region": region,
                    "status": status,
                    "document_ids": ids,
                    "message": message,
                    "reason_code": "batch_mismatch" if status == "mismatched" else status,
                    "action": action,
                    "criticality": "high" if status in {"missing", "mismatched"} else "medium",
                }
                checks.append(check)
                if status == "satisfied":
                    matches.append(check)
                elif status != "not_applicable":
                    missing.append({**check, "gap_status": status})
    return checks, matches, missing


def _uploaded_documents(documents: list[dict]) -> list[dict]:
    """Extracted PDF text for ingredient uploads and for files attached at submission."""
    rows = []
    for document in documents:
        text = "\n".join(
            str(part.get("text") or "").strip()
            for part in document.get("parts") or []
            if str(part.get("text") or "").strip()
        ).strip()
        if not text:
            continue
        rows.append({
            "document_id": document.get("document_id"),
            "filename": document.get("original_filename") or document.get("filename"),
            "document_type": document.get("document_type"),
            "scope": document.get("scope"),
            "material_id": document.get("material_id"),
            "material_ids": document.get("material_ids") or ([document["material_id"]] if document.get("material_id") else []),
            "formula_id": document.get("formula_id"),
            "attached_to": "ingredient" if document.get("material_id") else "submission",
            "text": text[:6000],
        })
    return rows


def _excerpts(documents: list[dict], formula: dict, catalog: dict) -> list[dict]:
    """Send extracted CoA and SDS text for every document already linked to this formula."""
    del formula, catalog
    excerpts = []
    total = 0
    for document in documents:
        for part in document.get("parts") or []:
            text = str(part.get("text") or "").strip()
            if not text:
                continue
            clipped = text[:4000]
            excerpts.append({
                "source_id": f"{document['document_id']}:p{part.get('page')}",
                "document_id": document["document_id"],
                "filename": document.get("original_filename") or document.get("filename"),
                "page": part.get("page"),
                "relevant_text": clipped,
                "review_status": document.get("review_status"),
                "applicability": {
                    "material_id": document.get("material_id"),
                    "batch_id": document.get("batch_id"),
                    "formula_id": document.get("formula_id"),
                    "version_id": document.get("version_id"),
                    "regions": document.get("regions") or [],
                    "document_type": document.get("document_type"),
                    "scope": document.get("scope"),
                },
            })
            total += len(clipped)
            if len(excerpts) >= 16 or total >= 20000:
                return excerpts
    return excerpts
