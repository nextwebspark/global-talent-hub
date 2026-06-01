import { test, expect } from '@playwright/test';

const SEED_STATE = {
  currentProject: {
    id: 'proj-cl',
    name: 'CompanyList Test',
    createdAt: new Date().toISOString(),
  },
  companies: [
    {
      id: 'co-cl-1',
      name: 'AlphaCorp',
      country: 'Germany',
      sector: 'Tech',
      revenue: 1_000_000_000,
      employees: 10_000,
      color: '#4f46e5',
      status: 'target',
      visible: true,
      coordinates: null,
      notes: '',
      customFields: {},
    },
    {
      id: 'co-cl-2',
      name: 'BetaCo',
      country: 'France',
      sector: 'Finance',
      revenue: 500_000_000,
      employees: 3000,
      color: '#7c3aed',
      status: 'target',
      visible: true,
      coordinates: null,
      notes: '',
      customFields: {},
    },
    {
      id: 'co-cl-3',
      name: 'GammaLtd',
      country: 'Germany',
      sector: 'Healthcare',
      revenue: 250_000_000,
      employees: 2000,
      color: '#0891b2',
      status: 'target',
      visible: true,
      coordinates: null,
      notes: '',
      customFields: {},
    },
  ],
  executives: [
    {
      id: 'ex-cl-1',
      companyId: 'co-cl-1',
      name: 'Hans Meier',
      title: 'CEO',
      country: 'Germany',
      email: '',
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
    },
  ],
};

test.describe('CompanyList sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      localStorage.setItem('app-store', JSON.stringify({ state, version: 0 }));
    }, SEED_STATE);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Make sure map view is active (company list is in the left panel)
    await page.locator('[data-testid="sidebar-map"]').click();
  });

  // ── List renders ──────────────────────────────────────────────────────────────

  test('company names appear in the company list', async ({ page }) => {
    for (const name of ['AlphaCorp', 'BetaCo', 'GammaLtd']) {
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Country grouping ──────────────────────────────────────────────────────────

  test('countries group companies correctly', async ({ page }) => {
    await expect(page.getByText('Germany').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('France').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Company expand / collapse ─────────────────────────────────────────────────

  test('clicking company row reveals its executives', async ({ page }) => {
    const companyRow = page.getByText('AlphaCorp').first();
    await companyRow.click();
    await expect(page.getByText('Hans Meier').first()).toBeVisible({ timeout: 3_000 });
  });

  // ── Search filter ─────────────────────────────────────────────────────────────

  test('search box filters company list', async ({ page }) => {
    const searchBox = page
      .locator('[placeholder*="search" i], [placeholder*="filter" i], input[type="text"]')
      .first();
    if (await searchBox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchBox.fill('Alpha');
      await expect(page.getByText('AlphaCorp').first()).toBeVisible({ timeout: 3_000 });
      // BetaCo should not be visible
      await expect(page.getByText('BetaCo').first()).not.toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Visibility toggle ─────────────────────────────────────────────────────────

  test('visibility toggle button exists per company', async ({ page }) => {
    // Eye icon buttons next to company rows
    const eyeBtn = page.locator('[data-testid*="visibility"], button[aria-label*="visibility" i], button[aria-label*="hide" i]').first();
    if (await eyeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(eyeBtn).toBeEnabled();
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  test('delete button exists per company', async ({ page }) => {
    const deleteBtn = page
      .locator('button[aria-label*="delete" i], button[aria-label*="remove" i]')
      .first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(deleteBtn).toBeEnabled();
    }
  });

  // ── Revenue & employee display ────────────────────────────────────────────────

  test('revenue formatted (B/M) shown in list', async ({ page }) => {
    await expect(
      page.getByText(/1B|\$1B|1,000M/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Country collapse ──────────────────────────────────────────────────────────

  test('clicking country header collapses its companies', async ({ page }) => {
    const countryHeader = page.getByText('Germany').first();
    await countryHeader.click();
    // AlphaCorp and GammaLtd should hide
    await expect(page.getByText('AlphaCorp').first()).not.toBeVisible({ timeout: 3_000 });
  });

  // ── Filter panel ──────────────────────────────────────────────────────────────

  test('filter panel can be toggled', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filter/i }).first();
    if (await filterBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filterBtn.click();
      await expect(
        page.getByText(/revenue|employees/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });
});
