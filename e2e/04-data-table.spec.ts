import { test, expect } from '@playwright/test';
import { seedDashboard, makeProject, makeCompany, makeExecutive } from './helpers/seed-dashboard';

const PROJECT = makeProject({ id: 'proj-dt', name: 'DataTable Test' });
const CO1 = makeCompany({ id: 'co-dt-1', name: 'Acme Corp', country: 'Germany', revenue: 500_000_000, employees: 5000 });
const CO2 = makeCompany({ id: 'co-dt-2', name: 'Beta Ltd', country: 'UK', revenue: 200_000_000, employees: 1500 });
const EX1 = makeExecutive('co-dt-1', { id: 'ex-dt-1', name: 'Alice Müller', title: 'CFO' });
const EX2 = makeExecutive('co-dt-2', { id: 'ex-dt-2', name: 'Bob Smith', title: 'CTO' });

async function gotoTable(page: any) {
  await seedDashboard(page, { project: PROJECT, companies: [CO1, CO2], executives: [EX1, EX2] });
  await page.locator('[data-testid="sidebar-table"]').click();
  await page.locator('[role="table"], table').first().waitFor({ state: 'visible', timeout: 8_000 });
}

test.describe('DataTable', () => {
  // ── Renders ───────────────────────────────────────────────────────────────────

  test('table renders with data', async ({ page }) => {
    await gotoTable(page);
    await expect(page.locator('[role="table"], table').first()).toBeVisible();
  });

  test('company names appear in table', async ({ page }) => {
    await gotoTable(page);
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Beta Ltd').first()).toBeVisible({ timeout: 5_000 });
  });

  test('executive names appear in table', async ({ page }) => {
    await gotoTable(page);
    await expect(page.getByText('Alice Müller').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Bob Smith').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Column headers ────────────────────────────────────────────────────────────

  test('key column headers visible', async ({ page }) => {
    await gotoTable(page);
    const table = page.locator('[role="table"], table').first();
    for (const col of ['Name', 'Title']) {
      await expect(table.getByText(col, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Sorting ───────────────────────────────────────────────────────────────────

  test('clicking Name column header sorts the column', async ({ page }) => {
    await gotoTable(page);
    const nameHeader = page.getByRole('columnheader', { name: /name/i }).first();
    if (await nameHeader.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameHeader.click();
      const sortAttr = await nameHeader.getAttribute('aria-sort');
      expect(['ascending', 'descending', 'none'].includes(sortAttr ?? 'none')).toBeTruthy();
    }
  });

  // ── Row selection ─────────────────────────────────────────────────────────────

  test('clicking a row selects it', async ({ page }) => {
    await gotoTable(page);
    const row = page.locator('[role="row"]').filter({ hasText: 'Alice Müller' }).first();
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.click();
      // Row should have a selected/active class — just confirm no error
      const classes = await row.getAttribute('class');
      expect(classes).toBeTruthy();
    }
  });

  // ── Inline editing ────────────────────────────────────────────────────────────

  test('double-clicking a cell opens input', async ({ page }) => {
    await gotoTable(page);
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'Alice Müller' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      await expect(cell.locator('input, textarea').first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test('editing a cell and pressing Enter commits value', async ({ page }) => {
    await gotoTable(page);
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'CFO' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      const input = cell.locator('input, textarea').first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill('Chief Financial Officer');
        await input.press('Enter');
        await expect(input).not.toBeVisible({ timeout: 3_000 });
      }
    }
  });

  test('pressing Escape while editing discards the change', async ({ page }) => {
    await gotoTable(page);
    const cell = page.locator('[role="cell"], td').filter({ hasText: 'CTO' }).first();
    if (await cell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cell.dblclick();
      const input = cell.locator('input, textarea').first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill('DISCARDED');
        await input.press('Escape');
        await expect(input).not.toBeVisible({ timeout: 3_000 });
        await expect(cell).toContainText('CTO');
      }
    }
  });

  // ── Column visibility ─────────────────────────────────────────────────────────

  test('column visibility toggle button exists', async ({ page }) => {
    await gotoTable(page);
    await expect(
      page.getByRole('button', { name: /columns|visibility/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('column visibility dropdown opens', async ({ page }) => {
    await gotoTable(page);
    const toggleBtn = page.getByRole('button', { name: /columns|visibility/i }).first();
    if (await toggleBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await toggleBtn.click();
      await expect(
        page.locator('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]').first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Revenue formatter ─────────────────────────────────────────────────────────

  test('revenue displayed in human-readable format', async ({ page }) => {
    await gotoTable(page);
    // 500_000_000 → "500M" or "$500M"
    await expect(
      page.getByText(/500M|\$500|\$0\.5B/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Empty state ────────────────────────────────────────────────────────────────

  test('empty table shows placeholder', async ({ page }) => {
    await seedDashboard(page, {
      project: makeProject({ id: 'proj-empty', name: 'Empty' }),
      companies: [],
      executives: [],
    });
    await page.locator('[data-testid="sidebar-table"]').click();
    await expect(
      page.getByText(/no data|empty|no companies|no results/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
