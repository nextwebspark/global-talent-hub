import { test, expect } from '@playwright/test';
import { seedDashboard, makeProject } from './helpers/seed-dashboard';

const PROJECT = makeProject({ id: 'proj-nav', name: 'Nav Test' });

test.describe('Dashboard – navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page, { project: PROJECT });
  });

  // ── Sidebar renders ──────────────────────────────────────────────────────────

  test('sidebar is visible', async ({ page }) => {
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('all sidebar nav buttons present', async ({ page }) => {
    for (const view of ['home', 'search', 'projects', 'map', 'table', 'dashboard']) {
      await expect(page.locator(`[data-testid="sidebar-${view}"]`)).toBeVisible();
    }
  });

  // ── View switching via sidebar ───────────────────────────────────────────────

  test('clicking Table nav switches to table view', async ({ page }) => {
    await page.locator('[data-testid="sidebar-table"]').click();
    await expect(
      page.locator('[role="table"], table, [data-testid="table-view"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Map nav switches to map view', async ({ page }) => {
    await page.locator('[data-testid="sidebar-table"]').click();
    await page.locator('[data-testid="sidebar-map"]').click();
    // Map renders as a bg-background container div (Mapbox canvas needs API token)
    await expect(
      page.locator('[data-testid="sidebar-map"]')
    ).toHaveClass(/shadow-sm/, { timeout: 3_000 });
    // Confirm CompanyList sidebar is visible (always shown in map view)
    await expect(page.getByText(/no companies yet|filter/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Dashboard nav switches to dashboard view', async ({ page }) => {
    await page.locator('[data-testid="sidebar-dashboard"]').click();
    // Dashboard sidebar button becomes active
    await expect(
      page.locator('[data-testid="sidebar-dashboard"]')
    ).toHaveClass(/shadow-sm/, { timeout: 3_000 });
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  test('pressing 2 switches to table view', async ({ page }) => {
    await page.keyboard.press('2');
    await expect(
      page.locator('[role="table"], table').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('pressing 1 switches to map view', async ({ page }) => {
    await page.keyboard.press('2');
    await page.keyboard.press('1');
    // Map nav button becomes active
    await expect(
      page.locator('[data-testid="sidebar-map"]')
    ).toHaveClass(/shadow-sm/, { timeout: 3_000 });
  });

  test('pressing 3 activates dashboard view', async ({ page }) => {
    await page.keyboard.press('3');
    await expect(
      page.locator('[data-testid="sidebar-dashboard"]')
    ).toHaveClass(/shadow-sm/, { timeout: 3_000 });
  });

  test('number keys do not switch view while input focused', async ({ page }) => {
    await page.locator('[data-testid="sidebar-table"]').click();
    await page.locator('[role="table"], table').first().waitFor({ state: 'visible', timeout: 5_000 });
    const input = page.locator('input').first();
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.focus();
      await page.keyboard.press('1');
      await expect(page.locator('[role="table"], table').first()).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Home navigation ──────────────────────────────────────────────────────────

  test('sidebar home button navigates to landing', async ({ page }) => {
    await page.locator('[data-testid="sidebar-home"]').click();
    await expect(page).toHaveURL('/');
  });

  // ── Command palette ──────────────────────────────────────────────────────────

  test('Ctrl+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // Command palette uses a custom overlay with data-testid="command-palette-input"
    await expect(
      page.locator('[data-testid="command-palette-input"]')
    ).toBeVisible({ timeout: 3_000 });
  });

  test('command palette closes on Escape', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[data-testid="command-palette-input"]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
    await expect(input).not.toBeVisible({ timeout: 3_000 });
  });

  test('command palette shows navigation items when empty', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[data-testid="command-palette-input"]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    // Navigation items visible with empty search
    await expect(page.getByText('Map View').first()).toBeVisible();
    await expect(page.getByText('Table View').first()).toBeVisible();
  });

  // ── Sidebar search trigger ───────────────────────────────────────────────────

  test('sidebar search button opens command palette', async ({ page }) => {
    await page.locator('[data-testid="sidebar-search"]').click();
    await expect(
      page.locator('[data-testid="command-palette-input"]')
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Projects panel ───────────────────────────────────────────────────────────

  test('sidebar projects button shows projects panel', async ({ page }) => {
    await page.locator('[data-testid="sidebar-projects"]').click();
    await expect(
      page.getByText(/projects|search history/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });
});
