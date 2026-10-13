"""20-run LLM reliability probe for Example 1 and Example 2 assessment payloads."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from app import llm
from app.config import azure_settings
from app.engine import build_context
from app.llm import AzureExplanationError

REPORT1 = Path(__file__).resolve().parents[2] / "docs" / "screenshots" / "example1-precheck-report.json"
RUNS = 20

EXAMPLE2_BODY = {
    "formula_id": "PROBE-EX2",
    "version_id": "v1.0",
    "name": "Probe Example 2 Chalk blend",
    "product_category": "Crayons",
    "age_group": "under_12",
    "regions": ["US"],
    "physical_form": "powder",
    "intended_use": "Solid chalk-style blend for screening probe.",
    "composition_completeness": "complete",
    "us_states": [],
    "document_ids": [],
    "intended_age_detail": "Ages 3+",
    "ingredients": [],
    "legacy_materials": [
        {"name": "Calcium Sulfate Dihydrate / Gypsum", "legacy_id": None, "concentration_percent": 62.0, "cas_number": "10101-41-4", "in_rule_catalog": False, "screening_role": "formulation_ingredient"},
        {"name": "Copper Powder Flakes", "legacy_id": None, "concentration_percent": 18.0, "cas_number": "7440-50-8", "in_rule_catalog": False, "screening_role": "formulation_ingredient"},
        {"name": "Starch Gum", "legacy_id": None, "concentration_percent": 12.0, "cas_number": "9005-25-8", "in_rule_catalog": False, "screening_role": "formulation_ingredient"},
        {"name": "Fine Grade Talc", "legacy_id": None, "concentration_percent": 8.0, "cas_number": "14807-96-6", "in_rule_catalog": False, "screening_role": "formulation_ingredient"},
    ],
    "generate_explanation": True,
    "assessment_mode": "evidence",
}


def run_probe(label: str, body: dict) -> None:
    context = build_context(body)
    successes = 0
    failures = 0
    error_counter: Counter[str] = Counter()
    llm.reset_response_format_usage()
    for run in range(RUNS):
        try:
            llm.explain(context)
            successes += 1
            print(f"{label} run {run + 1}/{RUNS}: succeeded")
        except AzureExplanationError as error:
            failures += 1
            print(f"{label} run {run + 1}/{RUNS}: failed code={error.code}")
            for item in error.validation_errors:
                error_counter[item] += 1
        except RuntimeError:
            failures += 1
            print(f"{label} run {run + 1}/{RUNS}: azure not configured")
    print(f"\n=== {label} summary ===")
    print(f"successes: {successes}")
    print(f"failures: {failures}")
    print(f"response_format_usage: {llm.response_format_usage()}")
    print("distinct validation errors:")
    for message, count in error_counter.most_common():
        print(f"  [{count}x] {message}")


def main() -> None:
    cfg = azure_settings()
    print(f"azure_configured={cfg['ok']} api_version={cfg.get('api_version')}")
    if llm.last_structured_schema_error():
        print(f"last_structured_schema_error={llm.last_structured_schema_error()}")
    body1 = json.loads(REPORT1.read_text(encoding="utf-8"))["assessmentRequestBody"]
    run_probe("Example1", body1)
    run_probe("Example2", EXAMPLE2_BODY)


if __name__ == "__main__":
    main()
