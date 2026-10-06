import type { EvidenceDocument, Formula, RawMaterial } from '../types/domain';
import { formatDate } from '../utils/formatting';

/**
 * Readable synthetic previews for the demo document library.
 *
 * Nothing here is a real safety data sheet, certificate or test report. The content is
 * generated from the demo records so a reviewer can see the shape of each document type.
 */

export interface PreviewRow {
  label: string;
  value: string;
}

export interface PreviewSection {
  heading: string;
  body?: string;
  rows?: PreviewRow[];
  bullets?: string[];
}

export interface DocumentPreview {
  title: string;
  reference: string;
  issuedBy: string;
  issuedOn: string;
  sections: PreviewSection[];
}

export const PREVIEW_DISCLAIMER =
  'Synthetic demo document. The content is generated from the demo dataset and does not describe a real material, batch or test.';

function sdsPreview(document: EvidenceDocument, material?: RawMaterial): PreviewSection[] {
  return [
    {
      heading: '1 · Identification',
      rows: [
        { label: 'Material name', value: material?.name ?? document.title },
        { label: 'Material reference', value: material?.id ?? '—' },
        { label: 'Supplier', value: document.supplier ?? material?.supplier ?? '—' },
        { label: 'Functional role', value: material?.role ?? '—' },
        { label: 'Recommended use', value: 'Component of water-based or wax-based craft products' },
      ],
    },
    {
      heading: '2 · Composition information',
      body: `Supplied as a single-component ${material?.role.toLowerCase() ?? 'material'}. The supplier declares the composition as proprietary within this synthetic record; component identities are withheld for the demo.`,
    },
    {
      heading: '4 · First-aid measures',
      bullets: [
        'Skin contact — rinse with water. Seek advice if irritation persists.',
        'Eye contact — rinse cautiously with water for several minutes.',
        'Ingestion — rinse mouth. Do not induce vomiting. Seek advice.',
      ],
    },
    {
      heading: '7 · Handling and storage',
      rows: [
        { label: 'Storage temperature', value: '5 °C to 30 °C' },
        { label: 'Container', value: 'Keep tightly closed in the original container' },
        { label: 'Incompatibilities', value: 'Strong oxidising agents' },
      ],
    },
    {
      heading: '9 · Physical and chemical properties',
      rows: [
        { label: 'Appearance', value: 'As described in the supplier specification' },
        { label: 'Odour', value: 'Characteristic' },
        { label: 'pH (as supplied)', value: '6.5 – 8.0' },
        { label: 'Solubility in water', value: 'Dispersible' },
      ],
    },
    {
      heading: '16 · Other information',
      body: `Revision recorded in the demo workspace on ${formatDate(document.issuedDate)}. Status in this workspace: ${document.status}.`,
    },
  ];
}

function coaPreview(document: EvidenceDocument, material?: RawMaterial): PreviewSection[] {
  const batch = `B-${(material?.id ?? 'RM-000').replace('RM-', '')}-${formatDate(document.issuedDate).replace(/\s/g, '')}`;
  return [
    {
      heading: 'Batch identification',
      rows: [
        { label: 'Material', value: material?.name ?? document.title },
        { label: 'Material reference', value: material?.id ?? '—' },
        { label: 'Batch reference', value: batch },
        { label: 'Supplier', value: document.supplier ?? '—' },
        { label: 'Date of analysis', value: formatDate(document.issuedDate) },
      ],
    },
    {
      heading: 'Test results (illustrative)',
      rows: [
        { label: 'Appearance', value: 'Conforms to specification' },
        { label: 'Assay', value: '98.4% (specification 97.0 – 100.0%)' },
        { label: 'Moisture content', value: '0.6% (specification ≤ 1.0%)' },
        { label: 'pH, 10% dispersion', value: '7.2 (specification 6.5 – 8.0)' },
        { label: 'Residue on sieve', value: '0.01% (specification ≤ 0.05%)' },
      ],
    },
    {
      heading: 'Declaration',
      body: 'The batch described above conforms to the agreed specification for the demo dataset. This declaration is synthetic and is provided to illustrate the structure of a certificate of analysis.',
    },
  ];
}

function labPreview(
  document: EvidenceDocument,
  material?: RawMaterial,
  formula?: Formula,
): PreviewSection[] {
  const subject = material?.name ?? formula?.name ?? document.title;
  return [
    {
      heading: 'Study summary',
      rows: [
        { label: 'Subject', value: subject },
        { label: 'Reference', value: document.id },
        { label: 'Study type', value: 'Internal demo study' },
        { label: 'Reported on', value: formatDate(document.issuedDate) },
      ],
    },
    {
      heading: 'Scope',
      body: document.summary,
    },
    {
      heading: 'Recorded observations (illustrative)',
      rows: [
        { label: 'Replicates', value: '3' },
        { label: 'Observation window', value: '12 weeks' },
        { label: 'Result variance', value: 'Within the pre-agreed demo tolerance' },
        { label: 'Deviations', value: 'None recorded' },
      ],
    },
    {
      heading: 'Interpretation',
      body: 'The observations are recorded for demonstration purposes only. They are not a safety assessment and do not support any claim about the material or finished product.',
    },
  ];
}

function correspondencePreview(document: EvidenceDocument): PreviewSection[] {
  return [
    {
      heading: 'Message',
      rows: [
        { label: 'Reference', value: document.submissionId ?? document.id },
        { label: 'Recorded on', value: formatDate(document.issuedDate) },
      ],
    },
    {
      heading: 'Body',
      body: document.summary,
    },
    {
      heading: 'Note',
      body: 'Synthetic correspondence generated for the demo history. No message was sent or received.',
    },
  ];
}

export function buildDocumentPreview(
  document: EvidenceDocument,
  material?: RawMaterial,
  formula?: Formula,
): DocumentPreview {
  let sections: PreviewSection[];
  switch (document.type) {
    case 'SDS':
      sections = sdsPreview(document, material);
      break;
    case 'Certificate of Analysis':
      sections = coaPreview(document, material);
      break;
    case 'Laboratory Report':
      sections = labPreview(document, material, formula);
      break;
    default:
      sections = correspondencePreview(document);
      break;
  }

  return {
    title: document.title,
    reference: document.id,
    issuedBy: document.supplier ?? 'Crayola · Product Safety (demo)',
    issuedOn: formatDate(document.issuedDate),
    sections,
  };
}
