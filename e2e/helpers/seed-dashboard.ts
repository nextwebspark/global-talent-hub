import type { Page } from '@playwright/test';

/**
 * Seeds the Zustand store for dashboard tests.
 *
 * Dashboard.tsx reads window.__E2E_SEED__ in its redirect guard (DEV only).
 * We inject it via addInitScript before the page loads, so it's available
 * synchronously when React mounts and the useEffect runs.
 */

export interface SeedProject {
  id: string;
  name: string;
  search_string?: string;
  created_at?: string;
  clockworkProjectId?: string | null;
}

export interface SeedState {
  project?: SeedProject;
  companies?: object[];
  executives?: object[];
  selectedCompanyId?: string | null;
  selectedExecutiveId?: string | null;
}

export async function seedDashboard(page: Page, state: SeedState = {}): Promise<void> {
  const project = state.project ?? {
    id: 'e2e-proj-1',
    name: 'E2E Test Project',
    search_string: 'E2E Test Project',
    created_at: new Date().toISOString(),
    clockworkProjectId: null,
  };

  const seed = {
    currentProject: project,
    companies: state.companies ?? [],
    executives: state.executives ?? [],
    selectedCompanyId: state.selectedCompanyId ?? null,
    selectedExecutiveId: state.selectedExecutiveId ?? null,
  };

  // Inject BEFORE the page scripts run — Dashboard.tsx reads this in useEffect
  await page.addInitScript((s) => {
    (window as any).__E2E_SEED__ = s;
  }, seed);

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

// ── Seed shape factories ──────────────────────────────────────────────────────

export const makeProject = (overrides: Partial<SeedProject> = {}): SeedProject => ({
  id: 'proj-' + Math.random().toString(36).slice(2),
  name: 'E2E Project',
  search_string: 'E2E Project',
  created_at: new Date().toISOString(),
  clockworkProjectId: null,
  ...overrides,
});

export const makeCompany = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'co-' + Math.random().toString(36).slice(2),
  name: 'TestCo',
  country: 'Germany',
  sector: 'Technology',
  revenue: 500_000_000,
  employees: 5000,
  color: '#4f46e5',
  status: 'target',
  visible: true,
  coordinates: null,
  notes: '',
  customFields: {},
  ...overrides,
});

export const makeExecutive = (companyId: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'ex-' + Math.random().toString(36).slice(2),
  companyId,
  name: 'Test Executive',
  title: 'CEO',
  country: 'Germany',
  email: 'exec@test.com',
  phone: '',
  linkedin: '',
  notes: '',
  remunerationNotes: '',
  availability: 'passive',
  level: 'C-Suite',
  gender: '',
  ethnicity: '',
  confidenceScore: 80,
  confidenceReasoning: '',
  customFields: {},
  ...overrides,
});
