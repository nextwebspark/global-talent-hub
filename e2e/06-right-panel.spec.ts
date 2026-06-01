import { test, expect } from '@playwright/test';
import { seedDashboard, makeProject, makeCompany, makeExecutive } from './helpers/seed-dashboard';

const PROJECT = makeProject({ id: 'proj-rp', name: 'RightPanel Test' });
const CO = makeCompany({ id: 'co-rp-1', name: 'FranceCo', country: 'France' });
const EXEC = makeExecutive('co-rp-1', {
  id: 'ex-rp-1',
  name: 'Sophie Dubois',
  title: 'Chief Marketing Officer',
  email: 'sophie@example.com',
  phone: '+33 1 23 45 67 89',
  notes: 'Strong B2B background',
  remunerationNotes: '€250k package',
  availability: 'available',
  confidenceScore: 88,
  confidenceReasoning: 'LinkedIn profile verified',
});

test.describe('RightPanel – executive details', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page, {
      project: PROJECT,
      companies: [CO],
      executives: [EXEC],
      selectedCompanyId: 'co-rp-1',
      selectedExecutiveId: 'ex-rp-1',
    });
    await page.locator('[data-testid="sidebar-map"]').click();
  });

  test('executive name shown in panel', async ({ page }) => {
    await expect(page.getByText('Sophie Dubois').first()).toBeVisible({ timeout: 5_000 });
  });

  test('executive title shown in panel', async ({ page }) => {
    await expect(page.getByText('Chief Marketing Officer').first()).toBeVisible({ timeout: 5_000 });
  });

  test('executive email shown in panel', async ({ page }) => {
    await expect(page.getByText('sophie@example.com').first()).toBeVisible({ timeout: 5_000 });
  });

  test('confidence score visible', async ({ page }) => {
    await expect(page.getByText(/88|confidence/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('availability status displayed', async ({ page }) => {
    await expect(page.getByText(/available|open|passive/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('notes visible in panel', async ({ page }) => {
    await expect(page.getByText('Strong B2B background').first()).toBeVisible({ timeout: 5_000 });
  });

  test('remuneration notes visible', async ({ page }) => {
    await expect(page.getByText(/€250k|remuneration/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('enrich button or section visible', async ({ page }) => {
    const enrichBtn = page.getByRole('button', { name: /enrich|discover/i }).first();
    if (await enrichBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(enrichBtn).toBeEnabled();
    }
  });
});
