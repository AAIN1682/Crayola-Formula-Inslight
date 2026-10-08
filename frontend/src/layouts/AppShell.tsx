import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="fi-no-print sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </aside>

      {mobileNavOpen ? (
        <div className="fi-no-print fixed inset-0 z-50 lg:hidden">
          <div
            className="fi-animate-in absolute inset-0 bg-navy-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="fi-slide-in-right absolute inset-y-0 left-0">
            <Sidebar collapsed={false} onToggle={() => setMobileNavOpen(false)} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setMobileNavOpen(true)} />

        <main className="fi-print-root flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>

        <footer className="fi-no-print border-t border-line px-4 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Affine · Formula Intelligence</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
