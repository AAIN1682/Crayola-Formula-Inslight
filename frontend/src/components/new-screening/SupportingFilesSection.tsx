import { useRef, useState } from 'react';
import type { CompositionRow, NewScreeningDraft, UploadedFileRow } from '../../types/newScreening';
import {
  linkUploadToIngredient,
  parseAcmiTemplate,
  uploadScreeningDocument,
} from '../../api/newScreeningApi';

export function SupportingFilesSection({
  draft,
  onChange,
  onLinkIngredient,
  onApplyComposition,
}: {
  draft: NewScreeningDraft;
  onChange: (files: UploadedFileRow[]) => void;
  onLinkIngredient: (key: string, update: Partial<CompositionRow>) => void;
  onApplyComposition: (rows: CompositionRow[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ message: string; rows: { name: string; cas: string; pct: number; supplier: string }[] }>();
  const [dragOver, setDragOver] = useState(false);

  const setFiles = (files: UploadedFileRow[]) => onChange(files);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      const row: UploadedFileRow = {
        id: `local-${crypto.randomUUID()}`,
        name: file.name,
        kind: lower.endsWith('.xlsx') ? 'xlsx' : lower.endsWith('.pdf') ? 'pdf' : 'other',
        documentType: lower.endsWith('.xlsx') ? 'acmi_template' : 'other',
        status: 'uploading',
      };
      const next = [...draft.files, row];
      setFiles(next);
      try {
        if (row.kind === 'xlsx') {
          const parsed = await parseAcmiTemplate(file);
          setPreview({ message: parsed.message, rows: parsed.rows });
          setFiles(next.map((item) => (item.id === row.id ? { ...item, status: 'ready' as const } : item)));
          continue;
        }
        if (row.kind === 'pdf') {
          const uploaded = await uploadScreeningDocument(file, 'sds', 'material');
          const linkedKey = matchIngredientKey(draft.ingredients, file.name);
          const docType = inferDocType(file.name);
          const ready = { ...row, status: 'ready' as const, documentId: uploaded.document_id, documentType: docType };
          setFiles(next.map((item) => (item.id === row.id ? ready : item)));
          if (linkedKey && uploaded.document_id) {
            void linkUploadToIngredient(uploaded.document_id, linkedKey, docType);
            syncIngredientDocs(linkedKey, docType, uploaded.document_id, onLinkIngredient);
          }
          continue;
        }
        setFiles(next.map((item) => (item.id === row.id ? { ...item, status: 'error', error: 'Only .xlsx and .pdf files are accepted.' } : item)));
      } catch (error) {
        setFiles(
          next.map((item) =>
            item.id === row.id
              ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed.' }
              : item,
          ),
        );
      }
    }
  };

  const fileTag = (file: UploadedFileRow) => {
    if (file.documentType === 'acmi_template') return 'ACMI template';
    if (file.documentType === 'sds') return 'SDS';
    if (file.documentType === 'coa') return 'CoA';
    if (file.documentType === 'lab_report') return 'Lab report';
    return file.kind === 'xlsx' ? 'Spreadsheet' : 'PDF';
  };

  return (
    <section className="ps-panel" aria-labelledby="ps-files-heading">
      <div className="ps-panel-head">
        <h2 id="ps-files-heading">
          <span className="ps-sn">3</span>
          Supporting files
        </h2>
        <p className="ps-panel-sub">
          The ACMI template, safety data sheets, certificates of analysis and lab reports.
        </p>
      </div>
      <label
        className={`ps-drop ${dragOver ? 'ps-over' : ''}`}
        htmlFor="ps-file-input"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id="ps-file-input"
          type="file"
          className="sr-only"
          accept=".xlsx,.pdf,application/pdf"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <b>Drop files here or browse</b>
        <span className="ps-small">.xlsx template, SDS and CoA PDFs, lab reports</span>
      </label>

      {preview ? (
        <div className="rounded-md border border-[var(--ps-line)] bg-[var(--ps-accent-soft)] px-3 py-2 text-[13px]">
          <p>{preview.message}</p>
          {preview.rows.length > 0 ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="ps-btn ps-btn-primary"
                onClick={() => {
                  onApplyComposition(
                    preview.rows.map((row) => ({
                      key: crypto.randomUUID(),
                      custom: true,
                      name: row.name,
                      cas: row.cas,
                      functionLabel: '-',
                      pct: String(row.pct),
                      supplier: row.supplier,
                      sdsAvailable: false,
                      coaAvailable: false,
                      documentIds: [],
                    })),
                  );
                  setPreview(undefined);
                }}
              >
                Apply
              </button>
              <button type="button" className="ps-btn" onClick={() => setPreview(undefined)}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft.files.length > 0 ? (
        <ul className="ps-files">
          {draft.files.map((file) => (
            <li key={file.id}>
              <span className="ps-mono">{file.name}</span>
              <span className="ps-tag">{fileTag(file)}</span>
              {file.error ? <span className="text-xs text-red-600">{file.error}</span> : null}
              {file.kind === 'pdf' ? (
                <select
                  className="ps-in"
                  style={{ width: 'auto', maxWidth: 180, height: 32 }}
                  aria-label={`Link ${file.name} to ingredient`}
                  defaultValue=""
                  onChange={(event) => {
                    const key = event.target.value;
                    if (!key || !file.documentId) return;
                    const docType = inferDocType(file.name);
                    void linkUploadToIngredient(file.documentId, key, docType);
                    syncIngredientDocs(key, docType, file.documentId, onLinkIngredient);
                  }}
                >
                  <option value="">Link to ingredient…</option>
                  {draft.ingredients.map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="ps-icon-btn"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles(draft.files.filter((item) => item.id !== file.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function inferDocType(filename: string): 'sds' | 'coa' {
  const lower = filename.toLowerCase();
  if (lower.includes('coa') || lower.includes('certificate')) return 'coa';
  return 'sds';
}

function matchIngredientKey(rows: CompositionRow[], filename: string): string | undefined {
  const lower = filename.toLowerCase();
  return rows.find((row) => {
    if (row.name && lower.includes(row.name.toLowerCase())) return true;
    if (row.cas && row.cas !== '-' && lower.includes(row.cas.replace(/-/g, ''))) return true;
    if (row.cas && row.cas !== '-' && lower.includes(row.cas.toLowerCase())) return true;
    return false;
  })?.key;
}

function syncIngredientDocs(
  key: string,
  docType: 'sds' | 'coa',
  documentId: string,
  onLinkIngredient: (key: string, update: Partial<CompositionRow>) => void,
) {
  onLinkIngredient(key, {
    ...(docType === 'sds' ? { sdsAvailable: true } : { coaAvailable: true }),
    documentIds: [documentId],
  });
}

