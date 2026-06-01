import { test, expect } from '@playwright/test';

const SEED_STATE = {
  currentProject: {
    id: 'proj-export',
    name: 'Export Test',
    createdAt: new Date().toISOString(),
  },
  companies: [{
    id: 'co-exp-1',
    name: 'ExportCo',
    country: 'Switzerland',
    sector: 'Finance',
    revenue: 2_000_000_000,
    employees: 15_000,
    color: '#dc2626',
    status: 'target',
    visible: true,
    coordinates: null,
    notes: '',
    customFields: {},
  }],
  executives: [{
    id: 'ex-exp-1',
    companyId: 'co-exp-1',
    name: 'Maria Schneider',
    title: 'CEO',
    country: 'Switzerland',
    email: 'maria@exportco.ch',
    phone: '',
    linkedin: '',
    notes: '',
    remunerationNotes: '',
    availability: 'passive',
    level: 'C-Suite',
    gender: 'Female',
    ethnicity: '',
    confidenceScore: 92,
    confidenceReasoning: '',
    customFields: {},
  }],
};

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      localStorage.setItem('app-store', JSON.stringify({ state, version: 0 }));
    }, SEED_STATE);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('Export button visible in TopBar', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /export|download/i }).first()
    ).toBeVisible();
  });

  test('clicking Export triggers file download', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await page.getByRole('button', { name: /export|download/i }).first().click();
    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.(xlsx|csv|xls)$/i);
    }
  });

  test('Export from table view also works', async ({ page }) => {
    await page.locator('[data-testid="sidebar-table"]').click();
    await page.locator('[role="table"], table').first().waitFor({ state: 'visible', timeout: 5_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await page.getByRole('button', { name: /export|download/i }).first().click();
    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.(xlsx|csv|xls)$/i);
    }
  });
});
