/**
 * <stefnu-rit> — Reykjanesbær's policy map as an embeddable web component.
 *
 *   <script type="module" src="stefnu-rit.js"></script>
 *   <stefnu-rit src="stefnurit.json"></stefnu-rit>
 *
 * Attributes
 *   src     URL of the JSON document (same origin, or CORS-enabled)
 *   target  link target, default "_blank"
 *   theme   "light" (the only theme for now)
 * Property
 *   .config assign a parsed object to render without a fetch
 *
 * No dependencies, no build step required, no framework.
 */

import { TOKENS, THEMEABLE, REFERENCE_WIDTH, REFERENCE_HEIGHT, STACK_BELOW } from './tokens.js';
import { FIGTREE_FACES } from './assets/fonts.js';
import { validate } from './validate.js';
import { routeTree, routeRail } from './lines.js';

/**
 * `@font-face` declared inside a shadow root is ignored by the browser, so the
 * faces have to land in the host document. Injected once per document, guarded
 * by an id, with a metric-matched fallback so the swap does not reflow text.
 */
function installFontFace(doc) {
  if (doc.getElementById('sr-figtree-face')) return;
  const faces = FIGTREE_FACES.map(({ src, unicodeRange }) => `
@font-face {
  font-family: 'Figtree';
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: ${src};
  unicode-range: ${unicodeRange};
}`).join('');

  const style = doc.createElement('style');
  style.id = 'sr-figtree-face';
  style.textContent = `${faces}
/* Metric-matched stand-in: text occupies the same space before and after
   Figtree arrives, so nothing jumps on load. */
@font-face {
  font-family: 'Figtree Fallback';
  src: local('Arial'), local('Helvetica'), local('Liberation Sans');
  size-adjust: 97.5%;
  ascent-override: 95%;
  descent-override: 24%;
  line-gap-override: 0%;
}`;
  doc.head.append(style);
}

const tokenBlock = (tokens) => Object.entries(tokens)
  .map(([name, value]) => `  --sr-${name}: ${value};`)
  .join('\n');

/**
 * Reserve the element's box before it upgrades.
 *
 * Until the module has run, <stefnu-rit> is an unknown element and therefore
 * zero pixels tall, so everything below it jumps the moment content lands.
 * This runs at module scope rather than on connect, which puts it before first
 * paint for a normal deferred module script, and it costs the embedding page
 * nothing to remember.
 */
function installPlaceholderStyle(doc) {
  if (!doc || doc.getElementById('sr-placeholder-style')) return;
  const style = doc.createElement('style');
  style.id = 'sr-placeholder-style';
  style.textContent = `stefnu-rit { display: block; }
stefnu-rit:not([data-ready]) { aspect-ratio: ${REFERENCE_WIDTH} / ${REFERENCE_HEIGHT}; }`;
  doc.head.prepend(style);
}

if (typeof document !== 'undefined') installPlaceholderStyle(document);

const css = `
:host {
${tokenBlock(TOKENS)}
  display: block;
  container-type: inline-size;
  contain: layout style;
  --sr-u: calc(100cqw / ${REFERENCE_WIDTH});
  color-scheme: light;
}
:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }

.root {
  position: relative;
  background: var(--sr-color-surface);
  font-family: var(--sr-font-family);
  -webkit-font-smoothing: antialiased;
  padding-inline: calc(var(--sr-page-margin) * var(--sr-u));
  padding-block: calc(var(--sr-root-top) * var(--sr-u)) calc(var(--sr-page-bottom) * var(--sr-u));
}

/* Connector layer. Sits under the content so a stroke can never cover a label,
   and is purely decorative, so it is hidden from assistive technology. */
.lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  shape-rendering: crispEdges;
}
.lines line {
  stroke: var(--sr-line-color);
  stroke-width: max(1px, calc(var(--sr-line-width) * var(--sr-u)));
  stroke-linecap: butt;
}

.band { display: flex; justify-content: center; }
.band--branch {
  margin-top: calc(var(--sr-branch-top) * var(--sr-u));
  gap: calc(var(--sr-branch-gap) * var(--sr-u));
}

/* ---- boxes -------------------------------------------------------------- */

.pill { background: var(--sr-box-fill); }
.pill, .card, .item-link { color: var(--sr-color-on-dark); }
.box--primary { --sr-box-fill: var(--sr-color-primary); }
.box--accent  { --sr-box-fill: var(--sr-color-accent); }
.box--pill    { --sr-box-fill: var(--sr-color-pill); }

.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sr-icon-gap) * var(--sr-u));
  width: max-content;
  max-width: 100%;
  min-width: calc(var(--sr-pill-width) * var(--sr-u));
  min-height: calc(var(--sr-pill-height) * var(--sr-u));
  padding-inline: calc(var(--sr-pill-padding-x) * var(--sr-u));
  border-radius: calc(var(--sr-radius-pill) * var(--sr-u));
  font-size: max(var(--sr-min-font-size), calc(var(--sr-heading-size) * var(--sr-u)));
  font-weight: var(--sr-font-weight-heading);
  line-height: var(--sr-line-height);
  text-align: center;
  text-decoration: none;
}
.band--branch .pill { min-height: calc(42 * var(--sr-u)); }

/* ---- the column grid ---------------------------------------------------- */

.grid {
  display: grid;
  align-items: stretch;
  margin-top: calc(var(--sr-grid-top) * var(--sr-u));
  gap: calc(var(--sr-column-gap) * var(--sr-u));
}

.col {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sr-card-gap) * var(--sr-u));
  min-width: 0;
}

/* A column made only of accent cards carries no separate backing, so it takes
   the backing's own vertical band instead — which is what makes column 1 of
   the 2025 design sit 9 reference px inside the blue columns. */
.col--inset { padding-block: calc(var(--sr-backing-inset) * var(--sr-u)); }

/* A column with backed cards gives up its right-hand strip to the backing. */
.col--backed .card { margin-right: calc(var(--sr-backing-offset) * var(--sr-u)); }

.card {
  position: relative;
  flex: 1 1 auto;
  border-radius: calc(var(--sr-radius-card) * var(--sr-u));
  padding: calc(var(--sr-card-padding-top) * var(--sr-u))
           calc(var(--sr-card-padding-x) * var(--sr-u))
           calc(var(--sr-card-padding-bottom) * var(--sr-u));
  min-width: 0;
}

/* The card paints as three layers in DOM order — backing, face, content —
   rather than with z-index. The host is a stacking context (contain: layout),
   so a negative z-index child would be buried behind the white page background
   instead of sitting between it and the card. */
.card-backing, .card-face {
  position: absolute;
  border-radius: calc(var(--sr-radius-card) * var(--sr-u));
}
.card-backing {
  top: calc(var(--sr-backing-inset) * var(--sr-u));
  bottom: calc(var(--sr-backing-inset) * var(--sr-u));
  left: calc(var(--sr-backing-offset) * var(--sr-u));
  right: calc(var(--sr-backing-offset) * -1 * var(--sr-u));
  background: var(--sr-color-accent);
}
.card-face { inset: 0; background: var(--sr-box-fill); }
.card-title, .items { position: relative; }

.card-title {
  margin: 0 0 calc(var(--sr-heading-gap) * var(--sr-u));
  font-size: max(var(--sr-min-font-size), calc(var(--sr-heading-size) * var(--sr-u)));
  font-weight: var(--sr-font-weight-heading);
  line-height: var(--sr-line-height);
}

.items { margin: 0; padding: 0; list-style: none; }

.item + .item { margin-top: calc((var(--sr-item-pitch) - var(--sr-item-size) * var(--sr-line-height)) * var(--sr-u)); }

.item-link {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  column-gap: calc(var(--sr-bullet-gap) * var(--sr-u));
  background: none;
  border-radius: calc(4 * var(--sr-u));
  color: inherit;
  font-size: max(var(--sr-min-font-size), calc(var(--sr-item-size) * var(--sr-u)));
  font-weight: var(--sr-font-weight-item);
  line-height: var(--sr-line-height);
  text-decoration: none;
  transition: filter 120ms ease-out;
}
a.item-link:hover { filter: brightness(1.18); }
a.item-link:focus-visible,
a.pill:focus-visible {
  outline: max(2px, calc(3 * var(--sr-u))) solid var(--sr-color-focus);
  outline-offset: max(2px, calc(3 * var(--sr-u)));
}
.item-link[aria-disabled='true'] { cursor: default; opacity: 0.72; }

.bullet {
  width: calc(var(--sr-bullet-size) * var(--sr-u));
  height: calc(var(--sr-bullet-size) * var(--sr-u));
  min-width: 2px;
  min-height: 2px;
  margin-top: calc(var(--sr-item-size) * var(--sr-line-height) * 0.45 * var(--sr-u));
  border-radius: 50%;
  background: currentColor;
}

.icon {
  display: inline-block;
  width: calc(var(--sr-icon-size) * var(--sr-u));
  height: calc(var(--sr-icon-size) * var(--sr-u));
  min-width: 9px;
  min-height: 9px;
  margin-left: calc(var(--sr-icon-gap) * var(--sr-u));
  vertical-align: -0.08em;
  flex: none;
}

/* ---- stacked layout ------------------------------------------------------ */

@container (max-width: ${STACK_BELOW - 1}px) {
  :host, .root { --sr-u: 1px; }
  .root {
    padding-inline: calc(var(--sr-stack-rail) * 1px) 16px;
    padding-block: 20px 24px;
  }
  .band, .grid { display: block; }
  .band--branch { margin-top: 0; }
  .pill {
    width: 100%;
    margin-top: 12px;
    justify-content: flex-start;
    text-align: left;
    min-height: 0;
    padding-block: 12px;
  }
  .band--root .pill { margin-top: 0; }
  .grid { margin-top: 12px; }
  .col { gap: 12px; margin-top: 12px; }
  .col--inset { padding-block: 0; }
  .col--backed .card { margin-right: 0; }
  .card { padding: 18px 20px 20px; border-radius: 10px; }
  .card--backed::before { display: none; }
  .card-title { margin-bottom: 10px; font-size: 19px; }
  .item + .item { margin-top: 10px; }
  .item-link { column-gap: 10px; font-size: 16px; }
  .bullet { width: 4px; height: 4px; margin-top: 8px; }
  .icon { width: 14px; height: 14px; margin-top: 3px; }
}

/* ---- failure state ------------------------------------------------------- */

.fallback {
  padding: 16px 20px;
  border: 2px solid #B3261E;
  border-radius: 8px;
  background: #FFF6F5;
  color: #410E0B;
  font: 400 15px/1.5 system-ui, sans-serif;
}
.fallback h2 { margin: 0 0 6px; font-size: 16px; }
.fallback ul { margin: 8px 0 0; padding-left: 20px; }
.fallback code { font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  .item-link { transition: none; }
}
`;

const ICON = `<svg class="icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.75H2.75v8.5h8.5V8"/><path d="M8.25 2.75h3v3"/><path d="M11.25 2.75 6.75 7.25"/></svg>`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class StefnuRit extends HTMLElement {
  static observedAttributes = ['src', 'target', 'theme'];

  #shadow;
  #config = null;
  #resizeObserver = null;
  #frame = 0;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  /** Render from an in-memory object instead of fetching `src`. */
  get config() { return this.#config; }
  set config(value) {
    this.#config = value;
    this.#render();
  }

  get target() { return this.getAttribute('target') || '_blank'; }

  connectedCallback() {
    installPlaceholderStyle(this.ownerDocument);
    installFontFace(this.ownerDocument);
    this.#reserveSpace();
    if (!this.#config && this.getAttribute('src')) this.#load(this.getAttribute('src'));
    else this.#render();

    this.#resizeObserver = new ResizeObserver(() => this.#scheduleLines());
    this.#resizeObserver.observe(this);

    // Lines are measured from laid-out text, so they have to be redrawn once
    // the real font replaces the fallback.
    this.ownerDocument.fonts?.ready.then(() => this.#scheduleLines());
  }

  /**
   * The JSON arrives over the network, so without this the element is 0px tall
   * for the first frames and everything below it jumps when the content lands.
   * The design's own aspect ratio is a good enough placeholder.
   */
  #reserveSpace() {
    if (this.#shadow.childElementCount) return;
    this.#shadow.innerHTML =
      `<style>:host { display: block; }
       .placeholder { aspect-ratio: ${REFERENCE_WIDTH} / ${REFERENCE_HEIGHT}; }</style>
       <div class="placeholder"></div>`;
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    cancelAnimationFrame(this.#frame);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'src' && newValue) this.#load(newValue);
    else this.#render();
  }

  async #load(src) {
    try {
      const response = await fetch(src, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      this.#config = await response.json();
    } catch (error) {
      this.#config = null;
      this.#renderFallback(`Náði ekki í gögnin frá ${src}`, [String(error.message || error)]);
      console.error('[stefnu-rit] could not load', src, error);
      return;
    }
    this.#render();
  }

  #render() {
    if (!this.#config) return;

    const result = validate(this.#config);
    for (const warning of result.warnings) console.warn('[stefnu-rit]', warning);
    if (!result.ok) {
      console.error('[stefnu-rit] stefnurit.json is not valid:\n  ' + result.errors.join('\n  '));
      this.#renderFallback('Stefnuritið birtist ekki því gögnin eru gölluð.', result.errors);
      return;
    }

    const data = this.#config;
    this.#shadow.innerHTML = `<style>${css}</style><style>${this.#themeCss(data.theme)}</style>${this.#markup(data)}`;
    this.setAttribute('data-ready', '');
    this.#scheduleLines();
  }

  #renderFallback(headline, details) {
    this.#shadow.innerHTML = `<style>${css}</style>
      <div class="fallback" role="alert">
        <h2>${esc(headline)}</h2>
        <p>Hafðu samband við vefstjóra. Tæknilegar upplýsingar:</p>
        <ul>${details.slice(0, 12).map((d) => `<li><code>${esc(d)}</code></li>`).join('')}</ul>
      </div>`;
  }

  /**
   * Token precedence, lowest to highest: component defaults (in the
   * stylesheet) < the JSON `theme` block (a later :host rule) < whatever the
   * page sets inline on the element. Writing the defaults inline on .root
   * instead would outrank the page and make `theme` the only way in.
   */
  #themeCss(theme) {
    const overrides = Object.entries(theme || {}).filter(([name]) => {
      if (THEMEABLE.includes(name)) return true;
      console.warn(`[stefnu-rit] theme: "${name}" is not a known token, ignored`);
      return false;
    });
    if (!overrides.length) return '';
    return `:host {\n${overrides.map(([n, v]) => `  --sr-${n}: ${v};`).join('\n')}\n}`;
  }

  #markup(data) {
    const sections = data.sections.map((section) => {
      if (section.kind === 'root' || section.kind === 'branch') {
        return `<div class="band band--${section.kind}" data-section="${esc(section.id)}">
          ${section.items.map((item) => this.#pill(item)).join('')}
        </div>`;
      }
      return `<div class="grid" data-section="${esc(section.id)}"
        style="grid-template-columns: ${section.columns.map((c) => `${Number(c.weight) > 0 ? Number(c.weight) : 1}fr`).join(' ')}">
        ${section.columns.map((column) => this.#column(column)).join('')}
      </div>`;
    }).join('');

    return `<div class="root">
      <svg class="lines" aria-hidden="true" focusable="false"></svg>
      <nav class="content" aria-label="${esc(data.title)}" ${data.lang ? `lang="${esc(data.lang)}"` : ''}>
        ${sections}
      </nav>
    </div>`;
  }

  #column(column) {
    const cards = column.cards;
    const allAccent = cards.every((card) => (card.colorToken || 'primary') === 'accent');
    const classes = ['col', allAccent ? 'col--inset' : 'col--backed'];
    return `<div class="${classes.join(' ')}" data-column="${esc(column.id)}">
      ${cards.map((card) => this.#card(card, allAccent)).join('')}
    </div>`;
  }

  #card(card, allAccent) {
    const token = card.colorToken || 'primary';
    const classes = ['card', `box--${token}`];
    if (!allAccent) classes.push('card--backed');
    return `<section class="${classes.join(' ')}" id="${esc(card.id)}" data-card="${esc(card.id)}"
        aria-labelledby="${esc(card.id)}-title">
      ${allAccent ? '' : '<span class="card-backing" aria-hidden="true"></span>'}<span class="card-face" aria-hidden="true"></span>
      <h3 class="card-title" id="${esc(card.id)}-title">${esc(card.title)}</h3>
      <ul class="items">${card.items.map((item) => `<li class="item">${this.#item(item)}</li>`).join('')}</ul>
    </section>`;
  }

  #item(item) {
    const linked = typeof item.href === 'string' && item.href !== '' && item.kind !== 'none';
    const note = item.note ? ` title="${esc(item.note)}" aria-description="${esc(item.note)}"` : '';

    if (!linked) {
      return `<span class="item-link" aria-disabled="true" id="${esc(item.id)}"${note}>
        <span class="bullet" aria-hidden="true"></span><span class="label">${esc(item.label)}</span></span>`;
    }
    const external = /^https?:\/\//i.test(item.href);
    return `<a class="item-link" id="${esc(item.id)}" href="${esc(item.href)}"
       target="${esc(this.target)}" ${external ? 'rel="noopener noreferrer"' : ''}${note}>
      <span class="bullet" aria-hidden="true"></span><span class="label">${esc(item.label)}${ICON}</span></a>`;
  }

  #pill(item) {
    const token = item.colorToken || 'pill';
    const linked = typeof item.href === 'string' && item.href !== '' && item.kind !== 'none';
    const inner = `${esc(item.label)}${linked ? ICON : ''}`;
    if (!linked) {
      return `<span class="pill box--${token}" id="${esc(item.id)}" aria-disabled="true">${inner}</span>`;
    }
    return `<a class="pill box--${token}" id="${esc(item.id)}" href="${esc(item.href)}"
      target="${esc(this.target)}" rel="noopener noreferrer">${inner}</a>`;
  }

  #scheduleLines() {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#drawLines());
  }

  /**
   * Measure the laid-out boxes and stroke the connector tree.
   *
   * Nothing about the geometry is written down anywhere: the rail's span, the
   * trunk's x and every tick come out of the live rectangles, which is what
   * makes adding or removing a column re-route the lines by itself.
   */
  #drawLines() {
    const root = this.#shadow.querySelector('.root');
    const svg = this.#shadow.querySelector('.lines');
    if (!root || !svg) return;

    const origin = root.getBoundingClientRect();
    if (!origin.width) return;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
    };

    const rootPill = this.#shadow.querySelector('.band--root .pill');
    const branchPills = [...this.#shadow.querySelectorAll('.band--branch .pill')];
    const columns = [...this.#shadow.querySelectorAll('.col')];
    const cards = [...this.#shadow.querySelectorAll('.card')];

    const stacked = origin.width < STACK_BELOW;
    let segments;

    if (stacked) {
      const nodes = [rootPill, ...branchPills, ...cards].filter(Boolean).map(rect);
      ({ segments } = routeRail({ railX: 16, cards: nodes }));
    } else {
      const unit = origin.width / REFERENCE_WIDTH;
      const columnRects = columns.map(rect);
      const branchRects = branchPills.map(rect);
      const branchBottom = branchRects.length
        ? Math.max(...branchRects.map((r) => r.y + r.height))
        : rootPill ? rect(rootPill).y + rect(rootPill).height : 0;

      ({ segments } = routeTree({
        root: rootPill ? rect(rootPill) : null,
        branch: branchRects,
        columns: columnRects,
        railY: branchBottom + Number(TOKENS['rail-offset']) * unit,
      }));
    }

    svg.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
    svg.setAttribute('width', String(origin.width));
    svg.setAttribute('height', String(origin.height));
    svg.innerHTML = segments
      .map((s) => `<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}" data-role="${s.role}"/>`)
      .join('');
  }
}

if (!customElements.get('stefnu-rit')) customElements.define('stefnu-rit', StefnuRit);
