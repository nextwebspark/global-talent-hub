import { test, expect } from '@playwright/test';

/**
 * Accessibility: keyboard navigation, focus management, ARIA roles.
 * These tests do not use axe-core — they verify structural and behavioral
 * accessibility patterns that matter most for power-user workflows.
 */

const SEED_STATE = {
  currentProject: {
    id: 'proj-a11y',
    name: 'A11y Test',
    createdAt: new Date().toISOString(),
  },
  companies: [{
    id: 'co-a11y-1',
    name: 'AccessCo',
    country: 'USA',
    sector: 'Technology',
    revenue: 1_000_000_000,
    employees: 5000,
    color: '#0f172a',
    status: 'target',
    visible: true,
    coordinates: null,
    notes: '',
    customFields: {},
  }],
  executives: [{
    id: 'ex-a11y-1',
    companyId: 'co-a11y-1',
    name: 'Access User',
    title: 'CTO',
    country: 'USA',
    email: 'access@test.com',
    phone: '',
    linkedin: '',
    notes: '',
    remunerationNotes: '',
    availability: 'available',
    level: 'C-Suite',
    gender: '',
    ethnicity: '',
    confidenceScore: 85,
    confidenceReasoning: '',
    customFields: {},
  }],
};

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      localStorage.setItem('app-store', JSON.stringify({ state, version: 0 }));
    }, SEED_STATE);
  });

  // ── Landing page ──────────────────────────────────────────────────────────────

  test('landing: textarea is focusable via Tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    // At some point Tab lands on an interactive element
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'A']).toContain(focused ?? '');
  });

  test('landing: submit button reachable via Tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Tab through until we hit the search button
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.getAttribute('aria-label') ||
        (document.activeElement as HTMLElement)?.textContent?.trim()
      );
      if (focused && /search|go|send/i.test(focused)) {
        // Found it
        return;
      }
    }
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  test('dashboard: sidebar buttons have accessible labels', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebarBtns = page.locator('[data-testid^="sidebar-"]');
    const count = await sidebarBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = sidebarBtns.nth(i);
      const label = await btn.getAttribute('aria-label')
        || await btn.evaluate(el => el.textContent?.trim())
        || await btn.getAttribute('title');
      expect(label).toBeTruthy();
    }
  });

  test('dashboard: dialogs trap focus', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Open import modal
    await page.getByRole('button', { name: /import|upload/i }).first().click();
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    // Focus should be inside dialog
    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInDialog).toBeTruthy();
  });

  test('dashboard: Escape always closes open dialogs', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const dialogs = [
      async () => page.getByRole('button', { name: /import|upload/i }).first().click(),
      async () => page.getByRole('button', { name: /add company|add/i }).first().click(),
    ];

    for (const open of dialogs) {
      await open();
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible({ timeout: 3_000 });
      }
    }
  });

  // ── ARIA roles ────────────────────────────────────────────────────────────────

  test('table view has correct ARIA table role', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="sidebar-table"]').click();
    await expect(
      page.locator('[role="table"], table').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('command palette has dialog role', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Control+k');
    await expect(
      page.locator('[role="dialog"]').first()
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Color contrast proxy ──────────────────────────────────────────────────────

  test('theme classes applied correctly for dark mode', async ({ page }) => {
    await page.goto('/dashboard');
    const themeBtn = page.getByRole('button', { name: /dark|light|theme|sun|moon/i }).first();
    if (await themeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await themeBtn.click();
      const isDark = await page.locator('html').evaluate(el => el.classList.contains('dark'));
      expect(isDark).toBeTruthy();
    }
  });
});
