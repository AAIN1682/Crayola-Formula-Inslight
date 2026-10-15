import { ChevronRight } from 'lucide-react';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Table, TBody, Td, Th, THead, TableScroll, Tr } from '../components/ui/Table';

type SourceStatus = 'sample' | 'license' | 'client' | 'templated';

interface PipelineStep {
  id: string;
  kicker: string;
  title: string;
  body: string;
  muted?: boolean;
}

interface SourceRow {
  id: string;
  step: string;
  source: string;
  href?: string;
  usedFor: string;
  status: SourceStatus;
}

const STEPS: PipelineStep[] = [
  {
    id: 'input',
    kicker: 'Input',
    title: 'Formula',
    body: 'Same fields as the ACMI submission template: composition, CAS numbers, suppliers, age grade, intended use.',
    muted: true,
  },
  {
    id: 'rules',
    kicker: 'Step 1',
    title: 'Rule checks',
    body: 'Fixed checks against public lists and limits. Every flag names its source.',
  },
  {
    id: 'exposure',
    kicker: 'Step 2',
    title: 'Exposure',
    body: 'Worst-case daily dose for a young child, compared with published safe doses.',
  },
  {
    id: 'history',
    kicker: 'Step 3',
    title: 'Past decisions',
    body: 'Similar formulas and what the reviewer decided. Calibrates the likelihood score.',
  },
  {
    id: 'explain',
    kicker: 'Step 4',
    title: 'Reasons and fixes',
    body: 'Plain-English explanation. Fixes use only ingredients accepted before.',
  },
];

const SOURCES: SourceRow[] = [
  {
    id: 'echa',
    step: '1 · Rules',
    source: 'ECHA C&L Inventory (EU CLP classifications)',
    href: 'https://echa.europa.eu/information-on-chemicals/cl-inventory-database',
    usedFor: 'Sensitizer and CMR classes',
    status: 'sample',
  },
  {
    id: 'iarc',
    step: '1 · Rules',
    source: 'IARC Monographs classifications',
    href: 'https://monographs.iarc.who.int/list-of-classifications',
    usedFor: 'Carcinogen groups',
    status: 'sample',
  },
  {
    id: 'prop65',
    step: '1 · Rules',
    source: 'California Prop 65 list',
    href: 'https://oehha.ca.gov/proposition-65/proposition-65-list',
    usedFor: 'Listed chemicals',
    status: 'sample',
  },
  {
    id: 'cpsia',
    step: '1 · Rules',
    source: 'CPSIA art-material and CPSIA requirements',
    href: 'https://www.cpsc.gov/Regulations-Laws--Standards/Statutes/The-Consumer-Product-Safety-Improvement-Act',
    usedFor: 'Lead limits, LHAMA labeling rules',
    status: 'sample',
  },
  {
    id: 'astm',
    step: '1 · Rules',
    source: 'ASTM D4236, D5517, F963',
    href: 'https://www.astm.org/',
    usedFor: 'Chronic hazard practice, metal extraction, toy heavy elements',
    status: 'license',
  },
  {
    id: 'comptox',
    step: '2 · Exposure',
    source: 'EPA CompTox Dashboard and ToxValDB',
    href: 'https://comptox.epa.gov/dashboard/',
    usedFor: 'Safe-dose values for exposure margins',
    status: 'sample',
  },
  {
    id: 'pubchem',
    step: '2 · Exposure',
    source: 'PubChem',
    href: 'https://pubchem.ncbi.nlm.nih.gov/',
    usedFor: 'CAS lookup and identity checks',
    status: 'sample',
  },
  {
    id: 'acmi',
    step: '3 · History',
    source: 'Past ACMI submissions and toxicologist letters',
    usedFor: 'Accepted levels, similar formulas, likelihood model',
    status: 'client',
  },
  {
    id: 'sds',
    step: '3 · History',
    source: 'Raw-material library with SDS and CoA',
    usedFor: 'Approved substitutes, supplier documents',
    status: 'client',
  },
  {
    id: 'llm',
    step: '4 · Explain',
    source: 'Language model with retrieval over rules and letters',
    usedFor: 'Plain-English reasons, questions and answers',
    status: 'templated',
  },
];

const STATUS_BADGE: Record<SourceStatus, { label: string; tone: BadgeTone }> = {
  sample: { label: 'Sample data', tone: 'info' },
  license: { label: 'Needs license', tone: 'warning' },
  client: { label: 'Needs client data', tone: 'warning' },
  templated: { label: 'Templated answers', tone: 'accent' },
};

export function DataSourcesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Data sources</p>
        <h1 className="mt-1 text-[28px] leading-9 font-semibold tracking-tight text-navy-800">
          What powers each step
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          This prototype runs on sample data. Each step below shows the real source your build team will connect.
        </p>
      </div>

      <ol className="flex flex-col gap-3 md:grid md:grid-cols-2 xl:flex xl:flex-row xl:items-stretch">
        {STEPS.map((step, index) => (
          <li key={step.id} className="flex min-w-0 flex-1 items-stretch gap-3">
            <article
              className={`flex min-w-0 flex-1 flex-col rounded-panel border p-4 shadow-card ${
                step.muted ? 'border-line bg-canvas' : 'border-line bg-white'
              }`}
            >
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{step.kicker}</p>
              <h2 className="mt-1 text-[15px] leading-6 font-semibold text-navy-800">{step.title}</h2>
              <p className="mt-2 text-[13px] leading-5 text-muted">{step.body}</p>
            </article>
            {index < STEPS.length - 1 ? (
              <ChevronRight aria-hidden className="hidden size-4 shrink-0 self-center text-subtle xl:block" />
            ) : null}
          </li>
        ))}
      </ol>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] leading-6 font-semibold text-ink">Sources</h2>
        </div>
        <TableScroll minWidth="min-w-[720px]">
          <Table caption="Data sources used by each assessment step">
            <THead>
              <Tr>
                <Th>Step</Th>
                <Th>Source</Th>
                <Th>Used for</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {SOURCES.map((row) => {
                const badge = STATUS_BADGE[row.status];
                return (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-muted">{row.step}</Td>
                    <Td>
                      {row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-500 underline decoration-brand-200 underline-offset-2 hover:text-brand-600"
                        >
                          {row.source}
                        </a>
                      ) : (
                        <span className="font-medium text-ink">{row.source}</span>
                      )}
                    </Td>
                    <Td>{row.usedFor}</Td>
                    <Td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableScroll>
      </Card>
    </div>
  );
}
