import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Boxes,
  ChevronRight,
  History,
  Menu,
  Search,
  TestTubes,
  UserRound,
} from 'lucide-react';
import type { SearchResult } from '../types/services';
import { useCurrentUser, useDemoSelector, useServices } from '../state/DemoDataProvider';
import { AlertStatusBadge } from '../components/ui/Badge';
import { ALERT_TYPE_LABEL, formatRelative } from '../utils/formatting';
import { cn } from '../utils/cn';

interface Crumb {
  label: string;
  to?: string;
}

const STATIC_LABELS: Record<string, string> = {
  formulas: 'Formula Library',
  submissions: 'Submission History',
  monitoring: 'Monitoring',
  materials: 'Raw Materials',
  settings: 'Preferences',
  ingredients: 'Ingredients',
  evidence: 'Evidence',
  screening: 'Screening',
  activity: 'Activity',
  results: 'Screening result',
};

function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const formulas = useDemoSelector((state) => state.formulas);
  const materials = useDemoSelector((state) => state.rawMaterials);

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: 'Overview', to: '/' }];
  let path = '';

  segments.forEach((segment, index) => {
    path += `/${segment}`;
    const previous = segments[index - 1];

    if (previous === 'formulas') {
      const formula = formulas.find((item) => item.id === segment);
      crumbs.push({ label: formula ? `${formula.name} ${formula.version}` : segment, to: path });
      return;
    }
    if (previous === 'materials') {
      const material = materials.find((item) => item.id === segment);
      crumbs.push({ label: material?.name ?? segment, to: path });
      return;
    }
    if (previous === 'submissions' || previous === 'monitoring' || previous === 'results') {
      crumbs.push({ label: segment, to: path });
      return;
    }

    crumbs.push({ label: STATIC_LABELS[segment] ?? segment, to: path });
  });

  const last = crumbs[crumbs.length - 1];
  if (last) delete last.to;
  return crumbs;
}

function GlobalSearch() {
  const services = useServices();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const handle = window.setTimeout(() => {
      services
        .search(query)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, services]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const icons = {
    formula: <TestTubes aria-hidden className="size-4 text-brand-400" />,
    'raw-material': <Boxes aria-hidden className="size-4 text-accent-500" />,
    submission: <History aria-hidden className="size-4 text-muted" />,
  } as const;

  const select = (result: SearchResult) => {
    navigate(result.to);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={query}
        aria-label="Search formulas and raw materials"
        placeholder="Search formulas, raw materials, submissions…"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && results[0]) select(results[0]);
        }}
        className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm text-ink placeholder:text-subtle focus:border-brand-400 focus:bg-surface focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400"
      />

      {open && query.trim().length >= 2 ? (
        <div className="fi-animate-in absolute top-full left-0 z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
          {loading ? (
            <p className="px-4 py-3 text-[13px] text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted">
              No formulas, raw materials or submissions match “{query}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => select(result)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-brand-50"
                  >
                    <span className="mt-0.5">{icons[result.kind]}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{result.title}</span>
                      <span className="block truncate text-xs text-muted">{result.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const alerts = useDemoSelector((state) => state.alerts);
  const openAlerts = alerts
    .filter((alert) => alert.status !== 'resolved')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const openCount = alerts.filter((alert) => alert.status === 'open').length;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications: ${openCount} open monitoring ${openCount === 1 ? 'alert' : 'alerts'}`}
        className="relative flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand-200 hover:text-brand-500"
      >
        <Bell aria-hidden className="size-4.5" />
        {openCount > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-4.5 items-center justify-center rounded-full bg-warning px-1 text-[10px] leading-4.5 font-semibold text-white tabular">
            {openCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Monitoring alerts"
          className="fi-animate-in absolute top-full right-0 z-40 mt-2 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-overlay"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Monitoring alerts</h2>
            <Link
              to="/monitoring"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-brand-500 hover:underline"
            >
              View all
            </Link>
          </header>
          {openAlerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              No open or acknowledged alerts in this workspace.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {openAlerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={`/monitoring/${alert.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 transition-colors hover:bg-brand-50/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] leading-5 font-medium text-ink">{alert.title}</p>
                      <AlertStatusBadge status={alert.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {ALERT_TYPE_LABEL[alert.type]} · {formatRelative(alert.createdAt)} ·{' '}
                      {alert.affectedFormulaIds.length}{' '}
                      {alert.affectedFormulaIds.length === 1 ? 'formula' : 'formulas'} affected
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentUser = useCurrentUser();
  const people = useDemoSelector((state) => state.people);
  const services = useServices();

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pr-2 pl-1 transition-colors hover:border-brand-200"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-500 text-[11px] font-semibold text-white">
          {currentUser?.initials ?? '--'}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-[13px] leading-4 font-medium text-ink">
            {currentUser?.name ?? 'Affine'}
          </span>
          <span className="block truncate text-[11px] text-muted">{currentUser?.role ?? 'Product Safety'}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="fi-animate-in absolute top-full right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-overlay"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[13px] font-semibold text-ink">{currentUser?.name}</p>
            <p className="text-xs text-muted">{currentUser?.role}</p>
          </div>
          <div className="px-2 py-1.5">
            <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
              Switch user
            </p>
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  void services.updateSettings({ currentUserId: person.id });
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-brand-50',
                  person.id === currentUser?.id ? 'text-brand-500' : 'text-ink',
                )}
              >
                <span className="flex size-6 items-center justify-center rounded bg-neutral-soft text-[10px] font-semibold text-muted">
                  {person.initials}
                </span>
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-line px-2 py-1.5">
            <Link
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink transition-colors hover:bg-brand-50"
            >
              <UserRound aria-hidden className="size-4 text-muted" />
              Preferences
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const crumbs = useBreadcrumbs();

  return (
    <header className="fi-no-print sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-brand-500 lg:hidden"
        >
          <Menu aria-hidden className="size-4.5" />
        </button>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 md:block">
          <ol className="flex items-center gap-1 text-[13px]">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? (
                  <ChevronRight aria-hidden className="size-3.5 shrink-0 text-subtle" />
                ) : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="truncate text-muted transition-colors hover:text-brand-500">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-ink" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden w-64 xl:block 2xl:w-80">
            <GlobalSearch />
          </div>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      <div className="border-t border-line px-4 py-2 xl:hidden">
        <GlobalSearch />
      </div>
    </header>
  );
}
