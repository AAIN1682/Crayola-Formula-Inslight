import { Link } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import { buildDocumentPreview, PREVIEW_DISCLAIMER } from '../../data/documents';
import { useDemoSelector } from '../../state/DemoDataProvider';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { DocumentStatusBadge } from '../ui/Badge';
import { Notice } from '../ui/DemoNotice';
import { formatBytes, formatDate } from '../../utils/formatting';

export function DocumentPreviewDrawer({
  documentId,
  onClose,
}: {
  documentId?: string;
  onClose: () => void;
}) {
  const document = useDemoSelector((state) =>
    state.documents.find((item) => item.id === documentId),
  );
  const material = useDemoSelector((state) =>
    state.rawMaterials.find((item) => item.id === document?.rawMaterialId),
  );
  const formula = useDemoSelector((state) =>
    state.formulas.find((item) => item.id === document?.formulaId),
  );

  if (!document) return null;

  const preview = buildDocumentPreview(document, material, formula);

  return (
    <Drawer
      open={Boolean(documentId)}
      onClose={onClose}
      width="lg"
      eyebrow={document.type}
      title={document.title}
      subtitle={`${document.id} · recorded ${formatDate(document.issuedDate)}`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentStatusBadge status={document.status} />
          {material ? (
            <Link to={`/materials/${material.id}`} className="fi-link text-[13px]">
              {material.id} · {material.name}
            </Link>
          ) : null}
          {formula ? (
            <Link to={`/formulas/${formula.id}`} className="fi-link text-[13px]">
              {formula.id} · {formula.name}
            </Link>
          ) : null}
        </div>

        {document.localAttachment ? (
          <Notice tone="info" title="Local demo attachment — content not analyzed" icon={<Paperclip aria-hidden className="size-4" />}>
            {document.localAttachment.filename} · {formatBytes(document.localAttachment.sizeBytes)} ·{' '}
            {document.localAttachment.mimeType || 'unknown type'}. Only the filename, size and type were
            recorded in this browser. The file was not read, uploaded or stored anywhere.
          </Notice>
        ) : null}

        <article className="rounded-panel border border-line bg-canvas/50">
          <header className="border-b border-line px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{document.type}</p>
            <h3 className="mt-0.5 text-base font-semibold text-navy-800">{preview.title}</h3>
            <p className="mt-1 text-xs text-muted">
              {preview.issuedBy} · {preview.issuedOn} · reference {preview.reference}
            </p>
          </header>

          <div className="space-y-5 px-5 py-4">
            {preview.sections.map((section) => (
              <section key={section.heading}>
                <h4 className="text-[13px] font-semibold text-ink">{section.heading}</h4>
                {section.body ? (
                  <p className="mt-1.5 text-[13px] leading-6 text-muted">{section.body}</p>
                ) : null}
                {section.rows ? (
                  <dl className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                    {section.rows.map((row) => (
                      <div key={row.label} className="flex flex-wrap gap-2 px-3 py-2">
                        <dt className="w-48 shrink-0 text-xs text-muted">{row.label}</dt>
                        <dd className="min-w-0 flex-1 text-[13px] text-ink">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {section.bullets ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-6 text-muted">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>

        <p className="text-xs leading-5 text-subtle">{PREVIEW_DISCLAIMER}</p>
      </div>
    </Drawer>
  );
}
