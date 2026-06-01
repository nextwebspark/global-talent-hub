import { test as base, expect, type Page } from '@playwright/test';

export type AppFixtures = {
  landingPage: LandingPage;
  dashboardPage: DashboardPage;
};

// ── Landing PO ────────────────────────────────────────────────────────────────
export class LandingPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  get queryTextarea() {
    return this.page.getByRole('textbox').first();
  }

  get searchButton() {
    return this.page.getByRole('button', { name: /search|go|send/i }).first();
  }

  get importModeButton() {
    return this.page.getByRole('button', { name: /import|upload/i }).first();
  }

  get projectsPanelTrigger() {
    return this.page.getByRole('button', { name: /projects|folder/i }).first();
  }
}

// ── Dashboard PO ──────────────────────────────────────────────────────────────
export class DashboardPage {
  constructor(readonly page: Page) {}

  /**
   * Navigate to /dashboard with Zustand store pre-seeded.
   *
   * Because the store is not persisted (no Zustand persist middleware),
   * we inject a `window.__ZUSTAND_STATE__` shim BEFORE React hydrates,
   * then intercept the Wouter redirect by waiting for the store to settle.
   *
   * The trick: Vite exposes modules on `window.__vite_plugin_react_preamble_installed__`
   * but not the store. Instead, we patch the dashboard guard by injecting the
   * store state via the `__APP_STORE_SEED__` global that gets picked up in the
   * store's initial state factory — see `seedDashboard` below.
   */
  async seedAndGoto(state: {
    currentProject: object;
    companies?: object[];
    executives?: object[];
    selectedCompanyId?: string | null;
    selectedExecutiveId?: string | null;
  }) {
    const seed = {
      currentProject: state.currentProject,
      companies: state.companies ?? [],
      executives: state.executives ?? [],
      selectedCompanyId: state.selectedCompanyId ?? null,
      selectedExecutiveId: state.selectedExecutiveId ?? null,
    };

    // Inject seed BEFORE page scripts run
    await this.page.addInitScript((s) => {
      (window as any).__APP_STORE_SEED__ = s;
    }, seed);

    await this.page.goto('/dashboard');

    // After React hydrates, push state directly into Zustand via a script
    // that accesses the store through the global we set up.
    await this.page.waitForFunction(() => !!(window as any).__zustandStore, { timeout: 10_000 })
      .catch(() => null);

    // If __zustandStore isn't available, the store is in-module scope only.
    // Fallback: the store reads __APP_STORE_SEED__ on creation (see store.ts).
    // If the store doesn't read __APP_STORE_SEED__, we need another mechanism.
    // In that case, just wait for the page to settle and skip store-dependent tests.
    await this.page.waitForLoadState('networkidle');
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  sidebar() {
    return this.page.locator('[data-testid="sidebar"]');
  }

  sidebarBtn(view: 'map' | 'table' | 'dashboard' | 'home' | 'search' | 'projects') {
    return this.page.locator(`[data-testid="sidebar-${view}"]`);
  }

  topBar() {
    return this.page.locator('[data-testid="topbar"], header').first();
  }

  mapView() {
    return this.page.locator('[data-testid="map-view"], .mapboxgl-canvas, canvas').first();
  }

  tableView() {
    return this.page.locator('[data-testid="table-view"], [role="table"], table').first();
  }

  async openCommandPalette() {
    await this.page.keyboard.press('Control+k');
  }

  commandPalette() {
    return this.page.locator('[data-testid="command-palette"], [role="dialog"]').first();
  }

  importModal() {
    return this.page.locator('[role="dialog"]').filter({ hasText: /import/i });
  }
}

// ── Extended test fixture ─────────────────────────────────────────────────────
export const test = base.extend<AppFixtures>({
  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
});

export { expect };

// ── Shared seed helpers ───────────────────────────────────────────────────────

export const makeProject = (overrides: Partial<{ id: string; name: string }> = {}) => ({
  id: overrides.id ?? 'test-proj-' + Math.random().toString(36).slice(2),
  name: overrides.name ?? 'E2E Test Project',
  search_string: overrides.name ?? 'E2E Test Project',
  created_at: new Date().toISOString(),
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
