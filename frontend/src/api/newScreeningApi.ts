export async function parseAcmiTemplate(file: File): Promise<{
  layoutMatched: boolean;
  message: string;
  rows: { name: string; cas: string; pct: number; supplier: string }[];
}> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/screening/parse-acmi-template', { method: 'POST', body });
  const payload = (await response.json()) as {
    layoutMatched?: boolean;
    message?: string;
    rows?: { name: string; cas: string; pct: number; supplier: string }[];
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || 'Template could not be parsed.');
  }
  return {
    layoutMatched: Boolean(payload.layoutMatched),
    message: payload.message || 'Layout not recognized.',
    rows: payload.rows ?? [],
  };
}

export async function uploadScreeningDocument(
  file: File,
  documentType: string,
  scope: string,
): Promise<{ document_id: string }> {
  const body = new FormData();
  body.append('file', file);
  body.append('document_type', documentType);
  body.append('scope', scope);
  const response = await fetch('/api/documents', { method: 'POST', body });
  const payload = (await response.json()) as { document_id?: string; detail?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || 'Upload failed.');
  }
  if (!payload.document_id) throw new Error('Upload did not return a document id.');
  return { document_id: payload.document_id };
}

export async function linkUploadToIngredient(
  documentId: string,
  ingredientKey: string,
  documentType: 'sds' | 'coa',
): Promise<void> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/link-ingredient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredient_key: ingredientKey, document_type: documentType }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail || 'Could not link document to ingredient.');
  }
}
