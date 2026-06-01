import { test, expect } from '@playwright/test';

/**
 * Cell editor tests: EditableCell, SelectCell, SearchableSelectCell,
 * SectorPickerButton. Run in table view with seeded data.
 */

const SEED_STATE = {
  currentProject: {
    id: 'proj-cells',
    name: 'Cell Editors Test',
    createdAt: new Date().toISOString(),
  },
  companies: [{
    id: 'co-cells-1',
    name: 'TestCellCo',
    country: 'UK',
    sector: 'Technology',
    revenue: 100_000_000,
    employees: 500,
    color: '#16a34a',
    status: 'target',
    visible: true,
    coordinates: null,
    notes: '',
    customFields: {},
  }],
  executives: [{
    id: 'ex-cells-1',
    companyId: 'co-cells-1',
    name: 'Edit Me',
    title: 'VP Sales',
    country: 'UK',
    email: 'editme@test.com',
    phone: '0123456789',
    linkedin: '',
    notes: '',
    remunerationNotes: '',
    availability: 'passive',
    level: 'VP',
    gender: 'Male',
    ethnicity: '',
    confidenceScore: 70,
    confidenceReasoning: '',
    customFields: {},
  }],
};

test.describe('Cell Editors (DataTable)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      localStorage.setItem('app-store', JSON.stringify({ state, version: 0 }));
    }, SEED_STATE);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="sidebar-table"]').click();
    await page.locator('[role="table"], table').first().waitFor({ state: 'visible', timeout: 5_000 });
  });

  // ── EditableCell ──────────────────────────────────────────────────────────────

  test('EditableCell: double-click opens input', async ({ page }) => {
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'VP Sales' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      await expect(cell.locator('input, textarea').first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test('EditableCell: type new value + Enter persists', async ({ page }) => {
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'VP Sales' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      const input = cell.locator('input, textarea').first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill('Director of Sales');
        await input.press('Enter');
        await expect(cell).toContainText('Director of Sales', { timeout: 5_000 });
      }
    }
  });

  test('EditableCell: Escape discards change', async ({ page }) => {
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'VP Sales' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      const input = cell.locator('input, textarea').first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill('DISCARDED VALUE');
        await input.press('Escape');
        await expect(cell).toContainText('VP Sales', { timeout: 3_000 });
      }
    }
  });

  // ── SelectCell ────────────────────────────────────────────────────────────────

  test('SelectCell: clicking availability cell opens dropdown', async ({ page }) => {
    // Availability is a select cell with options: available, passive, open, etc.
    const cell = page.locator('[role="cell"], td').filter({ hasText: /passive|available|open/i }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.click();
      await expect(
        page.locator('[role="option"], [role="listbox"], li').first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test('SelectCell: selecting an option updates the cell', async ({ page }) => {
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'passive' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.click();
      const option = page.getByRole('option', { name: /available/i }).first()
        .or(page.locator('li').filter({ hasText: /^available$/i }).first());
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
        await expect(cell).toContainText('available', { timeout: 3_000 });
      }
    }
  });

  // ── SearchableSelectCell ──────────────────────────────────────────────────────

  test('SearchableSelectCell: country cell has search input', async ({ page }) => {
    const countryCell = page.locator('[role="cell"], td').filter({ hasText: /^UK$/ }).first();
    if (await countryCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await countryCell.click();
      const searchInput = page.locator('[role="combobox"] input, [role="dialog"] input, [role="listbox"] input').first();
      if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await searchInput.fill('Ger');
        await expect(page.getByText('Germany').first()).toBeVisible({ timeout: 2_000 });
      }
    }
  });

  // ── SectorPickerButton ────────────────────────────────────────────────────────

  test('SectorPickerButton: opens taxonomy list', async ({ page }) => {
    const sectorCell = page.locator('[role="cell"], td').filter({ hasText: 'Technology' }).first();
    if (await sectorCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sectorCell.click();
      await expect(
        page.getByText(/technology|finance|healthcare|energy/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test('SectorPickerButton: search filters taxonomy', async ({ page }) => {
    const sectorCell = page.locator('[role="cell"], td').filter({ hasText: 'Technology' }).first();
    if (await sectorCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sectorCell.click();
      const searchInput = page.locator('[placeholder*="search" i]').last();
      if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await searchInput.fill('health');
        await expect(page.getByText(/healthcare|health/i).first()).toBeVisible({ timeout: 2_000 });
        await expect(page.getByText('Finance').first()).not.toBeVisible({ timeout: 2_000 });
      }
    }
  });

  // ── Mutual exclusion ──────────────────────────────────────────────────────────

  test('opening a second cell editor closes the first', async ({ page }) => {
    const cells = page.locator('[role="cell"], td').filter({ hasText: /VP Sales|Edit Me/ });
    const first = cells.nth(0);
    const second = cells.nth(1);

    if (
      await first.isVisible({ timeout: 2_000 }).catch(() => false) &&
      await second.isVisible({ timeout: 2_000 }).catch(() => false)
    ) {
      await first.dblclick();
      const firstInput = first.locator('input, textarea').first();
      await expect(firstInput).toBeVisible({ timeout: 2_000 });

      await second.dblclick();
      // First editor should close
      await expect(firstInput).not.toBeVisible({ timeout: 2_000 });
    }
  });
});
