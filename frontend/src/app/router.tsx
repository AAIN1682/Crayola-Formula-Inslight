import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppProviders } from './providers';
import { AppShell } from '../layouts/AppShell';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { FormulaLibraryPage } from '../pages/FormulaLibraryPage';
import { FormulaDetailsPage } from '../pages/FormulaDetailsPage';
import { IngredientsTab } from '../pages/formula-tabs/IngredientsTab';
import { EvidenceTab } from '../pages/formula-tabs/EvidenceTab';
import { ScreeningTab } from '../pages/formula-tabs/ScreeningTab';
import { ActivityTab } from '../pages/formula-tabs/ActivityTab';
import { ScreeningResultsPage } from '../pages/ScreeningResultsPage';
import { SubmissionHistoryPage } from '../pages/SubmissionHistoryPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { RawMaterialsPage } from '../pages/RawMaterialsPage';
import { SettingsPage } from '../pages/SettingsPage';

/** Providers wrap the shell so every route shares one dataset and one toast surface. */
function Root() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

/**
 * Route configuration. Exported separately from the browser router so it can be mounted
 * on a memory router (for example in tests) without duplicating the route tree.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    errorElement: (
      <AppProviders>
        <NotFoundPage />
      </AppProviders>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'formulas', element: <FormulaLibraryPage /> },
      {
        path: 'formulas/:formulaId',
        element: <FormulaDetailsPage />,
        children: [
          { index: true, element: <Navigate to="ingredients" replace /> },
          { path: 'ingredients', element: <IngredientsTab /> },
          { path: 'evidence', element: <EvidenceTab /> },
          { path: 'screening', element: <ScreeningTab /> },
          { path: 'activity', element: <ActivityTab /> },
        ],
      },
      { path: 'formulas/:formulaId/results/:runId', element: <ScreeningResultsPage /> },
      { path: 'submissions', element: <SubmissionHistoryPage /> },
      { path: 'submissions/:submissionId', element: <SubmissionHistoryPage /> },
      { path: 'monitoring', element: <MonitoringPage /> },
      { path: 'monitoring/:alertId', element: <MonitoringPage /> },
      { path: 'materials', element: <RawMaterialsPage /> },
      { path: 'materials/:materialId', element: <RawMaterialsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
