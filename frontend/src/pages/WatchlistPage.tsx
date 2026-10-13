import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';

type Impact = 'High impact' | 'Medium impact';
type ScoreTone = 'neutral' | 'good' | 'poor';

interface WatchFormula {
  code: string;
  name?: string;
  score?: number;
  tone?: ScoreTone;
}

interface WatchItem {
  id: string;
  impact: Impact;
  source: string;
  title: string;
  detail: string;
  pipeline: WatchFormula[];
  approved: WatchFormula[];
  affectedCount: number;
}

const WATCHLIST: WatchItem[] = [
  {
    id: 'talc-iarc',
    impact: 'High impact',
    source: 'Science update · IARC · Jul 2024 · Monographs vol. 136',
    title: 'Talc is now classified as probably carcinogenic to humans (Group 2A)',
    detail:
      'Formulas with talc need an asbestos-free certificate on file before review. Every formula that uses talc was checked again.',
    pipeline: [
      { code: 'CL-0037', score: 70, tone: 'neutral' },
      { code: 'PC-1192', score: 89, tone: 'good' },
    ],
    approved: [
      { code: 'CL-0611', name: 'Modeling Dough – Brights' },
      { code: 'PC-0940', name: 'Watercolor Pencil Set – 12' },
      { code: 'CH-0412', name: 'Classic Crayon base' },
    ],
    affectedCount: 5,
  },
  {
    id: 'eu-fragrance',
    impact: 'Medium impact',
    source: 'Regulation · EU · Transition period running',
    title: 'EU toy rules tighten fragrance allergens and restrict PFAS',
    detail:
      'Scented products sold in the EU need full fragrance disclosure. One formula in the pipeline and one approved formula are affected.',
    pipeline: [{ code: 'FX-2230', score: 49, tone: 'poor' }],
    approved: [{ code: 'FX-1650', name: 'Scented Marker – Mixed Berry' }],
    affectedCount: 2,
  },
  {
    id: 'five-year-review',
    impact: 'Medium impact',
    source: 'Re-review due · ACMI · Next 90 days',
    title: '12 approved formulas reach their 5-year toxicologist review',
    detail: 'Pre-screen them against current rules before the review, so nothing comes back as a surprise.',
    pipeline: [],
    approved: [
      { code: 'MK-0881', name: 'Classic Marker – Black' },
      { code: 'CR-4410', name: 'Crayon Tin – 24' },
      { code: 'PD-2104', name: 'Poster Dough – Primary' },
    ],
    affectedCount: 12,
  },
];

function impactClass(impact: Impact): string {
  if (impact === 'High impact') return 'bg-[#fde2e4] text-[#b42318]';
  return 'bg-[#fdecc8] text-[#9a6700]';
}

function scoreClass(tone: ScoreTone = 'neutral'): string {
  if (tone === 'good') return 'bg-[#d8f3dc] text-[#1b7f4a]';
  if (tone === 'poor') return 'bg-[#fde2e4] text-[#b42318]';
  return 'bg-neutral-soft text-ink';
}

function scoreDot(tone: ScoreTone = 'neutral'): string {
  if (tone === 'good') return 'bg-[#1b7f4a]';
  if (tone === 'poor') return 'bg-[#b42318]';
  return 'bg-slate-400';
}

export function WatchlistPage() {
  const toast = useToast();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Watchlist</p>
        <h1 className="mt-1 text-[28px] leading-9 font-semibold tracking-tight text-navy-800">
          What changed since your formulas were approved
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Safety lists, regulations, and review dates are watched, then every affected formula is screened again.
        </p>
      </div>

      {WATCHLIST.map((item) => (
        <article key={item.id} className="rounded-panel border border-line bg-white p-5 shadow-card">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${impactClass(item.impact)}`}>
              {item.impact}
            </span>
            <span>{item.source}</span>
          </p>
          <h2 className="mt-3 text-base font-semibold text-navy-800">{item.title}</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted">{item.detail}</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">In the pipeline</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.pipeline.length === 0 ? <span className="text-[13px] text-muted">None currently screening</span> : null}
                {item.pipeline.map((formula) => (
                  <span
                    key={formula.code}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${scoreClass(formula.tone)}`}
                  >
                    <span className={`size-1.5 rounded-full ${scoreDot(formula.tone)}`} aria-hidden />
                    {formula.code} {formula.score}%
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Approved formulas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.approved.map((formula) => (
                  <span key={formula.code} className="rounded-full bg-neutral-soft px-2.5 py-1 text-[12px] font-medium text-ink">
                    {formula.code}
                    {formula.name ? ` ${formula.name}` : ''}
                  </span>
                ))}
                {item.id === 'five-year-review' ? (
                  <span className="rounded-full bg-neutral-soft px-2.5 py-1 text-[12px] font-medium text-muted">9 more in the next 90 days</span>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            className="mt-5"
            onClick={() =>
              toast.success(
                'Affected formulas queued',
                `${item.affectedCount} formulas will be screened again against the current rules.`,
              )
            }
          >
            Rescreen affected formulas
          </Button>
        </article>
      ))}
    </div>
  );
}
