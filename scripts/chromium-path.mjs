/**
 * Find a Chromium Playwright can actually launch.
 *
 * Playwright pins a browser build per release and refuses to start if that
 * exact revision is missing. Images that pre-install Chromium — this project's
 * CI runner among them — frequently carry a different revision, which turns
 * `npm run test:e2e` into "Executable doesn't exist" on a machine that plainly
 * has a browser. Rather than download 150 MB on every run, point Playwright at
 * what is already there.
 *
 * Order: the explicit override first, because somebody who sets it means it;
 * then Playwright's own build if it is present; then whatever the image ships.
 * Returning null means "use Playwright's default", which is the right answer on
 * a developer machine that ran `npx playwright install`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const SYSTEM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export function resolveChromium({ env = process.env } = {}) {
  const override = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        `PLAYWRIGHT_CHROMIUM_EXECUTABLE points at ${override}, which does not exist.`,
      );
    }
    return { executablePath: override, source: 'PLAYWRIGHT_CHROMIUM_EXECUTABLE' };
  }

  if (playwrightsOwnBuildExists()) return { executablePath: null, source: 'playwright' };

  for (const candidate of browsersPathCandidates(env.PLAYWRIGHT_BROWSERS_PATH)) {
    if (existsSync(candidate)) return { executablePath: candidate, source: 'PLAYWRIGHT_BROWSERS_PATH' };
  }
  for (const candidate of SYSTEM_CANDIDATES) {
    if (existsSync(candidate)) return { executablePath: candidate, source: 'system' };
  }

  // Let Playwright produce its own error; it names the install command.
  return { executablePath: null, source: 'none' };
}

/**
 * Asking Playwright where its browser is, without launching it.
 *
 * `executablePath()` throws when the registry has no entry for the build, which
 * is itself the answer we want, so the throw is swallowed rather than reported.
 */
function playwrightsOwnBuildExists() {
  try {
    const { chromium } = require('@playwright/test');
    const path = chromium.executablePath();
    return Boolean(path) && existsSync(path);
  } catch {
    return false;
  }
}

/** `<browsers>/chromium`, then the highest-numbered `chromium-<rev>` beneath it. */
function browsersPathCandidates(browsersPath) {
  if (!browsersPath) return [];
  const direct = [join(browsersPath, 'chromium')];
  let revisions = [];
  try {
    revisions = readdirSync(browsersPath)
      .filter((name) => /^chromium(_headless_shell)?-\d+$/.test(name))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))
      .map((name) => join(browsersPath, name, 'chrome-linux', 'chrome'));
  } catch { /* no such directory; the system candidates still apply */ }
  return [...direct, ...revisions];
}
