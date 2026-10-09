import { useRef, useState } from 'react';
import type { Formula } from '../../types/domain';
import { Button } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Field';
import { Notice } from '../ui/DemoNotice';
import { Drawer } from '../ui/Drawer';

const DOCUMENT_TYPES = [
  { value: 'sds', label: 'Safety Data Sheet (SDS)' },
  { value: 'coa', label: 'Certificate of Analysis (CoA)' },
  { value: 'lab_report', label: 'Laboratory Test Report' },
  { value: 'label', label: 'Product Label / Warning Information' },
  { value: 'other', label: 'Other Supporting Document' },
];

interface ExtractedField {
  field_id: string;
  name: string;
  value: string;
  page?: number | null;
  bound?: string;
  unit?: string | null;
  column_role?: string;
  review_status?: string;
}

interface UploadedDocument {
  document_id: string;
  original_filename?: string;
  extraction_status?: string;
  ocr_message?: string | null;
  review_status?: string;
  authenticity_status?: string;
  applicability_status?: string;
  extracted_fields?: ExtractedField[];
  batch_id?: string | null;
}

export function DocumentUploadPanel({ formula }: { formula: Formula }) {
  const [documentType, setDocumentType] = useState('coa');
  const [scope, setScope] = useState('material');
  const [materialId, setMaterialId] = useState(formula.ingredients.find((item) => item.rawMaterialId)?.rawMaterialId ?? '');
  const [supplier, setSupplier] = useState('');
  const [grade, setGrade] = useState('');
  const [batchId, setBatchId] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<UploadedDocument[]>([]);
  const [review, setReview] = useState<UploadedDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const materials = formula.ingredients.filter((item) => item.rawMaterialId);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setPending(true);
    setError(undefined);
    try {
      const saved: UploadedDocument[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set('file', file);
        body.set('document_type', documentType);
        body.set('scope', scope);
        if (materialId) body.set('material_id', materialId);
        if (supplier.trim()) body.set('supplier', supplier.trim());
        if (grade.trim()) body.set('grade', grade.trim());
        if (batchId.trim()) body.set('batch_id', batchId.trim());
        body.set('formula_id', formula.id);
        body.set('version_id', formula.version);
        body.set('regions', formula.targetMarkets.filter((market) => market === 'US' || market === 'EU').join(','));
        const response = await fetch('/api/documents', { method: 'POST', body });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = payload.detail;
          throw new Error(typeof detail === 'string' ? detail : 'The document was not saved.');
        }
        saved.push(payload as UploadedDocument);
      }
      setUploads((current) => [...saved, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document was not saved.');
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    if (!review) return;
    const response = await fetch(`/api/documents/${review.document_id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corrections: (review.extracted_fields ?? []).map((field) => ({
          field_id: field.field_id,
          value: field.value,
          bound: field.bound,
        })),
      }),
    });
    if (!response.ok) {
      setError('The review could not be saved.');
      return;
    }
    const updated = (await response.json()) as UploadedDocument;
    setUploads((current) => current.map((item) => (item.document_id === updated.document_id ? updated : item)));
    setReview(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Upload supporting documents</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          PDF files are stored and extracted. Extraction does not establish authenticity or applicability. A document that is already on file for the same material and batch can be reused.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Document type">
          <Select value={documentType} options={DOCUMENT_TYPES} onChange={(event) => setDocumentType(event.target.value)} />
        </Field>
        <Field label="Scope">
          <Select
            value={scope}
            options={[
              { value: 'material', label: 'Material' },
              { value: 'finished_product', label: 'Finished product' },
            ]}
            onChange={(event) => setScope(event.target.value)}
          />
        </Field>
        <Field label="Material">
          <Select
            value={materialId}
            placeholder="Formula level"
            options={materials.map((item) => ({ value: item.rawMaterialId ?? '', label: item.name }))}
            onChange={(event) => setMaterialId(event.target.value)}
          />
        </Field>
        <Field label="Batch" hint="Required for a CoA that should match a selected batch. A new batch identifier can be typed.">
          <TextInput value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="Batch or lot" />
        </Field>
        <Field label="Supplier">
          <TextInput value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Grade">
          <TextInput value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        disabled={pending}
        onChange={(event) => {
          void upload(event.target.files);
          event.target.value = '';
        }}
      />
      <Button type="button" disabled={pending} onClick={() => fileInput.current?.click()}>
        {pending ? 'Saving…' : 'Choose PDFs'}
      </Button>
      {error ? <Notice tone="danger" title="Upload was not saved">{error}</Notice> : null}
      <ul className="space-y-2">
        {uploads.map((item) => (
          <li key={item.document_id} className="rounded-lg border border-line px-3 py-2 text-[13px]">
            <p className="font-medium text-ink">{item.original_filename} · {item.document_id}</p>
            <p className="text-xs text-muted">
              Extraction {item.extraction_status}. Review {item.review_status}. Authenticity {item.authenticity_status}. Applicability {item.applicability_status}.
              {item.ocr_message ? ` ${item.ocr_message}.` : ''}
            </p>
            <button type="button" className="mt-1 text-xs font-medium text-brand-600" onClick={() => setReview(item)}>
              Review extracted fields
            </button>
          </li>
        ))}
      </ul>
      <Drawer open={Boolean(review)} onClose={() => setReview(null)} title="Extracted fields" subtitle={review?.document_id}>
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted">
            Confirm or correct extracted values. A less-than result stays a bound. Specification columns are not treated as measured results.
          </p>
          {(review?.extracted_fields ?? []).length === 0 ? (
            <p className="text-sm text-muted">{review?.ocr_message || 'No fields were extracted.'}</p>
          ) : (
            review?.extracted_fields?.map((field, index) => (
              <Field key={field.field_id} label={`${field.name}${field.page ? ` · page ${field.page}` : ''}${field.column_role && field.column_role !== 'unknown' ? ` · ${field.column_role}` : ''}`}>
                <TextInput
                  value={field.value}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReview((current) => current && ({
                      ...current,
                      extracted_fields: current.extracted_fields?.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item),
                    }));
                  }}
                />
              </Field>
            ))
          )}
          <Button onClick={() => void confirm()} disabled={!review?.extracted_fields?.length}>Confirm corrections</Button>
        </div>
      </Drawer>
    </div>
  );
}
