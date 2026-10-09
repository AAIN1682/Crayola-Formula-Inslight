"""Real PDF uploads. Bytes are stored under a generated name, never the original filename."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.config import DATA
from app.extract import _extract_pdf

DOCUMENT_TYPES = {
    "sds": "Safety Data Sheet (SDS)",
    "coa": "Certificate of Analysis (CoA)",
    "lab_report": "Laboratory Test Report",
    "label": "Product Label / Warning Information",
    "other": "Other Supporting Document",
}
PDF_MAGIC = b"%PDF"
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
MAX_PAGES = int(os.environ.get("MAX_UPLOAD_PAGES", "30"))


class UploadError(ValueError):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _serverless() -> bool:
    return os.environ.get("VERCEL") == "1" or bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))


def storage_dir() -> Path:
    configured = os.environ.get("DOCUMENT_STORAGE_DIR", "").strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
    else:
        path = (DATA / "user_uploads").resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path() -> Path:
    return storage_dir() / "index.json"


def _read_index() -> list[dict]:
    path = _index_path()
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return payload if isinstance(payload, list) else []


def _write_index(rows: list[dict]) -> None:
    _index_path().write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def _blob_token() -> str:
    return os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip() or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN", "").strip()


def _store_bytes(document_id: str, content: bytes, media_type: str) -> dict:
    name = f"{document_id}.pdf"
    if _serverless():
        token = _blob_token()
        if not token:
            raise UploadError("Durable document storage is not configured for this hosting environment.")
        import urllib.request

        request = urllib.request.Request(
            f"https://blob.vercel-storage.com/{name}",
            data=content,
            method="PUT",
            headers={
                "authorization": f"Bearer {token}",
                "x-content-type": media_type,
                "x-add-random-suffix": "0",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
        return {"storage": "vercel_blob", "stored_name": name, "url": body.get("url")}
    path = storage_dir() / name
    path.write_bytes(content)
    return {"storage": "filesystem", "stored_name": name, "url": None}


def _page_count(path: Path) -> int:
    try:
        from pypdf import PdfReader

        return len(PdfReader(str(path)).pages)
    except Exception:
        return 0


def _try_ocr(path: Path) -> tuple[list[dict], str | None]:
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError:
        return [], "OCR required"
    try:
        images = convert_from_path(str(path), dpi=200)
    except Exception:
        return [], "OCR required"
    parts = []
    for index, image in enumerate(images, start=1):
        text = (pytesseract.image_to_string(image) or "").strip()
        parts.append({"page": index, "text": text, "locator_kind": "ocr_page"})
    return parts, None


_CAS = re.compile(r"\b\d{2,7}-\d{2}-\d\b")
_NUMBER = re.compile(r"(?P<bound><=|>=|≤|≥|<|>)?\s*(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>mg/kg|ppm|%|µg/g|ug/g|mg/l)?", re.I)


def _extract_fields(parts: list[dict]) -> list[dict]:
    fields = []
    for part in parts:
        text = str(part.get("text") or "")
        page = part.get("page")
        for match in _CAS.finditer(text):
            fields.append(_field("cas", match.group(0), page, "identifier"))
        for label, pattern in (
            ("batch_number", r"(?:batch|lot)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})"),
            ("document_number", r"(?:report|certificate|document)\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})"),
            ("supplier", r"(?:supplier|manufacturer)\s*[:\-]\s*([A-Za-z0-9 .,&-]{3,80})"),
            ("product_name", r"(?:product|material)\s*[:\-]\s*([A-Za-z0-9 .,&()/-]{3,80})"),
            ("test_method", r"(?:method)\s*[:\-]\s*([A-Za-z0-9 .:/_-]{3,60})"),
        ):
            found = re.search(pattern, text, re.I)
            if found:
                fields.append(_field(label, found.group(1).strip(), page, "identifier"))
        column = "unknown"
        low = text.lower()
        if "specification" in low or re.search(r"\bspec\b", low):
            column = "specification"
        if "result" in low or "found" in low:
            column = "result" if column == "unknown" else column
        for match in _NUMBER.finditer(text):
            raw_bound = match.group("bound")
            unit = match.group("unit")
            if not unit and not raw_bound:
                continue
            bound = {"<": "lt", ">": "gt", "<=": "lte", ">=": "gte", "≤": "lte", "≥": "gte"}.get(raw_bound or "", "exact")
            if bound == "lt" and ("lod" in low or "detection" in low or "loq" in low):
                bound = "below_detection"
            fields.append({
                **_field("measured_value", match.group("value").replace(",", "."), page, "measurement"),
                "bound": bound,
                "unit": unit,
                "column_role": column,
                "note": "A less-than or specification value is not stored as an exact result or as zero.",
            })
    return fields[:40]


def _field(name: str, value: str, page, kind: str) -> dict:
    return {
        "field_id": f"F-{uuid4().hex[:10]}",
        "name": name,
        "value": value,
        "page": page,
        "kind": kind,
        "bound": "exact",
        "unit": None,
        "column_role": "unknown",
        "review_status": "extracted_unreviewed",
        "provenance": "extractor",
        "corrections": [],
    }


def save_upload(content: bytes, original_filename: str, metadata: dict) -> dict:
    if not content.startswith(PDF_MAGIC):
        raise UploadError("Only PDF files are accepted. The file signature is not a PDF.")
    if len(content) > MAX_BYTES:
        raise UploadError(f"The file exceeds the {MAX_BYTES} byte limit.")
    document_type = str(metadata.get("document_type") or "")
    if document_type not in DOCUMENT_TYPES:
        raise UploadError("Choose a document type from the list.")
    scope = str(metadata.get("scope") or "")
    if scope not in {"material", "finished_product"}:
        raise UploadError("Scope must be material or finished product.")
    document_id = "UPL-" + uuid4().hex[:12]
    digest = hashlib.sha256(content).hexdigest()
    stored = _store_bytes(document_id, content, "application/pdf")
    path = storage_dir() / stored["stored_name"] if stored["storage"] == "filesystem" else None
    pages = _page_count(path) if path and path.is_file() else 0
    if pages > MAX_PAGES:
        if path and path.is_file():
            path.unlink(missing_ok=True)
        raise UploadError(f"The PDF exceeds the {MAX_PAGES} page limit.")
    parts: list[dict] = []
    ocr_note = None
    if path and path.is_file():
        parts = _extract_pdf(path)
        combined = " ".join(str(part.get("text") or "") for part in parts).strip()
        if len(combined) < 12:
            ocr_parts, ocr_note = _try_ocr(path)
            if ocr_parts and any(str(part.get("text") or "").strip() for part in ocr_parts):
                parts = ocr_parts
                ocr_note = None
            else:
                ocr_note = "OCR required"
    elif stored["storage"] != "filesystem":
        ocr_note = "OCR required"
    combined = " ".join(str(part.get("text") or "") for part in parts).strip()
    if ocr_note:
        extraction_status = "ocr_required"
    elif combined:
        extraction_status = "extracted"
    else:
        extraction_status = "empty"
    record = {
        "document_id": document_id,
        "original_filename": Path(original_filename or "upload.pdf").name,
        "stored_name": stored["stored_name"],
        "storage": stored["storage"],
        "url": stored.get("url"),
        "sha256": digest,
        "size_bytes": len(content),
        "page_count": pages,
        "media_type": "application/pdf",
        "document_type": document_type,
        "document_type_label": DOCUMENT_TYPES[document_type],
        "scope": scope,
        "material_id": metadata.get("material_id") or None,
        "supplier": metadata.get("supplier") or None,
        "grade": metadata.get("grade") or None,
        "batch_id": metadata.get("batch_id") or None,
        "formula_id": metadata.get("formula_id") or None,
        "version_id": metadata.get("version_id") or None,
        "regions": metadata.get("regions") or [],
        "test_scope": metadata.get("test_scope") or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "extraction_status": extraction_status,
        "ocr_required": extraction_status == "ocr_required",
        "ocr_message": "OCR required" if extraction_status == "ocr_required" else None,
        "review_status": "extracted_unreviewed" if extraction_status == "extracted" else extraction_status,
        "authenticity_status": "not_established",
        "applicability_status": "unconfirmed",
        "parts": [{"page": part.get("page"), "text": str(part.get("text") or "")[:4000]} for part in parts if str(part.get("text") or "").strip()],
        "extracted_fields": _extract_fields(parts) if extraction_status == "extracted" else [],
        "filename": stored["stored_name"],
    }
    rows = _read_index()
    rows.append(record)
    _write_index(rows)
    return _public(record)


def list_uploads() -> list[dict]:
    return [_public(row) for row in _read_index()]


def get_upload(document_id: str) -> dict | None:
    for row in _read_index():
        if row.get("document_id") == document_id:
            return row
    return None


def review_upload(document_id: str, corrections: list[dict]) -> dict:
    rows = _read_index()
    match = next((row for row in rows if row.get("document_id") == document_id), None)
    if not match:
        raise UploadError("That document is not on file.")
    by_id = {field["field_id"]: field for field in match.get("extracted_fields") or []}
    for correction in corrections:
        field = by_id.get(correction.get("field_id"))
        if not field:
            continue
        field["corrections"].append({
            "previous": field.get("value"),
            "value": correction.get("value"),
            "at": datetime.now(timezone.utc).isoformat(),
            "provenance": "user_correction",
        })
        field["value"] = correction.get("value")
        if correction.get("bound"):
            field["bound"] = correction.get("bound")
        field["review_status"] = "confirmed_by_user"
        field["provenance"] = "user_correction"
    if corrections:
        match["review_status"] = "confirmed"
    _write_index(rows)
    return _public(match)


def documents_for_formula(formula: dict) -> list[dict]:
    wanted = set(formula.get("document_ids") or [])
    formula_id = formula.get("formula_id")
    version_id = formula.get("version_id")
    regions = set(formula.get("regions") or [])
    materials = {row.get("material_id") for row in formula.get("ingredients") or []}
    selected = []
    for row in _read_index():
        linked = row["document_id"] in wanted
        same_formula = formula_id and row.get("formula_id") == formula_id and row.get("version_id") in {None, version_id}
        same_material = row.get("material_id") in materials
        region_ok = not row.get("regions") or bool(regions.intersection(row.get("regions") or []))
        if (linked or same_formula or same_material) and region_ok:
            selected.append(_public(row))
    return selected


def file_for(document_id: str) -> Path | None:
    row = get_upload(document_id)
    if not row or row.get("storage") != "filesystem":
        return None
    path = (storage_dir() / Path(row["stored_name"]).name).resolve()
    folder = storage_dir().resolve()
    if folder not in path.parents or not path.is_file():
        return None
    return path


def _public(row: dict) -> dict:
    hidden = {"url"}
    payload = {key: value for key, value in row.items() if key not in hidden}
    payload["filename"] = row.get("original_filename")
    return payload
