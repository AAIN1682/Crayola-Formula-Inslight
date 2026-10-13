from app.assessment_schema import assessment_structured_response_format
from app.llm import ASSESSMENT_ATTEMPTS, LLM_TEMPERATURE, PROMPT_VERSION


def test_structured_response_format_uses_json_schema_and_enums():
    payload = assessment_structured_response_format()
    assert payload["type"] == "json_schema"
    schema = payload["json_schema"]["schema"]
    assert payload["json_schema"]["strict"] is True
    assert "source_review_required" in schema["properties"]["findings"]["items"]["properties"]["status"]["enum"]
    assert "required_reason_text" in schema["properties"]["findings"]["items"]["properties"]


def test_part_b_llm_constants():
    assert PROMPT_VERSION == "assessment_v3"
    assert ASSESSMENT_ATTEMPTS == 3
    assert LLM_TEMPERATURE == 0
