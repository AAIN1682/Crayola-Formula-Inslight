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

from app.config import DATA

REFERENCE_FILES = {"US": "us_ 2.json", "EU": "eu_ 2.json"}
TOLERANCE = 0.01
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


def _passes(actual: float, operator: str, threshold: float, polarity: str | None) -> bool:
    met = _compare(actual, operator, threshold)
    if polarity == "ceiling":
        return met
    return not met


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


def _age_constraint(text: str) -> str | None:
    low = text.lower()
    if "not age-split" in low:
        return None
    hits = []
    if any(token in low for token in ("under 36 months", "under 3 years", "0-3", "0–3", "children under 3")):
        hits.append("under_36_months")
    if any(token in low for token in ("3-6", "3 to 6", "3–6")):
        hits.append("age_3_to_under_6")
    if "14+" in low or "14 +" in low:
        hits.append("age_14_plus")
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        return "unresolved"
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


def _compare(actual: float, operator: str, threshold: float) -> bool:
    if operator == "<=":
        return actual <= threshold
    if operator == "<":
        return actual < threshold
    if operator == ">=":
        return actual >= threshold
    if operator == ">":
        return actual > threshold
    return False


def _to_ppm(value: float, unit: str) -> float | None:
    if unit == "ppm":
        return value
    if unit == "percent":
        return value * 10000
    if unit == "mg/kg":
        return value
    return None


def _compatible_concentration(rule: dict, entered_basis: str) -> bool:
    basis = rule.get("basis")
    quantity = rule.get("quantity")
    if quantity == "exposure":
        return False
    if rule.get("route") != "concentration":
        return False
    if basis in {None, "stated_weight", "total_content"} and entered_basis in {"finished_formula", "stated_weight", "total_content"}:
        return rule.get("normalized_unit") in {"percent", "ppm", "mg/kg"}
    if basis == "plasticised_material" and entered_basis == "plasticised_material":
        return rule.get("normalized_unit") == "percent"
    if basis == "dried_film_or_nonvolatile" and entered_basis == "dried_film_or_nonvolatile":
        return True
    if basis == "paint_weight" and entered_basis == "paint_weight":
        return True
    return False


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
    version_hash = hashlib.sha256("".join(item["sha256"] for item in files).encode("utf-8")).hexdigest()
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


def _applicability(rule: dict, formula: dict) -> tuple[str | None, str]:
    states = {str(item).upper() for item in formula.get("us_states") or []}
    if rule.get("state_code"):
        if rule["state_code"] not in states:
            return "not_applicable", f"State rule for {rule['state_code']} is not applied to a generic US assessment."
    constraint = _age_constraint(f"{rule.get('applies_to') or ''} {rule.get('limit_text') or ''}")
    intended = formula.get("intended_age_detail")
    if constraint == "unresolved":
        return "applicability_unknown", "The rule states more than one age boundary that the selected band does not resolve."
    if constraint and intended != constraint:
        if not intended:
            return "applicability_unknown", "Select an intended age within the catalog band before this rule can be applied."
        return "not_applicable", "The selected intended age does not match this rule's age boundary."
    if rule.get("test_category"):
        selected = formula.get("test_material_category")
        if not selected:
            return "applicability_unknown", "Select the EN 71-3 material category this migration limit applies to."
        if selected != rule["test_category"]:
            return "not_applicable", "This migration limit is for a different material category."
    blob = f"{rule.get('applies_to') or ''}".lower()
    needs_toy = "toy" in blob or "child care" in blob or "childcare" in blob
    scope = str(formula.get("toy_childcare_scope") or "").lower()
    if needs_toy:
        if scope in {"", "unknown"}:
            return "applicability_unknown", "Confirm whether the product is a toy or childcare article."
        if scope == "no":
            return "not_applicable", "The rule applies to toys or childcare articles, which this product is not declared to be."
    basis = rule.get("basis")
    component = formula.get("component_type") or "finished_formula"
    if basis == "plasticised_material" and component != "plasticised_material":
        return "applicability_unknown", "This limit is on plasticised material, not the finished-formula percentage."
    if basis == "dried_film_or_nonvolatile" and component != "dried_film":
        return "applicability_unknown", "This limit uses dried-film or nonvolatile content, not the entered formula percentage."
    if "substrate" in blob and component != "substrate":
        return "applicability_unknown", "This limit applies to substrate materials, which has not been selected."
    return None, ""


def _measurement(row: dict, route: str) -> dict | None:
    kind = str(row.get("measurement_kind") or "").lower()
    if route == "migration" and kind != "migration":
        return None
    if route == "concentration" and kind not in {"concentration", "content"}:
        return None
    if row.get("measured_value") is None and not row.get("below_detection"):
        return None
    bound = str(row.get("measured_bound") or "exact").lower()
    if row.get("below_detection"):
        bound = "below_detection"
    return {
        "value": None if row.get("measured_value") is None else float(row["measured_value"]),
        "unit": row.get("measured_unit"),
        "bound": bound,
        "method": row.get("test_method"),
        "analyte": row.get("analyte"),
        "kind": kind or route,
    }


def _bound_result(measurement: dict, rule: dict, actual_unit: str) -> tuple[str, float | None]:
    operator = rule["operator"]
    polarity = rule.get("operator_polarity") or "trigger"
    threshold = float(rule["threshold_value"])
    rule_unit = rule.get("normalized_unit") or actual_unit
    bound = measurement["bound"]
    value = measurement["value"]
    if value is None:
        return "needs_test_data", None
    if actual_unit == rule_unit:
        compare_value = value
        compare_threshold = threshold
    else:
        actual_ppm = _to_ppm(value, actual_unit)
        rule_ppm = _to_ppm(threshold, rule_unit)
        if actual_ppm is None or rule_ppm is None or rule.get("route") == "migration":
            return "applicability_unknown", None
        compare_value = actual_ppm
        compare_threshold = rule_ppm
    if bound in {"below_detection", "lt", "lte"}:
        if polarity == "trigger" and operator in {">", ">="} and compare_value <= compare_threshold:
            return "pass", compare_value
        if polarity == "ceiling" and operator in {"<", "<="} and compare_value <= compare_threshold:
            return "pass", compare_value
        return "needs_test_data", compare_value
    if bound != "exact":
        return "needs_test_data", compare_value
    passed = _passes(compare_value, operator, compare_threshold, polarity)
    return ("pass" if passed else "fail"), compare_value


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


def _check(rule: dict, row: dict, status: str, message: str, action: str, actual=None) -> dict:
    return {
        "check_id": f"{rule['region']}:{row['material_id']}:{rule['rule_id']}",
        "material_id": row["material_id"],
        "region": rule["region"],
        "rule_id": rule["rule_id"],
        "status": status,
        "actual": actual,
        "threshold": rule.get("threshold_value"),
        "unit": rule.get("threshold_unit"),
        "basis": rule.get("basis"),
        "operator": rule.get("operator"),
        "route": rule.get("route"),
        "verification_status": rule.get("verification_status"),
        "verified_limit_available": status in {"pass", "fail"} and rule.get("verification_status") == "Verified",
        "json_pointer": rule.get("json_pointer"),
        "source_filename": rule.get("source_filename"),
        "priority": "high" if status == "fail" else "medium",
        "reason_code": status,
        "message": message,
        "action": action,
        "check_kind": rule.get("route"),
    }


def _evaluate_rule(rule: dict, row: dict, formula: dict, substance: dict) -> dict:
    skipped, reason = _applicability(rule, formula)
    if skipped:
        return _check(rule, row, skipped, reason, "Resolve applicability before treating this as a pass or a failure.", row.get("concentration_percent"))
    if rule.get("duplicate_of"):
        return _check(rule, row, "not_applicable", f"Duplicate of {rule['duplicate_of']}.", "Use the retained rule.", None)
    if rule.get("contradictory"):
        return _check(
            rule,
            row,
            "source_review_required",
            "Overlapping Chromium (III) and Chromium (VI) thresholds are flagged. Neither value is applied automatically.",
            "Keep the species separate and resolve the source conflict before a migration comparison.",
            None,
        )
    if substance.get("identity_flags"):
        return _check(
            rule,
            row,
            "source_review_required",
            "The source name or abbreviation is inconsistent, so this record is not given a verified verdict.",
            "Resolve the substance identity in the source file before comparing a concentration.",
            row.get("concentration_percent"),
        )
    if rule.get("elemental_on_compound"):
        return _check(
            rule,
            row,
            "source_review_required",
            "An elemental limit is recorded under a compound entry. The compound percentage is not compared with that elemental limit.",
            "Supply an elemental measurement on the stated basis, or select the element analyte.",
            None,
        )
    if rule.get("verification_status") != "Verified":
        return _check(
            rule,
            row,
            "source_review_required",
            f"Source verification status is {rule.get('verification_status') or 'unset'}. This is the file's stated status, not an independent verification, and it is not used as a verdict.",
            "Use the record as reference context until the source status is Verified and unambiguous.",
            None,
        )
    if rule["route"] == "status_text":
        return _check(
            rule,
            row,
            "source_review_required",
            "Regulatory status text is not mapped to a supported verdict. Restricted, banned, or warning wording stays unresolved.",
            "Review applicability of the status text. No automatic prohibition or approval is inferred.",
            None,
        )
    if rule["route"] in {"ambiguous", "exposure"}:
        return _check(
            rule,
            row,
            "needs_test_data" if rule["route"] == "exposure" else "source_review_required",
            "Exposure and mixed migration/content/emission limits are not compared with a formulation percentage. No exposure model is configured."
            if rule["route"] == "exposure"
            else "The threshold type mixes measurement bases and is not evaluated automatically.",
            "Provide the measurement the rule actually requires, on a matching basis.",
            None,
        )
    if rule["route"] == "migration":
        measurement = _measurement(row, "migration")
        if not measurement or not measurement.get("method"):
            return _check(
                rule,
                row,
                "needs_test_data",
                "This is a migration limit. A measured migration result, analyte, method, and material category are required.",
                "Upload or enter a migration result for this analyte. Do not compare it with a formulation percentage.",
                None,
            )
        if rule.get("operator") is None or rule.get("threshold_value") is None:
            return _check(
                rule,
                row,
                "source_review_required",
                "A migration result is present, but the source record does not state an operator. It is not assumed to be <=.",
                "Resolve the operator before comparing the measured result.",
                measurement.get("value"),
            )
        unit = _normalize_unit(measurement.get("unit"))
        if unit["normalized_unit"] != rule.get("normalized_unit") and not (
            unit["normalized_unit"] in {"ppm", "mg/kg"} and rule.get("normalized_unit") in {"ppm", "mg/kg"}
        ):
            return _check(rule, row, "applicability_unknown", "The migration result unit is not compatible with this limit.", "Report the result in the limit's unit.", None)
        status, actual = _bound_result(measurement, rule, unit["normalized_unit"])
        if status == "needs_test_data":
            message = "The reported bound is not an exact measurement and does not decide this migration limit. A less-than result was not converted to zero."
        elif status == "pass":
            message = f"Migration result is within the source threshold ({rule['operator']} {_fmt(rule['threshold_value'])} {rule.get('threshold_unit')})."
        else:
            message = f"Migration result is outside the source threshold ({rule['operator']} {_fmt(rule['threshold_value'])} {rule.get('threshold_unit')})."
        return _check(rule, row, status, message, "Record the migration comparison against the cited rule.", actual)
    entered_basis = "finished_formula"
    if formula.get("component_type") == "plasticised_material":
        entered_basis = "plasticised_material"
    elif formula.get("component_type") == "dried_film":
        entered_basis = "dried_film_or_nonvolatile"
    if not _compatible_concentration(rule, entered_basis):
        return _check(
            rule,
            row,
            "applicability_unknown",
            "The concentration basis or unit is not compatible with this threshold.",
            "Do not convert total content, migration, and exposure into each other.",
            row.get("concentration_percent"),
        )
    if rule.get("operator") is None or rule.get("threshold_value") is None:
        return _check(
            rule,
            row,
            "source_review_required",
            "The record has no unambiguous operator or numeric threshold. A missing number is not treated as zero or as a failure.",
            "Keep the record visible and do not invent a limit.",
            row.get("concentration_percent"),
        )
    content = _measurement(row, "concentration") if row.get("concentration_percent") is None else None
    if content:
        unit = _normalize_unit(content.get("unit"))
        if not unit.get("normalized_unit"):
            return _check(rule, row, "applicability_unknown", "The content result unit is not recognized, so it is not compared with this limit.", "Report the result in the limit's unit.", None)
        status, actual = _bound_result(content, rule, unit["normalized_unit"])
        actual_unit = unit["normalized_unit"]
    else:
        try:
            actual = float(row.get("concentration_percent"))
        except (TypeError, ValueError):
            return _check(rule, row, "needs_test_data", "A numeric concentration is required for this content limit.", "Enter the concentration on the rule's basis.", None)
        actual_unit = "percent"
        status, _compared = _bound_result({"value": actual, "bound": "exact", "unit": "percent"}, rule, actual_unit)
    if status == "applicability_unknown":
        return _check(rule, row, status, "Unit conversion is not supported for this pair of units.", "Use a matching unit.", actual)
    if status == "needs_test_data":
        return _check(rule, row, status, "The reported bound is not an exact content measurement and was not converted to zero.", "Report an exact result or a bound that sits entirely on the safe side of the operator.", actual)
    passed = status == "pass"
    shown = f"{_fmt(actual)} {actual_unit}" if actual_unit != "percent" else f"{_fmt(actual)}%"
    message = (
        f"{shown} compared with {rule['operator']} {_fmt(rule['threshold_value'])} {rule.get('threshold_unit')} ({rule.get('basis')}). "
        + ("Within the stated boundary." if passed else "Outside the stated boundary.")
    )
    return _check(rule, row, "pass" if passed else "fail", message, "The numerical comparison is from the backend, using the source operator and basis.", actual)


def _evaluate_ingredient(row, formula, catalog, regions, category, age, calculated, applicable_rules, seen_rules, group_members) -> None:
    substance = catalog["substances"][row["material_id"]]
    for region in regions:
        matched = [
            rule for rule in catalog["rules"]
            if rule["substance_id"] == row["material_id"]
            and rule["region"] == region
            and rule["category_name"] == category
            and rule["age_group"] == age
            and not rule.get("duplicate_of")
        ]
        if not matched:
            calculated.append({
                "check_id": f"{region}:{row['material_id']}:NO-RULE",
                "material_id": row["material_id"],
                "region": region,
                "rule_id": None,
                "status": "no_matching_rule",
                "actual": row.get("concentration_percent"),
                "threshold": None,
                "unit": None,
                "basis": None,
                "verified_limit_available": False,
                "priority": "medium",
                "reason_code": "no_matching_rule",
                "message": f"No {region} entry in this category and age band. That is a coverage gap, not a prohibition or an approval.",
                "action": "Do not infer a regulatory outcome from a missing catalog row.",
                "check_kind": "coverage",
            })
            continue
        for rule in matched:
            check = _evaluate_rule(rule, row, formula, substance)
            calculated.append(check)
            if check["status"] in {"pass", "fail"} and rule["rule_id"] not in seen_rules:
                seen_rules.add(rule["rule_id"])
                applicable_rules.append(_public_rule(rule))
            if rule.get("combination") and check["status"] not in {"not_applicable"}:
                group_members.setdefault((region, rule.get("regulation"), rule.get("threshold_value"), rule.get("threshold_unit"), rule.get("operator")), []).append((rule, row, check))


def _legacy_checks(formula: dict, regions: list[str], category: str, calculated: list[dict]) -> None:
    supported = formula.get("category_supported", True)
    for index, item in enumerate(formula.get("legacy_materials") or []):
        label = str(item.get("name") or "Unnamed ingredient")
        legacy_id = str(item.get("legacy_id") or f"row-{index + 1}")
        category_note = "" if supported else f" {category} is not a category in the US/EU reference files."
        for region in regions:
            calculated.append({
                "check_id": f"{region}:legacy:{legacy_id}:{index}",
                "material_id": legacy_id,
                "region": region,
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
    regions = list(dict.fromkeys(formula["regions"]))
    category = formula["product_category"]
    age = formula["age_group"]
    calculated = []
    applicable_rules = []
    seen_rules = set()
    group_members: dict[tuple, list[dict]] = {}
    if formula.get("category_supported", True):
        for row in formula["ingredients"]:
            _evaluate_ingredient(row, formula, catalog, regions, category, age, calculated, applicable_rules, seen_rules, group_members)
    _legacy_checks(formula, regions, category, calculated)
    for key, members in group_members.items():
        if len({item[1]["material_id"] for item in members}) < 1:
            continue
        if any(item[2]["status"] == "source_review_required" for item in members):
            continue
        ruleset = members[0][0]
        total = 0.0
        for _rule, row, _check in members:
            try:
                total += float(row.get("concentration_percent") or 0)
            except (TypeError, ValueError):
                total = None
                break
        check_id = f"{key[0]}:GROUP:{_slug(str(key[1]))}:{ruleset['rule_id']}"
        if total is None or ruleset.get("operator") is None or ruleset.get("threshold_value") is None:
            calculated.append({
                "check_id": check_id,
                "material_id": None,
                "region": key[0],
                "rule_id": ruleset["rule_id"],
                "status": "source_review_required",
                "verified_limit_available": False,
                "message": "The source requires a combination total, which is not evaluated as independent ingredient limits.",
                "action": "Resolve the group scope before a numerical comparison.",
                "priority": "medium",
                "reason_code": "combination_limit",
                "check_kind": "combination",
                "threshold": ruleset.get("threshold_value"),
                "unit": ruleset.get("threshold_unit"),
                "basis": ruleset.get("basis"),
            })
        else:
            passed = _passes(total, ruleset["operator"], float(ruleset["threshold_value"]), ruleset.get("operator_polarity"))
            calculated.append({
                "check_id": check_id,
                "material_id": None,
                "region": key[0],
                "rule_id": ruleset["rule_id"],
                "status": "pass" if passed else "fail",
                "actual": round(total, 4),
                "threshold": ruleset["threshold_value"],
                "unit": ruleset["threshold_unit"],
                "basis": ruleset["basis"],
                "operator": ruleset["operator"],
                "verified_limit_available": True,
                "message": f"Group total {_fmt(total)} compared with {ruleset['operator']} {_fmt(ruleset['threshold_value'])} {ruleset.get('threshold_unit')}.",
                "action": "The group total is a separate check from each member.",
                "priority": "high" if not passed else "medium",
                "reason_code": "combination_limit",
                "check_kind": "combination",
                "json_pointer": ruleset["json_pointer"],
                "source_filename": ruleset["source_filename"],
            })
    documents = documents_for_formula(formula)
    evidence_checks, evidence_matches, missing_evidence = _evidence(formula, documents, catalog)
    substance_ids = {row["material_id"] for row in formula["ingredients"]}
    issues = [
        issue for issue in catalog["issues"]
        if issue.get("substance_id") in substance_ids or set(issue.get("rule_ids") or []).intersection({item.get("rule_id") for item in calculated})
    ]
    if not any("boron" in (catalog["substances"][item]["name"].lower()) for item in substance_ids):
        issues = [issue for issue in issues if "boron" not in str(issue.get("message") or "").lower()]
    excerpts = _excerpts(documents, formula, catalog)
    ingredient_total = round(sum(
        float(row["concentration_percent"])
        for row in formula["ingredients"]
        if catalog["substances"][row["material_id"]]["role"] == "formulation_ingredient" and row.get("concentration_percent") is not None
    ), 4)
    partial = formula.get("composition_completeness", "partial") != "complete"
    limitations = [
        catalog["coverage_note"],
        "Source verification status is the status stated in the supplied file. This application does not independently verify it.",
        "AP and CL decisions are not issued here.",
        "Partial composition." if partial else "The declared formulation ingredients total 100% within tolerance. This is still not an approved-recipe or full regulatory certification.",
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
        "reference_claims_pending_verification": [
            _public_rule(rule)
            for rule in catalog["rules"]
            if rule["substance_id"] in substance_ids
            and rule["category_name"] == category
            and rule["age_group"] == age
            and rule["region"] in regions
            and rule.get("verification_status") != "Verified"
            and not rule.get("duplicate_of")
        ][:24],
        "evidence_requirements": _requirements(evidence_checks),
        "evidence_matches": evidence_matches,
        "missing_evidence": missing_evidence,
        "source_conflicts": issues,
        "source_excerpts": excerpts,
        "version_changes": version_changes or [],
        "documented_history": [],
        "assessment_limitations": limitations,
        "checks": calculated,
        "evidence_checks": evidence_checks,
        "documents": documents,
        "extracted_facts": [fact for document in documents for fact in document.get("extracted_fields") or []],
        "source_issues": issues,
        "applicable_rules": applicable_rules,
        "regulatory_reference_status": "Threshold records are limited to the selected region, category, and age branch.",
        "regulatory_rows_disabled": sum(1 for rule in catalog["rules"] if rule.get("verification_status") != "Verified"),
        "historical_cases": [],
        "composition_total_percent": ingredient_total,
        "assessment_mode": "evidence",
        "dataset_kind": "threshold_reference",
        "dataset_version": catalog["dataset_version"],
        "data_hash": catalog["data_hash"],
        "scenario_provenance": {
            "dataset_kind": "threshold_reference",
            "dataset_version": catalog["dataset_version"],
            "provenance": "supplied_us_eu_json",
            "is_regulatory_requirement": False,
            "note": "Dummy concentration rules are not used in this workflow.",
        },
        "applicable_scenario_rules": [],
    }


def _public_rule(rule: dict) -> dict:
    return {
        "rule_id": rule["rule_id"],
        "substance_id": rule["substance_id"],
        "region": rule["region"],
        "threshold_type": rule["threshold_type"],
        "threshold_value": rule["threshold_value"],
        "threshold_unit": rule["threshold_unit"],
        "normalized_unit": rule["normalized_unit"],
        "basis": rule["basis"],
        "operator": rule["operator"],
        "route": rule["route"],
        "regulation": rule["regulation"],
        "applies_to": rule["applies_to"],
        "limit_text": rule["limit_text"],
        "verification_status": rule["verification_status"],
        "source_url": rule["source_url"],
        "section": rule["section"],
        "json_pointer": rule["json_pointer"],
        "source_filename": rule["source_filename"],
        "state_code": rule.get("state_code"),
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


def _evidence(formula: dict, documents: list[dict], catalog: dict) -> tuple[list[dict], list[dict], list[dict]]:
    checks = []
    matches = []
    missing = []
    for region in formula["regions"]:
        for row in formula["ingredients"]:
            material_id = row["material_id"]
            batch = row.get("batch_id")
            for document_type, scope in (("coa", "material"), ("lab_report", "material")):
                requirement_id = f"REQ:{region}:{material_id}:{document_type}"
                related = [
                    document for document in documents
                    if document.get("document_type") == document_type
                    and document.get("material_id") in {None, material_id}
                    and (not document.get("regions") or region in document.get("regions"))
                ]
                exact = [
                    document for document in related
                    if (batch and document.get("batch_id") == batch) or (not batch and not document.get("batch_id"))
                ]
                wrong = [document for document in related if batch and document.get("batch_id") and document.get("batch_id") != batch]
                if document_type == "coa" and wrong and not exact:
                    status = "mismatched"
                    ids = [document["document_id"] for document in wrong]
                    message = f"{', '.join(ids)} does not match batch {batch}."
                    action = "Obtain the correct batch CoA or correct the entered batch."
                elif exact and any(document.get("review_status") == "confirmed" for document in exact):
                    status = "satisfied"
                    ids = [document["document_id"] for document in exact if document.get("review_status") == "confirmed"]
                    message = "Reviewed evidence matches this material and batch."
                    action = "No further upload is required for this matching document."
                elif exact:
                    status = "needs_review"
                    ids = [document["document_id"] for document in exact]
                    message = "A matching document is on file and still needs review. Do not upload it again."
                    action = "Review the extracted fields."
                elif document_type == "lab_report":
                    continue
                else:
                    status = "missing"
                    ids = []
                    message = "No matching document is on file for this material and batch."
                    action = "Upload the document for this scope."
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


def _excerpts(documents: list[dict], formula: dict, catalog: dict) -> list[dict]:
    names = [catalog["substances"][row["material_id"]]["name"].lower() for row in formula["ingredients"]]
    excerpts = []
    for document in documents:
        for part in document.get("parts") or []:
            text = str(part.get("text") or "")
            if names and not any(name.split("(")[0].strip().lower()[:12] in text.lower() for name in names if name):
                if document.get("material_id") not in {row["material_id"] for row in formula["ingredients"]}:
                    continue
            if not text.strip():
                continue
            excerpts.append({
                "source_id": f"{document['document_id']}:p{part.get('page')}",
                "document_id": document["document_id"],
                "filename": document.get("original_filename"),
                "page": part.get("page"),
                "relevant_text": text[:700],
                "review_status": document.get("review_status"),
                "applicability": {
                    "material_id": document.get("material_id"),
                    "batch_id": document.get("batch_id"),
                    "formula_id": document.get("formula_id"),
                    "version_id": document.get("version_id"),
                    "regions": document.get("regions") or [],
                    "document_type": document.get("document_type"),
                },
            })
            if len(excerpts) >= 8:
                return excerpts
    return excerpts
