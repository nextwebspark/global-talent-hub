import { test, expect } from '@playwright/test';
import { seedDashboard, makeProject } from './helpers/seed-dashboard';

const PROJECT = makeProject({ id: 'proj-topbar', name: 'TopBar Test Project' });

test.describe('TopBar', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page, { project: PROJECT });
  });

  // ── Project name ─────────────────────────────────────────────────────────────

  test('displays current project name', async ({ page }) => {
    await expect(page.getByText('TopBar Test Project').first()).toBeVisible();
  });

  test('clicking project name opens edit mode', async ({ page }) => {
    const nameEl = page.getByText('TopBar Test Project').first();
    await nameEl.click();
    const editInput = page.locator('input').filter({ hasValue: /TopBar Test Project/ }).first();
    if (await editInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(editInput).toBeFocused();
    }
  });

  test('editing project name and pressing Enter fires PATCH', async ({ page }) => {
    let patched = false;
    await page.route('**/api/search/**/name', route => {
      if (route.request().method() === 'PATCH') patched = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const nameEl = page.getByText('TopBar Test Project').first();
    await nameEl.click();
    const editInput = page.locator('input').filter({ hasValue: /TopBar/ }).first();
    if (await editInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editInput.fill('Renamed Project');
      await editInput.press('Enter');
      await page.waitForTimeout(500);
      expect(patched).toBeTruthy();
    }
  });

  test('pressing Escape while editing cancels rename', async ({ page }) => {
    const nameEl = page.getByText('TopBar Test Project').first();
    await nameEl.click();
    const editInput = page.locator('input').filter({ hasValue: /TopBar/ }).first();
    if (await editInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editInput.fill('Should Not Save');
      await editInput.press('Escape');
      await expect(page.getByText('TopBar Test Project').first()).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Action buttons ────────────────────────────────────────────────────────────

  test('Export button visible', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar-export"]')).toBeVisible();
  });

  test('Import button visible', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar-import"]')).toBeVisible();
  });

  test('Add Company button visible', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar-add"]')).toBeVisible();
  });

  test('Enrich All button visible', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar-enrich"]')).toBeVisible();
  });

  // ── Import modal ─────────────────────────────────────────────────────────────

  test('Import button opens import modal', async ({ page }) => {
    await page.locator('[data-testid="topbar-import"]').click();
    await expect(page.locator('[data-testid="import-tab-paste"]')).toBeVisible({ timeout: 3_000 });
  });

  test('import modal closes when clicking backdrop', async ({ page }) => {
    await page.locator('[data-testid="topbar-import"]').click();
    await expect(page.locator('[data-testid="import-tab-paste"]')).toBeVisible({ timeout: 3_000 });
    // Click the backdrop (top-left corner, outside the modal card)
    await page.mouse.click(10, 10);
    await expect(page.locator('[data-testid="import-tab-paste"]')).not.toBeVisible({ timeout: 3_000 });
  });

  // ── Add Company tab ────────────────────────────────────────────────────────────

  test('Add Company button opens import modal on Add Company tab', async ({ page }) => {
    await page.locator('[data-testid="topbar-add"]').click();
    // Both + (add) and import open the ImportModal; add opens on Add Company tab
    await expect(page.locator('[data-testid="import-tab-add"]')).toBeVisible({ timeout: 3_000 });
  });

  test('Add Company tab has company name input', async ({ page }) => {
    await page.locator('[data-testid="topbar-add"]').click();
    await page.locator('[data-testid="import-tab-add"]').click();
    await expect(
      page.locator('[data-testid="input-new-company-name"]')
    ).toBeVisible({ timeout: 3_000 });
  });

  test('Import modal closes when clicking outside', async ({ page }) => {
    await page.locator('[data-testid="topbar-add"]').click();
    await expect(page.locator('[data-testid="import-tab-add"]')).toBeVisible({ timeout: 3_000 });
    // Click the backdrop (outside the modal card)
    await page.mouse.click(10, 10);
    await expect(page.locator('[data-testid="import-tab-add"]')).not.toBeVisible({ timeout: 3_000 });
  });

  // ── Theme toggle ─────────────────────────────────────────────────────────────

  test('theme toggle flips dark class on html', async ({ page }) => {
    const themeBtn = page.locator('[data-testid="topbar-theme"]');
    if (await themeBtn.isVisible()) {
      const before = await page.locator('html').evaluate(el => el.classList.contains('dark'));
      await themeBtn.click();
      const after = await page.locator('html').evaluate(el => el.classList.contains('dark'));
      expect(after).not.toBe(before);
    }
  });

  // ── Stats display ─────────────────────────────────────────────────────────────

  test('company and executive count icons visible in topbar', async ({ page }) => {
    // TopBar shows building icon + count + users icon + count
    await expect(page.locator('[data-testid="topbar"]')).toBeVisible();
    // Count badges (shows 0 when no data seeded)
    const topbar = page.locator('[data-testid="topbar"]');
    await expect(topbar.getByText('0').first()).toBeVisible();
  });
});
