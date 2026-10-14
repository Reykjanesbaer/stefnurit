/**
 * Stillingar — the theme, its contrast, and the snippets that embed the widget.
 *
 * Two things are deliberate here.
 *
 * The contrast calculator warns and suggests but never applies. A
 * municipality's colour is a decision somebody is accountable for, and the
 * nearest passing shade of it is a fact worth putting in front of them, not a
 * change a script gets to make behind their back. Every suggestion needs a
 * click.
 *
 * The snippets are built from site.config.json rather than typed into the
 * markup, so moving the site to a custom domain changes them everywhere at
 * once instead of leaving a stale URL in a view nobody thought to look at.
 */
import { el, append, clear, field, announce, externalLink } from '../ui/dom.js';
import { update } from '../state.js';
import { TOKENS } from '../../../src/tokens.js';
import { assess, darkenToPass, AA_NORMAL, AA_LARGE } from '../../../src/contrast.js';
import { formatTime } from '../ui/format.js';

/** The tokens this view offers. Colour only; the rest are geometry nobody asked to tune. */
const COLOUR_TOKENS = [
  { name: 'color-primary', label: 'Aðallitur', hint: 'Kassarnir í efri röð.' },
  { name: 'color-accent', label: 'Áherslulitur', hint: 'Rétthyrningurinn sem skín undan kortunum.' },
  { name: 'color-pill', label: 'Litur hnappa', hint: 'Litur á „Stefnurit“ og undirköflunum.' },
  { name: 'color-surface', label: 'Bakgrunnur', hint: 'Flöturinn sem ritið situr á.' },
  { name: 'color-on-dark', label: 'Texti á lit', hint: 'Textinn ofan á lituðum flötum.' },
  { name: 'line-color', label: 'Tengilínur', hint: 'Línurnar sem tengja kassana.' },
];

/**
 * The pairs that carry meaning, and therefore have to pass.
 *
 * `large` marks text the design draws at 24 px or more, where AA asks for 3:1
 * rather than 4.5:1. The connector lines are not text at all; they are reported
 * because a line nobody can see is still a problem, but against the 3:1
 * non-text threshold.
 */
const PAIRS = [
  { id: 'primary', fg: 'color-on-dark', bg: 'color-primary', label: 'Texti á aðallit', large: true },
  { id: 'pill', fg: 'color-on-dark', bg: 'color-pill', label: 'Texti á hnöppum', large: true },
  { id: 'accent', fg: 'color-on-dark', bg: 'color-accent', label: 'Texti á áherslulit', large: true },
  { id: 'card', fg: 'color-primary', bg: 'color-surface', label: 'Texti korta á bakgrunni', large: false },
  { id: 'lines', fg: 'line-color', bg: 'color-surface', label: 'Tengilínur á bakgrunni', large: true, nonText: true },
];

export function renderStillingar(root, { state, onNavigate }) {
  clear(root);

  const source = state.draft ?? state.live;
  if (!source) {
    append(root, [el('h1', { text: 'Stillingar' }), el('p', { class: 'bad-text', text: 'Skjalið er ekki komið.' })]);
    return;
  }

  // Edited in a copy. Nothing reaches GitHub until "Vista þema" is pressed.
  const theme = { ...(source.document.theme ?? {}) };
  const status = el('p', { class: 'save-status', role: 'status', 'aria-live': 'polite' });
  const contrastBox = el('div', { class: 'contrast-box' });
  const preview = el('stefnu-rit', { id: 'thema-forskodun' });
  const inputs = new Map();

  append(root, [
    el('h1', { text: 'Stillingar' }),
    el('p', { class: 'lead', text: 'Litir ritsins, birtuskil þeirra, og kóðinn til að fella ritið inn á vefsíðu.' }),
    themeSection(),
    contrastSection(),
    embedSection(state.config),
    aboutSection(state.config),
  ]);

  paint();

  // ---- þema -----------------------------------------------------------------

  function themeSection() {
    const stage = el('div', { class: 'preview-stage', style: { width: '1460px', minWidth: '1460px' } }, [preview]);

    return el('section', { class: 'card' }, [
      el('h2', { text: 'Þema' }),
      el('p', { class: 'hint', text: 'Breytingar sjást strax í forskoðuninni fyrir neðan. Þær fara ekki í loftið fyrr en þú vistar og gefur út.' }),
      el('div', { class: 'theme-grid' }, COLOUR_TOKENS.map(tokenField)),
      el('div', { class: 'card-actions' }, [
        el('button', { class: 'primary', text: 'Vista þema í drögin', on: { click: save } }),
        el('button', {
          class: 'ghost', text: 'Sækja upprunalegu litina',
          on: {
            click: () => {
              for (const { name } of COLOUR_TOKENS) {
                delete theme[name];
                setFields(name, TOKENS[name]);
              }
              paint();
              announce('Upprunalegu litirnir eru komnir aftur í forskoðunina. Vistaðu til að halda þeim.');
            },
          },
        }),
        status,
      ]),
      el('h3', { text: 'Forskoðun' }),
      el('p', { class: 'hint', text: 'Sýnt á 1460 px breidd — þar sem ritið notar fullu uppsetninguna. Skrunaðu til hliðar ef skjárinn er minni.' }),
      el('div', { class: 'preview-scroller' }, [stage]),
    ]);
  }

  function tokenField({ name, label, hint }) {
    const value = valueOf(name);
    const id = `thema-${name}`;

    const picker = el('input', {
      type: 'color', id, value: normaliseHex(value),
      on: { input: (event) => change(name, event.target.value.toUpperCase()) },
    });
    const text = el('input', {
      type: 'text', id: `${id}-hex`, class: 'mono', value, spellcheck: 'false',
      'aria-label': `${label} — hex-gildi`,
      on: {
        change: (event) => {
          const next = event.target.value.trim();
          if (!/^#?[0-9a-f]{3,8}$/i.test(next)) {
            event.target.value = valueOf(name);
            announce(`„${next}“ er ekki gildur litur. Notaðu hex-gildi, t.d. #1F559F.`);
            return;
          }
          change(name, next.startsWith('#') ? next.toUpperCase() : `#${next.toUpperCase()}`);
        },
      },
    });

    inputs.set(name, { picker, text });

    return el('div', { class: 'theme-row' }, [
      field(id, label, el('div', { class: 'swatch-row' }, [picker, text]), hint),
    ]);
  }

  function valueOf(name) {
    return theme[name] ?? TOKENS[name];
  }

  function change(name, value) {
    if (value === TOKENS[name]) delete theme[name];
    else theme[name] = value;
    setFields(name, value);
    paint();
  }

  function setFields(name, value) {
    const pair = inputs.get(name);
    if (!pair) return;
    pair.text.value = value;
    const hex = normaliseHex(value);
    if (hex) pair.picker.value = hex;
  }

  /** Redraw the preview and the contrast table from the working copy. */
  function paint() {
    const next = structuredClone(source.document);
    if (Object.keys(theme).length) next.theme = theme;
    else delete next.theme;
    preview.config = next;
    renderContrast();
  }

  async function save() {
    status.className = 'save-status save-message--info';
    status.textContent = 'Vista…';
    try {
      const current = await state.storage.readDraft({ login: state.identity.login });
      const base = current ?? source;
      const next = structuredClone(base.document);
      if (Object.keys(theme).length) next.theme = theme;
      else delete next.theme;

      const written = await state.storage.saveDraft({
        login: state.identity.login,
        document: next,
        sha: current?.sha,
        message: 'Update theme colours',
      });
      update({
        draft: {
          ...base, document: next, sha: written.sha, commit: written.commit, ref: written.branch,
        },
      });
      status.className = 'save-status save-message--ok';
      status.textContent = `Vistað í drögin kl. ${formatTime(new Date())}.`;
      announce('Þemað er vistað í drögin. Farðu í Útgáfu til að senda það áfram.');
    } catch (error) {
      status.className = 'save-status save-message--bad';
      status.textContent = error.message;
    }
  }

  // ---- birtuskil ------------------------------------------------------------

  function contrastSection() {
    return el('section', { class: 'card' }, [
      el('h2', { text: 'Birtuskil' }),
      el('p', { class: 'hint' }, [
        'WCAG 2.1 AA krefst 4,5:1 fyrir venjulegan texta og 3:1 fyrir stóran texta og annað en texta. ',
        externalLink('https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html', 'Um kröfuna hjá W3C'),
        '.',
      ]),
      contrastBox,
    ]);
  }

  function renderContrast() {
    clear(contrastBox);
    const rows = PAIRS.map((pair) => {
      const fg = valueOf(pair.fg);
      const bg = valueOf(pair.bg);
      const verdict = assess(fg, bg, { large: pair.large });
      return { pair, fg, bg, verdict };
    });

    const failing = rows.filter((row) => row.verdict && !row.verdict.passesAA);

    append(contrastBox, [
      el('div', { class: 'table-wrap' }, [
        el('table', { class: 'contrast-table' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', text: 'Samsetning' }),
            el('th', { scope: 'col', text: 'Litir' }),
            el('th', { scope: 'col', text: 'Birtuskil' }),
            el('th', { scope: 'col', text: 'Krafa' }),
            el('th', { scope: 'col', text: 'Staða' }),
          ])]),
          el('tbody', {}, rows.map(({ pair, fg, bg, verdict }) => el('tr', {}, [
            el('th', { scope: 'row', text: pair.label }),
            el('td', {}, [
              el('span', { class: 'swatch', style: { background: bg, color: fg }, 'aria-hidden': 'true', text: 'Aa' }),
              el('span', { class: 'mono', text: `${fg} / ${bg}` }),
            ]),
            el('td', { class: 'mono', text: verdict ? formatRatio(verdict.ratio) : '—' }),
            el('td', { class: 'mono', text: `${formatRatio(pair.large ? AA_LARGE : AA_NORMAL)}` }),
            el('td', {}, [verdict === null
              ? el('span', { class: 'muted', text: 'ekki hex-litur' })
              : el('span', {
                class: verdict.passesAA ? 'ok-text' : 'warn-text',
                text: verdict.passesAA
                  ? (verdict.passesAAA ? 'Í lagi (AAA)' : 'Í lagi (AA)')
                  : 'Undir kröfu',
              })]),
          ]))),
        ]),
      ]),
      ...failing.map(suggestion),
      failing.length === 0
        ? el('p', { class: 'ok-text', text: 'Allar samsetningar standast AA.' })
        : null,
    ]);
  }

  /**
   * One warning per failing pair, with the nearest darker shade that would pass.
   *
   * "Nearest darker" rather than "nearest": lightening a brand colour toward
   * white against white text can never help, and walking toward black keeps the
   * hue recognisable.
   */
  function suggestion({ pair, fg, bg, verdict }) {
    const target = pair.large ? AA_LARGE : AA_NORMAL;
    const darker = darkenToPass(bg, fg, target);
    const editable = COLOUR_TOKENS.some((token) => token.name === pair.bg);

    return el('div', { class: 'banner banner--warn', role: 'status' }, [
      el('div', { class: 'banner-body' }, [
        el('strong', { text: `${pair.label}: ${formatRatio(verdict.ratio)}` }),
        el('span', {
          text: pair.nonText
            ? `Línurnar þurfa ${formatRatio(target)} til að sjást með vissu. Þær bera engar upplýsingar sem ekki standa líka í texta, svo þetta stoppar ekki útgáfu.`
            : `Krafan er ${formatRatio(target)}. Fólk með skerta sjón gæti átt erfitt með að lesa þennan texta.`,
        }),
        darker && !darker.unchanged
          ? el('span', {}, [
            'Dekkri tónn af sama lit sem stenst kröfuna: ',
            el('span', { class: 'mono strong', text: darker.hex }),
            ` (${formatRatio(darker.ratio)}).`,
          ])
          : el('span', { text: 'Enginn dekkri tónn af þessum lit stenst kröfuna — það þarf annan lit.' }),
        el('span', { class: 'hint', text: 'Ekkert er breytt fyrir þig. Liturinn er ákvörðun bæjarins, ekki stjórnborðsins.' }),
      ]),
      darker && !darker.unchanged && editable
        ? el('button', {
          class: 'ghost', text: `Nota ${darker.hex}`,
          on: {
            click: () => {
              change(pair.bg, darker.hex);
              announce(`${pair.label}: liturinn ${darker.hex} settur í forskoðunina. Vistaðu til að halda honum.`);
            },
          },
        })
        : null,
    ]);
  }

  // ---- innfelling -----------------------------------------------------------

  function embedSection(config) {
    const scriptSnippet = [
      `<script type="module" src="${config.siteUrl}/stefnu-rit.js"></script>`,
      '',
      `<stefnu-rit src="${config.siteUrl}/stefnurit.json"`,
      `            fallback-href="${config.siteUrl}/"></stefnu-rit>`,
    ].join('\n');

    const iframeSnippet = [
      '<iframe',
      `  src="${config.siteUrl}/embed/frame.html?parent=${encodeURIComponent(originOf(config.siteUrl))}"`,
      '  title="Stefnurit Reykjanesbæjar"',
      '  width="100%" height="900" loading="lazy"',
      '  style="border:0;max-width:100%"></iframe>',
    ].join('\n');

    return el('section', { class: 'card' }, [
      el('h2', { text: 'Innfelling' }),
      el('p', { class: 'hint', text: 'Afritaðu þann kóða sem passar vefsíðunni og límdu hann þar sem ritið á að birtast.' }),
      snippet('Vefhluti (ráðlagt)',
        'Ritið verður hluti af síðunni, tekur upp fulla breidd og hæð hennar og þarf ekkert JavaScript frá þér.',
        scriptSnippet),
      snippet('Rammi (iframe)',
        'Fyrir vefumsjónarkerfi sem leyfa ekki eigin script-merki. Ramminn segir síðunni hæð sína, en aðeins ef '
        + 'veffangið hennar er á listanum í embed/embed-config.json.',
        iframeSnippet),
      el('p', { class: 'hint' }, [
        'Nánari leiðbeiningar, þar með talið CSP-kröfur: ',
        externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/embedding.md`, 'docs/embedding.md'),
        '.',
      ]),
    ]);
  }

  function snippet(title, description, code) {
    const pre = el('pre', { class: 'snippet-code', tabindex: '0' }, [el('code', { text: code })]);
    const note = el('span', { class: 'hint', role: 'status', 'aria-live': 'polite' });

    return el('div', { class: 'snippet' }, [
      el('h3', { text: title }),
      el('p', { class: 'hint', text: description }),
      pre,
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'ghost', text: 'Afrita',
          on: {
            click: async (event) => {
              try {
                await navigator.clipboard.writeText(code);
                note.textContent = 'Afritað.';
              } catch {
                // Clipboard permission is not guaranteed; selecting the text
                // leaves the person one keystroke from the same result.
                selectAll(pre);
                note.textContent = 'Kóðinn er valinn — afritaðu með Ctrl+C.';
              }
              event.target.blur();
            },
          },
        }),
        note,
      ]),
    ]);
  }

  // ---- um stjórnborðið ------------------------------------------------------

  function aboutSection(config) {
    return el('section', { class: 'card' }, [
      el('h2', { text: 'Um þetta stjórnborð' }),
      el('dl', { class: 'facts' }, [
        el('dt', { text: 'Geymsla' }),
        el('dd', {}, [externalLink(config.repoUrl, `${config.owner}/${config.repo}`)]),
        el('dt', { text: 'Sýnileiki' }),
        el('dd', { text: config.repositoryVisibility === 'public' ? 'Opin — allir geta lesið drög og breytingabeiðnir' : 'Lokuð' }),
        el('dt', { text: 'Vefur' }),
        el('dd', {}, [externalLink(config.siteUrl, config.siteUrl)]),
        el('dt', { text: 'Skjalið' }),
        el('dd', { class: 'mono', text: config.documentPath }),
        el('dt', { text: 'Skylda athugun' }),
        el('dd', { class: 'mono', text: config.requiredCheckDisplayName }),
      ]),
      el('p', { class: 'hint' }, [
        'Geymslan er opin, svo drögin þín eru læsileg öllum áður en þau eru gefin út. ',
        externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/privacy.md`, 'Hvað það þýðir í reynd'),
        '.',
      ]),
      el('p', {}, [
        el('button', {
          class: 'button-link', text: 'Opna Hjálp',
          on: { click: () => onNavigate('hjalp') },
        }),
      ]),
    ]);
  }
}

// ---- helpers ----------------------------------------------------------------

/** "4,53:1" — Icelandic decimal comma, two places. */
function formatRatio(ratio) {
  return `${(Math.round(ratio * 100) / 100).toFixed(2).replace('.', ',')}:1`;
}

/** `<input type="color">` accepts #RRGGBB and nothing else. */
function normaliseHex(value) {
  const text = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return '#' + text.slice(1).split('').map((c) => c + c).join('').toUpperCase();
  }
  return '#000000';
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return url; }
}

function selectAll(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

export { formatRatio, normaliseHex, PAIRS, COLOUR_TOKENS };
