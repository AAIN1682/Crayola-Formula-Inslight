// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { routes } from './router';

/**
 * Mounts the real route tree against jsdom and walks the primary screens.
 * This is the check that the application starts, renders and routes — not a snapshot test.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // jsdom has no layout engine, so charts and scroll APIs need minimal stand-ins.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  window.scrollTo = () => undefined;

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

let container: HTMLDivElement;
let root: Root | undefined;

async function settle(ms = 350) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mountAt(path: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  await act(async () => {
    root?.render(<RouterProvider router={router} />);
  });
  await settle();
  return container;
}

async function unmount() {
  if (!root) return;
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await unmount();
});

function text(): string {
  return container.textContent ?? '';
}

describe('application entry point', () => {
  it('mounts <App /> with its browser router', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<App />);
    });
    await settle();

    expect(text()).toContain('Formula Intelligence');
    expect(text()).toContain('Overview');
  });
});

describe('routes', () => {
  it('renders the Overview route by default with branding and derived metrics', async () => {
    await mountAt('/');

    expect(text()).toContain('Affine');
    expect(text()).toContain('Formula Intelligence');
    expect(text()).toContain('Welcome back, Affine');
    expect(text()).toContain('Product Safety');
    expect(text()).toContain('Affine · Formula Intelligence');

    expect(text()).toContain('Total formulas');
    expect(text()).toContain('Awaiting review');
    expect(text()).toContain('Missing evidence');
    expect(text()).toContain('Open monitoring alerts');
    expect(text()).toContain('Priority review queue');
    expect(text()).toContain('Recent activity');

    // The screening-status split must add up to the seeded 18 active formulas.
    expect(text()).toContain('Total formulas18');
    expect(container.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
  });

  it('never presents a Green result as a certification', async () => {
    await mountAt('/');
    expect(text()).toContain('not a certification');
  });

  it('renders the Formula Library with seeded, paginated rows', async () => {
    await mountAt('/formulas');

    expect(text()).toContain('Formula Library');
    expect(text()).toContain('ColorFlow Washable Marker');
    expect(text()).toContain('FML-1001');
    expect(container.querySelectorAll('tbody tr').length).toBe(10);
    expect(text()).toContain('of 18 formulas');
  });

  it('opens a formula detail route directly and shows every tab', async () => {
    await mountAt('/formulas/FML-1005');

    expect(text()).toContain('SoftShape Modeling Compound');
    expect(text()).toContain('Preservative Blend PB-9 (legacy)');
    const tabs = Array.from(
      container.querySelectorAll('nav[aria-label="Formula sections"] a'),
    ).map((node) => node.textContent);
    expect(tabs).toEqual(['Ingredients', 'Evidence', 'Screening', 'Activity']);
  });

  it('opens a seeded screening result directly with all result sections', async () => {
    await mountAt('/formulas/FML-1005/results/RUN-1005-01');

    expect(text()).toContain('Assessment Results');
    expect(text()).toContain('Findings');
    expect(text()).toContain('Exposure assessment readiness');
    expect(text()).toContain('Historical comparisons');
    expect(text()).toContain('Next actions');
    expect(text()).toContain('Reviewer actions');
    expect(text()).toContain('Demo ingredient-overlap score');
    expect(text()).toContain('not a certification');
    expect(text()).toContain('Not assessed');
  });

  it('renders Submission History with historical outcomes', async () => {
    await mountAt('/submissions');

    expect(text()).toContain('Submission History');
    expect(text()).toContain('SUB-2301');
    expect(text()).toContain('historical acceptance does not establish acceptance');
  });

  it('renders Monitoring with alerts and the upcoming-review timeline', async () => {
    await mountAt('/monitoring');

    expect(text()).toContain('Monitoring');
    expect(text()).toContain('Simulate update');
    expect(text()).toContain('Upcoming reviews');
    expect(text()).toContain('No live monitoring is connected');
  });

  it('renders the Raw Materials catalog', async () => {
    await mountAt('/materials');

    expect(text()).toContain('Raw Materials');
    expect(text()).toContain('RM-101');
    expect(text()).toContain('Aqua Base Concentrate');
  });

  it('renders Settings with the local persistence description', async () => {
    await mountAt('/settings');

    expect(text()).toContain('Preferences');
    expect(text()).toContain('Reset reference data');
    expect(text()).toContain('formula-insight.dataset');
  });

  it('shows a recoverable error state for a formula that does not exist', async () => {
    await mountAt('/formulas/FML-9999');

    expect(text()).toContain('could not be opened');
    expect(text()).toContain('Try again');
  });

  it('shows a not-found page for an unknown address', async () => {
    await mountAt('/does-not-exist');

    expect(text()).toContain('That page is not available');
  });
});
