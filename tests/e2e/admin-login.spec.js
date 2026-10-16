import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createMockGitHub } from '../integration/mock-github-server.mjs';

/**
 * The panel is driven exactly as a person would drive it, against the mock
 * GitHub. Requests to api.github.com are intercepted and forwarded to the mock,
 * so the page's real Content-Security-Policy — which only allows api.github.com
 * and itself — is exercised unchanged rather than relaxed for the test.
 */
let mock;
let mockOrigin;

test.beforeAll(async () => {
  mock = createMockGitHub();
  mockOrigin = await mock.listen();
});
test.afterAll(() => mock.close());

test.beforeEach(async ({ page }) => {
  await fetch(`${mockOrigin}/__mock/reset`, { method: 'POST' });

  await page.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await fetch(`${mockOrigin}${url.pathname}${url.search}`, {
      method: route.request().method(),
      headers: route.request().headers(),
      body: ['GET', 'HEAD'].includes(route.request().method()) ? undefined : route.request().postData(),
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    });
  });
});

const signIn = async (page, token = 'test-token-publisher', { expectFailure = false } = {}) => {
  await page.goto('/admin/');
  await page.getByLabel(/Aðgangslykill/).fill(token);
  await page.getByRole('button', { name: 'Skrá inn' }).click();
  // Wait for the panel to finish loading; otherwise every assertion below is a
  // race against the first render.
  if (!expectFailure) await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
};

test.describe('login', () => {
  test('explains how to make a token before asking for one', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Stjórnborð stefnurits' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Opna GitHub til að búa til token/ }))
      .toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens/new');

    // The permissions somebody has to get right, spelled out.
    const page_text = await page.locator('body').innerText();
    expect(page_text).toContain('Contents');
    expect(page_text).toContain('Read and write');
    expect(page_text).toContain('Pull requests');
    expect(page_text).toContain('Metadata');
    expect(page_text).toContain('90 daga');
    expect(page_text).toContain('Reykjanesbaer/stefnurit');
  });

  test('warns that the repository is public before anything is typed', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByText(/Geymslan er opinber/)).toBeVisible();
  });

  test('an empty token is refused without a request', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await expect(page.getByRole('alert')).toContainText('Límdu inn aðgangslykil');
  });

  test('an expired token gives the Icelandic reason, not a status code', async ({ page }) => {
    await signIn(page, 'test-token-expired', { expectFailure: true });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('útrunninn');
    await expect(alert).not.toContainText('401');
  });
});

test.describe('role detection', () => {
  test('an admin token signs in as publisher with every view available', async ({ page }) => {
    await signIn(page, 'test-token-publisher');
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();
    await expect(page.locator('.app-user-role')).toHaveText('Útgefandi');
    await expect(page.getByRole('button', { name: 'Ritstjóri', exact: true })).toBeEnabled();
  });

  test('a push token signs in as editor', async ({ page }) => {
    await signIn(page, 'test-token-editor');
    await expect(page.getByText('Ritstjóri Bæjarins')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ritstjóri', exact: true })).toBeEnabled();
  });

  // The UI hides what the role may not do; GitHub is what actually enforces it.
  test('a read-only token signs in as viewer with editing disabled', async ({ page }) => {
    await signIn(page, 'test-token-viewer');
    await expect(page.locator('.app-user-role')).toHaveText('Áhorfandi');
    await expect(page.getByRole('button', { name: 'Ritstjóri', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Útgáfa', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Saga', exact: true })).toBeEnabled();
  });
});

test.describe('yfirlit', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('shows what is live now', async ({ page }) => {
    const card = page.locator('.card', { hasText: 'Í birtingu núna' });
    await expect(card).toBeVisible();
    await expect(card.getByText(/kl\. \d{2}:\d{2}/)).toBeVisible();
  });

  test('every time on screen is 24-hour, never AM/PM', async ({ page }) => {
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/kl\. \d{2}:\d{2}/);
    expect(text).not.toMatch(/\b\d{1,2}:\d{2}\s?(AM|PM|am|pm)\b/);
  });

  test('says there are no unpublished drafts when there are none', async ({ page }) => {
    await expect(page.locator('.card', { hasText: 'Drögin þín' }))
      .toContainText('Þú átt engin óbirt drög');
  });

  test('warns about the teal contrast with the measured ratio', async ({ page }) => {
    const banner = page.locator('.banner', { hasText: 'Birtuskil' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('3,16:1');
    await expect(banner).toContainText('4,5:1');
  });

  test('warns that drafts on a public repository are visible to everyone', async ({ page }) => {
    await expect(page.locator('.banner', { hasText: 'opinber' })).toBeVisible();
  });

  test('links to the broken-link issue list', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Opin mál um bilaða hlekki/ }))
      .toHaveAttribute('href', /label%3Abroken-link/);
  });

  test('navigates between views by keyboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Saga', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Saga' })).toBeVisible();
  });
});

test.describe('security', () => {
  test('the token is never written to localStorage', async ({ page }) => {
    await signIn(page);
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    expect(stored).not.toContain('test-token-publisher');
    expect(stored).toBe('[]');
  });

  test('without "muna" the token is not in sessionStorage either', async ({ page }) => {
    await signIn(page);
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
    expect(stored).not.toContain('test-token-publisher');
  });

  test('with "muna" it goes to sessionStorage and never to localStorage', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
    await page.getByLabel(/Muna á þessu tæki/).check();
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();

    expect(await page.evaluate(() => sessionStorage.getItem('stefnurit-token'))).toBe('test-token-publisher');
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe('[]');
  });

  test('a remembered token survives a reload in the same tab', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
    await page.getByLabel(/Muna á þessu tæki/).check();
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();
    await expect(page.getByLabel(/Aðgangslykill/)).toHaveCount(0);
  });

  test('a server hiccup on reload does not make a remembered token forgotten', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
    await page.getByLabel(/Muna á þessu tæki/).check();
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();

    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ forceServerError: true }),
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Skrá inn' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('stefnurit-token'))).toBe('test-token-publisher');

    // The service comes back; one more reload and the person is simply in.
    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ forceServerError: false }),
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();
  });

  test('a token GitHub rejects is forgotten on reload', async ({ page }) => {
    await page.goto('/admin/');
    // Wait for the first boot to finish before planting anything. Planting the
    // token while that boot is still reading storage lets it consume (and clear)
    // the token itself, and the reload then has nothing left to reject.
    await page.getByLabel(/Aðgangslykill/).waitFor();
    await page.evaluate(() => sessionStorage.setItem('stefnurit-token', 'test-token-expired'));
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('stefnurit-token'))).toBeNull();
  });

  test('the form is shaped so a password manager will offer to save the token', async ({ page }) => {
    await page.goto('/admin/');
    const form = page.locator('form.login-form');
    await expect(form.locator('input[type=password]')).toHaveAttribute('autocomplete', 'current-password');
    await expect(form.locator('input[autocomplete=username]')).toHaveCount(1);
    // The username is bookkeeping for the browser, not a control.
    await expect(form.locator('input[autocomplete=username]')).toHaveAttribute('aria-hidden', 'true');
    await expect(form.locator('input[autocomplete=username]')).toHaveAttribute('tabindex', '-1');
  });

  test('the token never appears in any URL', async ({ page }) => {
    const urls = [];
    page.on('request', (request) => urls.push(request.url()));
    await signIn(page);
    expect(urls.filter((u) => u.includes('test-token-publisher'))).toEqual([]);
  });

  test('nothing is sent anywhere but the API and the panel itself', async ({ page }) => {
    const hosts = new Set();
    page.on('request', (request) => hosts.add(new URL(request.url()).host));
    await signIn(page);
    for (const host of hosts) {
      expect(['api.github.com', '127.0.0.1:8777', 'localhost:8777', 'avatars.githubusercontent.com'])
        .toContain(host);
    }
  });

  test('the panel refuses to render inside an iframe', async ({ page }) => {
    await page.setContent(
      `<iframe src="http://127.0.0.1:8777/admin/" width="900" height="600"></iframe>`,
    );
    const frame = page.frameLocator('iframe');
    await expect(frame.getByText('Stjórnborðið opnast ekki inni í annarri síðu')).toBeVisible({ timeout: 10_000 });
    await expect(frame.getByLabel(/Aðgangslykill/)).toHaveCount(0);
  });

  test('the CSP forbids inline script', async ({ page }) => {
    await page.goto('/admin/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    // Scripts get no inline allowance. Styles do, because the previewed widget
    // carries its stylesheet inside its shadow root as a <style> element, and
    // blocking it renders the preview unstyled rather than failing loudly.
    const scriptSrc = /script-src([^;]*)/.exec(csp)[1];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(/style-src([^;]*)/.exec(csp)[1]).toContain('unsafe-inline');
    expect(csp).toContain("connect-src 'self' https://api.github.com");
    expect(csp).toContain("object-src 'none'");

    const violations = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true;';
      document.body.append(script);
    });
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  });

  // A label is attacker-controllable: anyone who can open a pull request can
  // propose one. It must never become markup.
  test('a script payload in a label renders as text, not as an element', async ({ page }) => {
    await fetch(`${mockOrigin}/__mock/reset`, { method: 'POST' });
    await signIn(page);
    await page.evaluate(() => {
      const injected = '<img src=x onerror=window.__xss=1>';
      const state = globalThis.__stefnurit?.state;
      if (state?.live) state.live.document.sections[0].items[0].label = injected;
    });
    await page.getByRole('button', { name: 'Yfirlit', exact: true }).click();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});

test.describe('accessibility', () => {
  test('the login screen has no serious or critical violations', async ({ page }) => {
    await page.goto('/admin/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('Yfirlit has no serious or critical violations', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Yfirlit' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
