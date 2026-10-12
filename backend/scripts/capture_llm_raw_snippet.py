"""First 300 chars of raw Azure completion text for FML-1001 (secrets masked)."""
from __future__ import annotations

import json
import time
from pathlib import Path

from openai import AzureOpenAI

from app.config import ROOT
from app.engine import build_context
from app.formula_conversion import formula_to_assessment_payload
from app.formula_store import Formula
from app import llm

DATA = Path(__file__).resolve().parents[1] / "data"
PROMPT = (ROOT / "prompts" / "explanation.txt").read_text(encoding="utf-8")


def mask(text: str) -> str:
    cfg = llm.azure_config()
    key = cfg.get("key") or ""
    if key:
        text = text.replace(key, "[REDACTED_KEY]")
    return text


def main() -> None:
    raw = json.loads((DATA / "formulas.json").read_text(encoding="utf-8-sig"))
    formula = Formula.model_validate(raw[0])
    payload = formula_to_assessment_payload(formula, generate_explanation=False, assessment_mode="evidence")
    context = build_context(payload)
    config = llm.azure_config()
    client = AzureOpenAI(
        api_key=config["key"],
        azure_endpoint=config["endpoint"],
        api_version=config["api_version"],
        timeout=90,
        max_retries=0,
    )
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": json.dumps({"assessment_context": llm._public_context(context)}, ensure_ascii=False)},
    ]
    last_text = ""
    last_error = ""
    for json_mode in (True, False):
        try:
            request = {
                "model": config["deployment"],
                "messages": messages,
                "max_completion_tokens": 4000,
            }
            if json_mode:
                request["response_format"] = {"type": "json_object"}
            response = client.chat.completions.create(**request)
            text = ((response.choices[0].message.content if response.choices else None) or "").strip()
            last_text = text
            cleaned = text.removeprefix("```json").removesuffix("```").strip()
            parsed = json.loads(cleaned)
            validated = llm.validate_explanation(parsed, context)
            if not validated:
                last_error = "Explanation did not match the expected structure."
                continue
            print("unexpected_success")
            return
        except Exception as error:
            last_error = str(error)
    print("raw_error", mask(last_error)[:500])
    print("output_first_300", mask(last_text)[:300])


if __name__ == "__main__":
    main()
