import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Paperclip } from 'lucide-react';
import { useFormulaDetail } from '../FormulaDetailsPage';
import { useServices } from '../../state/DemoDataProvider';
import { useAsyncAction } from '../../hooks/useAsyncData';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, DocumentStatusBadge } from '../../components/ui/Badge';
import { TBody, Table, TableScroll, Td, Th, THead, Tr } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/States';
import { Notice } from '../../components/ui/DemoNotice';
import { useToast } from '../../components/ui/Toast';
import { DocumentPreviewDrawer } from '../../components/evidence/DocumentPreviewDrawer';
import { DocumentUploadPanel } from '../../components/evidence/DocumentUploadPanel';
import { AttachmentButton } from '../../components/evidence/AttachmentButton';
import { formatBytes, formatDate } from '../../utils/formatting';

export function EvidenceTab() {
  const detail = useFormulaDetail();
  const services = useServices();
  const toast = useToast();
  const [previewId, setPreviewId] = useState<string | undefined>();

  const { formula, documents, evidence } = detail;
  const outstanding = evidence.requirements.filter((requirement) => !requirement.satisfied);

  const attachToDocument = useAsyncAction(
    async (documentId: string, attachment: Parameters<typeof services.attachLocalFile>[0]['attachment']) => {
      await services.attachLocalFile({ documentId, attachment });
      toast.success('Attachment recorded', `${attachment.filename} — content not analyzed.`);
    },
  );

  const fulfilRequirement = useAsyncAction(
    async (
      requirement: (typeof outstanding)[number],
      attachment: Parameters<typeof services.attachLocalFile>[0]['attachment'],
    ) => {
      await services.attachLocalFile({
        create: {
          title: `${requirement.documentType} — ${requirement.ingredientName}`,
          type: requirement.documentType,
          rawMaterialId: requirement.rawMaterialId,
          formulaId: formula.id,
        },
        attachment,
      });
      toast.success(
        'Document recorded',
        'Screening currency was cleared for the affected formulas. Run screening again to refresh the result.',
      );
    },
  );

  return (
    <div className="space-y-4">
      <DocumentUploadPanel formula={formula} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Documents on file"
            description={`${documents.length} records linked to this formula or to its raw materials.`}
          />
          {documents.length === 0 ? (
            <EmptyState
              title="No documents linked yet"
              message="Supplier documents are resolved from each ingredient's raw-material reference. Formula-level documents can be linked from the Edit drawer."
            />
          ) : (
            <TableScroll>
              <Table caption={`Evidence documents for ${formula.name}`}>
                <THead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Type</Th>
                    <Th>Linked to</Th>
                    <Th>Date</Th>
                    <Th>Availability</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {documents.map((document) => (
                    <Tr key={document.id}>
                      <Td>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{document.title}</p>
                          <p className="truncate text-xs text-muted tabular">{document.id}</p>
                          {document.localAttachment ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-500">
                              <Paperclip aria-hidden className="size-3" />
                              Local demo attachment — content not analyzed ·{' '}
                              {document.localAttachment.filename} (
                              {formatBytes(document.localAttachment.sizeBytes)})
                            </p>
                          ) : null}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{document.type}</Td>
                      <Td>
                        {document.rawMaterialId ? (
                          <Link to={`/materials/${document.rawMaterialId}`} className="fi-link tabular">
                            {document.rawMaterialId}
                          </Link>
                        ) : document.submissionId ? (
                          <Link to={`/submissions/${document.submissionId}`} className="fi-link tabular">
                            {document.submissionId}
                          </Link>
                        ) : (
                          <span className="text-muted">Formula level</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted tabular">{formatDate(document.issuedDate)}</Td>
                      <Td>
                        <DocumentStatusBadge status={document.status} />
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setPreviewId(document.id)}>
                            <Eye aria-hidden className="size-4" />
                            Preview
                          </Button>
                          <AttachmentButton
                            label="Attach"
                            variant="ghost"
                            pending={attachToDocument.pending}
                            onSelect={(attachment) => void attachToDocument.run(document.id, attachment)}
                          />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Outstanding requirements"
            description={`${evidence.presentCount} of ${evidence.requiredCount} required documents are on file.`}
          />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-soft">
                <div
                  className={evidence.completeness === 100 ? 'h-full bg-success' : 'h-full bg-warning'}
                  style={{ width: `${evidence.completeness}%` }}
                />
              </div>
              <span className="text-[13px] font-semibold text-ink tabular">{evidence.completeness}%</span>
            </div>

            {outstanding.length === 0 ? (
              <Notice tone="success" title="All required documents are on file">
                The demo evidence checks found nothing outstanding for this composition.
              </Notice>
            ) : (
              <ul className="space-y-2.5">
                {outstanding.map((requirement) => (
                  <li key={requirement.id} className="rounded-lg border border-warning-line bg-warning-soft/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink">{requirement.documentType}</p>
                        <p className="text-xs text-muted">{requirement.ingredientName}</p>
                      </div>
                      {requirement.rawMaterialId ? (
                        <Badge tone="neutral">{requirement.rawMaterialId}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-muted">{requirement.reason}</p>
                    {requirement.rawMaterialId ? (
                      <div className="mt-2">
                        <AttachmentButton
                          label="Record local file"
                          pending={fulfilRequirement.pending}
                          onSelect={(attachment) => void fulfilRequirement.run(requirement, attachment)}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Notice tone="neutral" title="How attachments work in this demo">
        Selecting a file records its name, size and type in this browser only. The file is never read,
        uploaded or analyzed. Recording a document satisfies the demo evidence check that a document of that
        type exists — it says nothing about the document&rsquo;s contents.
      </Notice>

      <DocumentPreviewDrawer documentId={previewId} onClose={() => setPreviewId(undefined)} />
    </div>
  );
}
