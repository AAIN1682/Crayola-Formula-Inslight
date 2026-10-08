import { createContext, useContext, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Copy, PlayCircle, SquarePen } from 'lucide-react';
import type { FormulaDetail } from '../types/services';
import { useAsyncAction, useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, DataPoint } from '../components/ui/Card';
import { Badge, ReviewBadge, ScreeningBadge } from '../components/ui/Badge';
import { ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { useToast } from '../components/ui/Toast';
import { FormulaFormDrawer } from '../components/formulas/FormulaFormDrawer';
import { RunScreeningDialog } from '../components/screening/RunScreeningDialog';
import { formatDate, formatRelative } from '../utils/formatting';
import { cn } from '../utils/cn';

const FormulaDetailContext = createContext<FormulaDetail | undefined>(undefined);

export function useFormulaDetail(): FormulaDetail {
  const detail = useContext(FormulaDetailContext);
  if (!detail) throw new Error('Formula tabs must render inside the formula details route.');
  return detail;
}

const TABS = [
  { to: 'ingredients', label: 'Ingredients' },
  { to: 'evidence', label: 'Evidence' },
  { to: 'screening', label: 'Screening' },
  { to: 'activity', label: 'Activity' },
];

export function FormulaDetailsPage() {
  const { formulaId = '' } = useParams();
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    () => services.getFormula(formulaId),
    [formulaId],
  );

  const duplicate = useAsyncAction(async () => {
    const copy = await services.duplicateFormula(formulaId);
    toast.success('Formula duplicated', `${copy.name} was created as a draft.`);
    navigate(`/formulas/${copy.id}`);
  });

  if (error) {
    return (
      <Card>
        <ErrorState title="This formula could not be opened" message={error} onRetry={reload} />
      </Card>
    );
  }

  if (loading && !data) {
    return (
      <Card>
        <LoadingState label="Loading formula…" rows={5} />
      </Card>
    );
  }

  if (!data) return null;

  const { formula, evidence, latestRun } = data;
  const screeningOutdated = formula.screeningStatus !== 'not-screened' && !formula.screeningCurrent;

  return (
    <div className="space-y-5">
      <PageHeader
        title={formula.name}
        description={formula.description}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{formula.id}</Badge>
            <Badge tone="neutral">{formula.version}</Badge>
            <Badge tone="info">{formula.category}</Badge>
            <Badge tone="neutral">Ages {formula.ageGroup}</Badge>
            {formula.lifecycle === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
            {formula.lifecycle === 'archived' ? <Badge tone="neutral">Archived</Badge> : null}
            <ScreeningBadge status={formula.screeningStatus} current={formula.screeningCurrent} />
            <ReviewBadge status={formula.reviewStatus} />
          </div>
        }
        actions={
          <>
            <Button onClick={() => void duplicate.run()} loading={duplicate.pending} icon={<Copy aria-hidden className="size-4" />}>
              Duplicate
            </Button>
            <Button onClick={() => setEditOpen(true)} icon={<SquarePen aria-hidden className="size-4" />}>
              Edit
            </Button>
            <Button
              variant="primary"
              onClick={() => setRunOpen(true)}
              icon={<PlayCircle aria-hidden className="size-4" />}
            >
              Run Assessment
            </Button>
          </>
        }
      />

      <Card>
        <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          <DataPoint label="Owner" value={data.owner ?? '—'} />
          <DataPoint label="Reviewer" value={data.reviewer ?? 'Unassigned'} />
          <DataPoint
            label="Last updated"
            value={formatDate(formula.updatedAt)}
            hint={formatRelative(formula.updatedAt)}
          />
          <DataPoint
            label="Last screened"
            value={formula.lastScreenedAt ? formatDate(formula.lastScreenedAt) : 'Never'}
            hint={latestRun ? `Run on ${latestRun.formulaVersion}` : 'No run recorded'}
          />
          <DataPoint
            label="Evidence"
            value={
              evidence.requiredCount === 0
                ? 'None required'
                : `${evidence.presentCount} of ${evidence.requiredCount}`
            }
            hint={`${evidence.completeness}% complete`}
          />
          <DataPoint
            label="Next review"
            value={formula.nextReviewDate ? formatDate(formula.nextReviewDate) : 'Not scheduled'}
          />
        </dl>
      </Card>

      {screeningOutdated ? (
        <Notice tone="warning" title="The latest screening result is outdated">
          Reassessment required. Markets, age group, or composition changed after the last result. Run the
          assessment again before recording a review decision.
        </Notice>
      ) : null}

      <div className="border-b border-line">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Formula sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  '-mb-px border-b-2 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <FormulaDetailContext.Provider value={data}>
        <Outlet />
      </FormulaDetailContext.Provider>

      <FormulaFormDrawer
        open={editOpen}
        mode="edit"
        formula={formula}
        onClose={() => setEditOpen(false)}
      />

      <RunScreeningDialog
        open={runOpen}
        formula={formula}
        onClose={() => setRunOpen(false)}
        onComplete={(run) => navigate(`/formulas/${formula.id}/results/${run.id}`)}
      />
    </div>
  );
}
