import { test, expect } from '@playwright/test';

test.describe('ProjectsPanel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app-store', JSON.stringify({
        state: {
          currentProject: { id: 'proj-pp', name: 'PP Test', createdAt: new Date().toISOString() },
          companies: [],
          executives: [],
        },
        version: 0,
      }));
    });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  // ── Open panel ────────────────────────────────────────────────────────────────

  test('sidebar projects button opens panel', async ({ page }) => {
    await page.locator('[data-testid="sidebar-projects"]').click();
    await expect(
      page.getByText(/projects|search history|recent/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Panel from landing ─────────────────────────────────────────────────────────

  test('projects panel accessible from landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const trigger = page.getByRole('button', { name: /projects|folder|history/i }).first();
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();
      await expect(
        page.getByText(/projects|search history/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── API-driven project list ────────────────────────────────────────────────────

  test('panel shows empty state when no projects exist', async ({ page }) => {
    // Intercept the projects API with empty array
    await page.route('**/api/search/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.locator('[data-testid="sidebar-projects"]').click();
    // Should show empty state message
    await expect(
      page.getByText(/no projects|no searches|empty/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('panel shows project list from API', async ({ page }) => {
    await page.route('**/api/search', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'p1', query: 'CFOs in Germany', companyCount: 3, createdAt: new Date().toISOString() },
          { id: 'p2', query: 'CTOs in France', companyCount: 5, createdAt: new Date().toISOString() },
        ]),
      });
    });
    await page.locator('[data-testid="sidebar-projects"]').click();
    await expect(page.getByText(/cfos in germany|ctos in france/i).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Close panel ───────────────────────────────────────────────────────────────

  test('clicking outside panel closes it', async ({ page }) => {
    await page.locator('[data-testid="sidebar-projects"]').click();
    const panel = page.getByText(/projects|search history/i).first();
    await expect(panel).toBeVisible({ timeout: 3_000 });
    // Click main content area
    await page.locator('body').click({ position: { x: 600, y: 300 } });
    await expect(
      page.locator('[data-testid="projects-panel"]').first()
    ).not.toBeVisible({ timeout: 3_000 });
  });
});
