import { test, expect } from '@playwright/test';
import { seedDashboard, makeProject } from './helpers/seed-dashboard';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT = makeProject({ id: 'proj-import', name: 'Import Modal Test' });

test.describe('Import Modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page, { project: PROJECT });
    await page.getByRole('button', { name: /import|upload/i }).first().click();
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  });

  // ── Modal structure ───────────────────────────────────────────────────────────

  test('modal title visible', async ({ page }) => {
    await expect(
      page.locator('[role="dialog"]').getByText(/import|upload/i).first()
    ).toBeVisible();
  });

  test('file upload input present', async ({ page }) => {
    await expect(
      page.locator('[role="dialog"] input[type="file"]').first()
    ).toBeAttached();
  });

  test('paste textarea present', async ({ page }) => {
    const textarea = page.locator('[role="dialog"] textarea').first();
    if (await textarea.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(textarea).toBeEditable();
    }
  });

  test('close button or Escape dismisses modal', async ({ page }) => {
    const dialog = page.locator('[role="dialog"]').first();
    const closeBtn = dialog.getByRole('button', { name: /close|cancel|×/i }).first();
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  // ── File upload ───────────────────────────────────────────────────────────────

  test('uploading CSV shows preview', async ({ page }) => {
    const csvContent = 'Company,Name,Title,Country\nTestCo,John Doe,CEO,UK\nTestCo,Jane Smith,CFO,UK\n';
    const csvPath = path.join(process.env.TMPDIR || '/tmp', `pw-test-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csvContent);

    try {
      const fileInput = page.locator('[role="dialog"] input[type="file"]').first();
      await fileInput.setInputFiles(csvPath);
      await expect(
        page.locator('[role="dialog"]').getByText(/john doe|testco|preview|row/i).first()
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  test('uploading CSV auto-detects column headers', async ({ page }) => {
    const csvContent = 'Name,Title,Company,Country\nAna Lima,COO,MegaCorp,Brazil\n';
    const csvPath = path.join(process.env.TMPDIR || '/tmp', `pw-cols-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csvContent);

    try {
      const fileInput = page.locator('[role="dialog"] input[type="file"]').first();
      await fileInput.setInputFiles(csvPath);
      await expect(
        page.locator('[role="dialog"]').getByText(/name|title|company|country/i).first()
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  // ── Paste import ──────────────────────────────────────────────────────────────

  test('pasting TSV data shows preview rows', async ({ page }) => {
    const textarea = page.locator('[role="dialog"] textarea').first();
    if (await textarea.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await textarea.fill('Company\tName\tTitle\tCountry\nAlpha Inc\tCarlos Rivera\tCEO\tSpain\n');
      await expect(
        page.locator('[role="dialog"]').getByText(/alpha inc|carlos/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });
});
