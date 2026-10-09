import type {
  ActivityEvent,
  DemoDataset,
  DemoSettings,
  EvidenceDocument,
  Formula,
  MonitoringAlert,
  ReviewDecision,
  ScreeningRun,
  SourceReviewDraft,
} from '../types/domain';

export type DemoState = DemoDataset;

export type DemoAction =
  | { type: 'dataset/replace'; dataset: DemoDataset }
  | { type: 'formula/upsert'; formula: Formula }
  | { type: 'run/add'; run: ScreeningRun }
  | { type: 'run/markOutdated'; formulaId: string }
  | { type: 'decision/add'; decision: ReviewDecision }
  | { type: 'alert/upsert'; alert: MonitoringAlert }
  | { type: 'document/upsert'; document: EvidenceDocument }
  | { type: 'activity/add'; activity: ActivityEvent }
  | { type: 'settings/update'; settings: Partial<DemoSettings> }
  | { type: 'sourceReview/upsert'; draft: SourceReviewDraft }
  | { type: 'batch'; actions: DemoAction[] };

function upsertById<T extends { id: string }>(collection: T[], item: T): T[] {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...collection, item];
  const next = [...collection];
  next[index] = item;
  return next;
}

function sortActivities(activities: ActivityEvent[]): ActivityEvent[] {
  return [...activities].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'dataset/replace':
      return action.dataset;

    case 'formula/upsert':
      return { ...state, formulas: upsertById(state.formulas, action.formula) };

    case 'run/add':
      return { ...state, runs: upsertById(state.runs, action.run) };

    case 'run/markOutdated':
      return {
        ...state,
        runs: state.runs.map((run) =>
          run.formulaId === action.formulaId ? { ...run, outdated: true } : run,
        ),
      };

    case 'decision/add':
      return { ...state, decisions: upsertById(state.decisions, action.decision) };

    case 'alert/upsert':
      return { ...state, alerts: upsertById(state.alerts, action.alert) };

    case 'document/upsert':
      return { ...state, documents: upsertById(state.documents, action.document) };

    case 'activity/add':
      return { ...state, activities: sortActivities([action.activity, ...state.activities]) };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'sourceReview/upsert':
      return { ...state, sourceReviewDrafts: upsertById(state.sourceReviewDrafts ?? [], action.draft) };

    case 'batch':
      return action.actions.reduce(demoReducer, state);

    default:
      return state;
  }
}
