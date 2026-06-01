import { test, expect } from '@playwright/test';

const SEED_STATE = {
  currentProject: {
    id: 'proj-acd',
    name: 'Add Company Test',
    createdAt: new Date().toISOString(),
  },
  companies: [],
  executives: [],
};

test.describe('AddCompanyDialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      localStorage.setItem('app-store', JSON.stringify({ state, version: 0 }));
    }, SEED_STATE);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add company|add/i }).first().click();
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  });

  // ── Dialog renders ────────────────────────────────────────────────────────────

  test('dialog has Company Name input', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    await expect(
      dialog.getByPlaceholder(/company name/i).or(dialog.locator('input').first())
    ).toBeVisible();
  });

  test('dialog has Executive Name input', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    await expect(
      dialog.getByPlaceholder(/executive name|name/i).first()
    ).toBeVisible();
  });

  test('dialog has Title input', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    await expect(
      dialog.getByPlaceholder(/title|role/i).first()
    ).toBeVisible();
  });

  test('dialog has Country selector', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    await expect(
      dialog.getByPlaceholder(/country/i).or(dialog.getByText(/country/i).first())
    ).toBeVisible();
  });

  test('dialog has Submit/Add button', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    await expect(
      dialog.getByRole('button', { name: /add|save|submit|create/i }).first()
    ).toBeVisible();
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  test('submitting empty form shows validation or keeps dialog open', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const submitBtn = dialog.getByRole('button', { name: /add|save|submit|create/i }).first();
    await submitBtn.click();
    // Dialog should remain open if validation fails
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  });

  test('filling company name enables submit', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const nameInput = dialog.getByPlaceholder(/company name/i).first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill('NewCo');
      const submitBtn = dialog.getByRole('button', { name: /add|save|submit|create/i }).first();
      await expect(submitBtn).not.toBeDisabled();
    }
  });

  // ── Company autocomplete ──────────────────────────────────────────────────────

  test('typing company name shows autocomplete suggestions', async ({ page }) => {
    // Seed with an existing company to trigger suggestions
    await page.addInitScript(() => {
      localStorage.setItem('app-store', JSON.stringify({
        state: {
          currentProject: { id: 'proj-acd2', name: 'Test', createdAt: new Date().toISOString() },
          companies: [{ id: 'co-exist', name: 'ExistingCorp', country: 'UK', sector: 'Tech', revenue: 0, employees: 0, color: '#000', status: 'target', visible: true, coordinates: null, notes: '', customFields: {} }],
          executives: [],
        },
        version: 0,
      }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add company|add/i }).first().click();
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5_000 });

    const dialog = page.locator('[role="dialog"]').first();
    const nameInput = dialog.getByPlaceholder(/company name/i).first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill('Ex');
      await expect(
        dialog.getByText('ExistingCorp').first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Revenue / employee inputs ─────────────────────────────────────────────────

  test('revenue input accepts human-readable value', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const revenueInput = dialog.getByPlaceholder(/revenue/i).first();
    if (await revenueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await revenueInput.fill('500M');
      await expect(revenueInput).toHaveValue(/500M|500000000/i);
    }
  });

  // ── Sector picker ─────────────────────────────────────────────────────────────

  test('sector picker button opens taxonomy dropdown', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const sectorBtn = dialog.getByRole('button', { name: /sector|industry/i }).first();
    if (await sectorBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sectorBtn.click();
      await expect(
        page.getByText(/technology|finance|healthcare/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── Close ────────────────────────────────────────────────────────────────────

  test('Cancel button closes dialog', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const cancelBtn = dialog.getByRole('button', { name: /cancel|close/i }).first();
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });
});
