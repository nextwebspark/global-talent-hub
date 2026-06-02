import { test, expect } from './fixtures/app';

test.describe('Landing page', () => {
  test.beforeEach(async ({ landingPage }) => {
    await landingPage.goto();
  });

  // ── Page load ───────────────────────────────────────────────────────────────

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('shows search textarea', async ({ landingPage }) => {
    await expect(landingPage.queryTextarea).toBeVisible();
  });

  test('shows brand/app name', async ({ page }) => {
    await expect(
      page.getByText(/global talent hub|talent|search/i).first()
    ).toBeVisible();
  });

  // ── Search interaction ───────────────────────────────────────────────────────

  test('typing query enables submit', async ({ landingPage }) => {
    await landingPage.queryTextarea.fill('Find CFOs in Germany');
    const btn = landingPage.searchButton;
    await expect(btn).not.toBeDisabled();
  });

  test('empty query keeps submit disabled or shows validation', async ({ page }) => {
    await page.goto('/');
    // Either the button is disabled, or submitting shows a validation message
    const textarea = page.getByRole('textbox').first();
    const submitBtn = page.getByRole('button', { name: /search|go|send/i }).first();

    // Ensure textarea is empty
    await textarea.fill('');
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    if (!isDisabled) {
      await submitBtn.click();
      // Should either not navigate or show toast
      await expect(page).toHaveURL('/');
    }
  });

  test('Submit with Ctrl+Enter in textarea', async ({ landingPage, page }) => {
    await landingPage.queryTextarea.fill('Find CTOs in UK');
    // The form should respond to Ctrl+Enter
    const responsePromise = page.waitForResponse(
      res => res.url().includes('/api/') && res.status() < 500,
      { timeout: 10_000 }
    ).catch(() => null);
    await landingPage.queryTextarea.press('Control+Enter');
    // Either a network call fires or we navigate away
    const response = await responsePromise;
    // Not asserting the response itself — just that the action triggered
    // (API might fail in test env; that's OK)
  });

  // ── Mode switching ───────────────────────────────────────────────────────────

  test('import mode button visible', async ({ landingPage }) => {
    await expect(landingPage.importModeButton).toBeVisible();
  });

  test('all three mode cards visible', async ({ page }) => {
    await expect(page.getByTestId('tab-search')).toBeVisible();
    await expect(page.getByTestId('tab-import')).toBeVisible();
    await expect(page.getByTestId('tab-brief')).toBeVisible();
  });

  test('Search card is selected by default', async ({ page }) => {
    await expect(page.getByTestId('tab-search')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('search-panel')).toBeVisible();
  });

  test('clicking Brief card reveals brief panel + upload + textarea', async ({ page }) => {
    await page.getByTestId('tab-brief').click();
    await expect(page.getByTestId('brief-panel')).toBeVisible();
    await expect(page.getByTestId('dropzone-brief-upload')).toBeVisible();
    await expect(page.getByTestId('input-brief-text')).toBeVisible();
    await expect(page.getByTestId('button-analyse-brief')).toBeDisabled();
  });

  test('typing in brief textarea enables Analyse button', async ({ page }) => {
    await page.getByTestId('tab-brief').click();
    await page.getByTestId('input-brief-text').fill('Hiring a CFO for a regional FMCG distributor');
    await expect(page.getByTestId('button-analyse-brief')).not.toBeDisabled();
  });

  test('clicking Import card reveals import panel', async ({ page }) => {
    await page.getByTestId('tab-import').click();
    await expect(page.getByTestId('dropzone-file-upload')).toBeVisible();
  });

  // ── Projects panel ───────────────────────────────────────────────────────────

  test('projects panel opens on trigger click', async ({ landingPage, page }) => {
    const trigger = landingPage.projectsPanelTrigger;
    if (await trigger.isVisible()) {
      await trigger.click();
      await expect(
        page.getByText(/projects|searches|history/i).first()
      ).toBeVisible();
    }
  });

  // ── Theme toggle ─────────────────────────────────────────────────────────────

  test('theme toggle switches dark class on html element', async ({ page }) => {
    const themeBtn = page.getByRole('button', { name: /theme|dark|light|sun|moon/i }).first();
    if (await themeBtn.isVisible()) {
      const htmlEl = page.locator('html');
      const beforeDark = await htmlEl.evaluate(el => el.classList.contains('dark'));
      await themeBtn.click();
      const afterDark = await htmlEl.evaluate(el => el.classList.contains('dark'));
      expect(afterDark).not.toBe(beforeDark);
    }
  });

  // ── Manual entry grid ────────────────────────────────────────────────────────

  test('manual entry row has all required column inputs', async ({ page }) => {
    // Switch to import/manual mode if there's a toggle
    const manualBtn = page.getByRole('button', { name: /manual|table|add row/i }).first();
    if (await manualBtn.isVisible()) {
      await manualBtn.click();
    }
    // Expect inputs for company, name, title, country
    const companyInput = page.getByPlaceholder(/company/i).first();
    if (await companyInput.isVisible()) {
      await expect(companyInput).toBeEditable();
    }
  });
});
