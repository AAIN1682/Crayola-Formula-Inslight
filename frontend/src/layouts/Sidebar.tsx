import { NavLink } from 'react-router-dom';
import {
  Boxes,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Settings2,
  TestTubes,
} from 'lucide-react';
import { BrandMark } from '../components/graphics/Illustrations';
import { useDemoSelector } from '../state/DemoDataProvider';
import { cn } from '../utils/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/formulas', label: 'Formula Library', icon: TestTubes, end: false },
  { to: '/submissions', label: 'Submission History', icon: History, end: false },
  { to: '/monitoring', label: 'Monitoring', icon: Radar, end: false },
  { to: '/materials', label: 'Raw Materials', icon: Boxes, end: false },
];

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const openAlerts = useDemoSelector(
    (state) => state.alerts.filter((alert) => alert.status === 'open').length,
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-navy-800 text-slate-300 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-2.5 px-4 pt-5 pb-4', collapsed && 'justify-center px-2')}>
        <BrandMark className="size-9 shrink-0" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium tracking-wide text-slate-400 uppercase">
              Affine Analytics
            </p>
            <p className="truncate text-[15px] leading-5 font-semibold text-white">Formula Insight</p>
          </div>
        ) : null}
      </div>

      <div className={cn('px-3 pb-4', collapsed && 'px-2')}>
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-lg bg-navy-700/70 p-2',
            collapsed && 'justify-center p-1.5',
          )}
          title="Workspace: Crayola · Product Safety"
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-500 text-[13px] font-bold text-white"
            aria-hidden
          >
            C
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] leading-4 font-medium text-white">Crayola</p>
              <p className="truncate text-[11px] text-slate-400">Product Safety</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 px-3" aria-label="Primary">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-300 hover:bg-navy-700 hover:text-white',
                    )
                  }
                >
                  <Icon aria-hidden className="size-4.5 shrink-0" />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {!collapsed && item.to === '/monitoring' && openAlerts > 0 ? (
                    <span className="ml-auto rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular">
                      {openAlerts}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn('border-t border-navy-700 px-3 py-3', collapsed && 'px-2')}>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Settings & Demo Data' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              collapsed && 'justify-center px-2',
              isActive ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-navy-700 hover:text-white',
            )
          }
        >
          <Settings2 aria-hidden className="size-4.5 shrink-0" />
          {!collapsed ? <span className="truncate">Settings &amp; Demo Data</span> : null}
        </NavLink>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-navy-700 hover:text-white',
            collapsed && 'justify-center px-2',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4.5 shrink-0" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4.5 shrink-0" />
          )}
          {!collapsed ? <span>Collapse</span> : <span className="sr-only">Expand navigation</span>}
        </button>

        {!collapsed ? (
          <p className="mt-3 px-1 text-[11px] leading-4 text-slate-500">
            Affine Analytics — Formula Insight v1.0
          </p>
        ) : null}
      </div>
    </div>
  );
}
