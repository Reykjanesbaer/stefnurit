import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildSnippets, clampHeight, embedUrls, publishedPaths, DEFAULT_HEIGHT,
} from '../admin/src/embed-snippets.js';
import { STACK_BELOW } from '../src/tokens.js';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const embedConfig = JSON.parse(readFileSync(new URL('../embed/embed-config.json', import.meta.url), 'utf8'));

describe('embed snippets', () => {
  it('derive every address from site.config.json', () => {
    const urls = embedUrls(config);
    expect(urls.frame).toBe(`${config.siteUrl}/embed/frame.html`);
    expect(urls.module).toBe(`${config.siteUrl}/dist/stefnu-rit.js`);
    expect(urls.data).toBe(`${config.siteUrl}/src/data/stefnurit.json`);
  });

  it('survives a trailing slash on the site URL', () => {
    expect(embedUrls({ siteUrl: 'https://example.is/x/' }).frame).toBe('https://example.is/x/embed/frame.html');
  });

  it('only point at files the site really publishes', () => {
    // Regression: the first Stillingar snippet pointed at /stefnu-rit.js and
    // /stefnurit.json on the site root, which do not exist.
    const [frame, module, data] = publishedPaths(config);
    expect(existsSync(new URL(`../${frame}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`../${data}`, import.meta.url))).toBe(true);
    // dist/ is build output; compare with where the package says it lands.
    expect(`./${module}`).toBe(pkg.module);
  });

  it('give the plain iframe a fixed height and no script', () => {
    const { iframe } = buildSnippets(config);
    expect(iframe).toContain(`src="${config.siteUrl}/embed/frame.html"`);
    expect(iframe).toContain(`height="${DEFAULT_HEIGHT}"`);
    expect(iframe).toContain('title="Stefnurit Reykjanesbæjar"');
    expect(iframe).not.toContain('<script');
  });

  it('never ask the frame to trust a ?parent= the snippet chose', () => {
    // The parent is whoever pastes this; the frame reads it from the Referer.
    const { iframe, iframeAuto } = buildSnippets(config);
    expect(iframe).not.toContain('parent=');
    expect(iframeAuto).not.toContain('parent=');
  });

  it('check origin and source before resizing, and never use a wildcard', () => {
    const { iframeAuto, urls } = buildSnippets(config);
    expect(iframeAuto).toContain(`event.origin !== '${urls.origin}'`);
    expect(iframeAuto).toContain('event.source !== frame.contentWindow');
    expect(iframeAuto).toContain("event.data.type !== 'stefnu-rit:height'");
    expect(iframeAuto).not.toContain("'*'");
  });

  it('use the height asked for, within range', () => {
    expect(buildSnippets(config, { height: 1450 }).iframe).toContain('height="1450"');
    expect(clampHeight(10)).toBe(300);
    expect(clampHeight(999999)).toBe(5000);
  });

  it('never let a hostile height reach the HTML', () => {
    for (const hostile of ['"><script>alert(1)</script>', '1000px', '12.5', '', null, undefined, NaN]) {
      const { iframe } = buildSnippets(config, { height: hostile });
      expect(iframe).toContain(`height="${DEFAULT_HEIGHT}"`);
      expect(iframe).not.toContain('alert');
    }
  });

  it('are served from an origin the parent allowlist knows nothing about — by design', () => {
    // The *frame's* origin is not a parent. Guard against confusing the two.
    expect(embedConfig.allowedParentOrigins).not.toContain(embedUrls(config).origin.replace('github.io', 'x'));
    expect(Array.isArray(embedConfig.allowedParentOrigins)).toBe(true);
  });

  it('keep the desktop tree on a narrow page by default: a minimum width and a scroll wrapper', () => {
    for (const key of ['iframe', 'iframeAuto']) {
      const snippet = buildSnippets(config)[key];
      expect(snippet, key).toContain(`min-width:${STACK_BELOW}px`);
      expect(snippet, key).toContain('<div style="overflow-x:auto">');
      expect(snippet, key).toContain('max-width:none');
    }
  });

  it('take the minimum width from the widget, so the two cannot drift apart', () => {
    expect(buildSnippets(config).iframe).toContain(`min-width:${STACK_BELOW}px`);
    expect(STACK_BELOW).toBe(700);
  });

  it('let the frame follow its container when asked to', () => {
    for (const key of ['iframe', 'iframeAuto']) {
      const snippet = buildSnippets(config, { keepDesktop: false })[key];
      expect(snippet, key).not.toContain('min-width');
      expect(snippet, key).not.toContain('overflow-x');
      expect(snippet, key).toContain('max-width:100%');
    }
  });

  it('wrap exactly one frame, so the auto-height script still finds it', () => {
    const snippet = buildSnippets(config).iframeAuto;
    expect(snippet.match(/<iframe/g)).toHaveLength(1);
    expect(snippet).toContain('id="stefnurit-rammi"');
    expect(snippet.indexOf('</div>')).toBeLessThan(snippet.indexOf('<script>'));
  });
});
