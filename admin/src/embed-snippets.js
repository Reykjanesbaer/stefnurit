/**
 * The code a person pastes into another site to show the stefnurit.
 *
 * One module, because the same snippet is offered in two places — the shortcut
 * in the header and the Stillingar view — and an earlier version wrote the URLs
 * out twice and got them wrong in one of them. Every address is derived from
 * site.config.json here and nowhere else, so moving the site to a custom domain
 * is the one-line change the config promises.
 *
 * Pure: no DOM, no network. That is what lets the tests check the snippets
 * against the files the site actually publishes.
 */

/** Tall enough for the five-column layout (about 940px) with room to spare. */
export const DEFAULT_HEIGHT = 1000;

/**
 * The layout stacks below 1240px and then needs about 1400px. A frame with a
 * fixed height cannot know which one it will get; this is the number to raise
 * it to when the page that shows it is narrow.
 */
export const STACKED_HEIGHT = 1450;

const MIN_HEIGHT = 300;
const MAX_HEIGHT = 5000;

/**
 * A height that is safe to write into HTML someone else will paste.
 * Anything that is not a plain whole number in range falls back to the default.
 */
export function clampHeight(value) {
  // Match the text rather than coerce it: Number('') and Number(null) are both
  // 0, which would turn an emptied field into the minimum height instead of the
  // default.
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Number(text)));
}

/** Every address the snippets use, relative to the published site. */
export function embedUrls(config) {
  const base = String(config.siteUrl).replace(/\/+$/, '');
  return {
    base,
    origin: new URL(base).origin,
    frame: `${base}/embed/frame.html`,
    module: `${base}/dist/stefnu-rit.js`,
    data: `${base}/src/data/stefnurit.json`,
  };
}

/**
 * The paths, below the site root, that the snippets point at. Exported so a
 * test can assert each one exists in what is published.
 */
export function publishedPaths(config) {
  const { base, frame, module, data } = embedUrls(config);
  return [frame, module, data].map((url) => url.slice(base.length + 1));
}

/**
 * @param {object} config  site.config.json
 * @param {{height?: number}} [options]
 */
export function buildSnippets(config, { height = DEFAULT_HEIGHT } = {}) {
  const urls = embedUrls(config);
  const px = clampHeight(height);

  // No ?parent= here. The frame learns who is showing it from the browser's own
  // Referer, which cannot be set by a link someone crafted, and only talks to
  // origins listed in embed/embed-config.json.
  const iframe = [
    '<iframe',
    `  src="${urls.frame}"`,
    '  title="Stefnurit Reykjanesbæjar"',
    `  width="100%" height="${px}"`,
    '  loading="lazy"',
    '  style="border:0;width:100%;max-width:100%"></iframe>',
  ].join('\n');

  // For a page that can run a script: the frame reports its height and the page
  // resizes it. The origin and source checks are not optional — without them any
  // page could post a message and resize this one.
  const iframeAuto = [
    '<iframe',
    '  id="stefnurit-rammi"',
    `  src="${urls.frame}"`,
    '  title="Stefnurit Reykjanesbæjar"',
    `  width="100%" height="${px}"`,
    '  loading="lazy"',
    '  style="border:0;width:100%;max-width:100%"></iframe>',
    '<script>',
    "  window.addEventListener('message', function (event) {",
    `    if (event.origin !== '${urls.origin}') return;`,
    "    var frame = document.getElementById('stefnurit-rammi');",
    '    if (!frame || event.source !== frame.contentWindow) return;',
    "    if (!event.data || event.data.type !== 'stefnu-rit:height') return;",
    '    var height = Number(event.data.height);',
    '    if (height > 0 && height < 20000) frame.style.height = height + "px";',
    '  });',
    '</script>',
  ].join('\n');

  // The web component itself, for a page that allows a module script.
  const element = [
    `<script type="module" src="${urls.module}"></script>`,
    '',
    `<stefnu-rit src="${urls.data}"`,
    `            fallback-href="${urls.base}/"></stefnu-rit>`,
  ].join('\n');

  return { iframe, iframeAuto, element, urls, height: px };
}
