/**
 * Yfirlit — what somebody needs to know within five seconds of signing in:
 * what is live, whether they have unpublished work, and whether anything is
 * broken.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { formatDateTime, formatRelative, plural } from '../ui/format.js';
import { diff } from '../../../src/diff.js';
import { assess, darkenToPass } from '../../../src/contrast.js';

export function renderYfirlit(root, { state, onNavigate }) {
  clear(root);
  const { config, live, draft, linkReport, identity, settings } = state;

  append(root, [
    el('h1', { text: 'Yfirlit' }),
    renderBanners({ config, live, draft, linkReport, settings, onNavigate }),
    el('div', { class: 'grid-cards' }, [
      renderLiveCard({ config, live }),
      renderDraftCard({ live, draft, identity, onNavigate }),
      renderLinkCard({ config, linkReport, onNavigate }),
    ]),
    renderActivity({ config, state }),
  ]);
}

// ---- banners ----------------------------------------------------------------

function banner(tone, title, body, action) {
  return el('div', { class: `banner banner--${tone}`, role: tone === 'error' ? 'alert' : 'status' }, [
    el('div', { class: 'banner-body' }, [
      el('strong', { text: title }),
      el('span', { text: body }),
    ]),
    action ?? null,
  ]);
}

function renderBanners({ config, live, draft, linkReport, settings, onNavigate }) {
  const banners = [];

  if (draft && live && !diff(live.document, draft.document).isEmpty) {
    banners.push(banner('info', 'Þú átt óbirt drög.',
      'Breytingarnar þínar eru vistaðar en ekki komnar á vefinn.',
      el('button', { class: 'ghost', text: 'Fara í útgáfu', on: { click: () => onNavigate('utgafa') } })));
  }

  const broken = linkReport?.summary?.broken ?? 0;
  if (broken > 0) {
    banners.push(banner('error', `${plural(broken, 'hlekkur virkar ekki', 'hlekkir virka ekki')}.`,
      'Skjalið sem hlekkurinn vísar á finnst ekki lengur.',
      el('button', { class: 'ghost', text: 'Skoða hlekki', on: { click: () => onNavigate('hlekkir') } })));
  }

  const changed = linkReport?.summary?.changedDocuments ?? 0;
  if (changed > 0) {
    banners.push(banner('warn', `${plural(changed, 'skjal hefur breyst', 'skjöl hafa breyst')} á vefþjóni.`,
      'Slóðin er sú sama en skjalið að baki henni er nýtt. Athugaðu hvort innihaldið sé enn rétt.',
      el('button', { class: 'ghost', text: 'Skoða', on: { click: () => onNavigate('hlekkir') } })));
  }

  // The contrast the design ships with. Surfaced, never changed automatically.
  const accent = live?.document?.theme?.['color-accent'] ?? '#009EBF';
  const contrast = assess('#FFFFFF', accent);
  if (contrast && !contrast.passesAA) {
    const suggestion = darkenToPass(accent);
    banners.push(banner('warn',
      `Birtuskil á grænbláum lit eru ${String(contrast.rounded).replace('.', ',')}:1.`,
      `WCAG AA krefst 4,5:1 fyrir texta af þessari stærð.${suggestion ? ` Dekkri tónn (${suggestion.hex}) myndi standast.` : ''}`,
      el('button', { class: 'ghost', text: 'Skoða stillingar', on: { click: () => onNavigate('stillingar') } })));
  }

  if (settings?.protectionChecked && settings.mainProtected === false) {
    banners.push(banner('warn', 'Aðalgreinin er óvarin.',
      'Hægt er að ýta beint á main án yfirferðar. Sjá docs/setup-github.md.'));
  }

  banners.push(banner('info', 'Þessi geymsla er opinber.',
    'Drög og breytingabeiðnir eru sýnileg öllum áður en þú birtir þær.',
    externalLink(`${config.repoUrl}/pulls`, 'Sjá opnar beiðnir', { class: 'ghost-link' })));

  return el('div', { class: 'banners' }, banners);
}

// ---- cards ------------------------------------------------------------------

function renderLiveCard({ config, live }) {
  const head = live?.head;
  return el('section', { class: 'card', 'aria-labelledby': 'live-h' }, [
    el('h2', { id: 'live-h', text: 'Í birtingu núna' }),
    head
      ? el('dl', { class: 'facts' }, [
        el('dt', { text: 'Síðast birt' }),
        el('dd', {}, [
          el('span', { text: formatDateTime(head.date) }),
          el('span', { class: 'muted', text: ` · ${formatRelative(head.date)}` }),
        ]),
        el('dt', { text: 'Af' }),
        el('dd', { text: head.author?.name ?? 'óþekktum' }),
        el('dt', { text: 'Skýring' }),
        el('dd', { text: head.message?.split('\n')[0] ?? '—' }),
        el('dt', { text: 'Útgáfa' }),
        el('dd', {}, [
          externalLink(`${config.repoUrl}/commit/${head.sha}`, head.sha.slice(0, 7), { class: 'mono' }),
        ]),
      ])
      : el('p', { class: 'muted', text: 'Næ ekki í upplýsingar um síðustu birtingu.' }),
    el('p', {}, [externalLink(config.siteUrl, 'Opna stefnuritið eins og íbúar sjá það')]),
  ]);
}

function renderDraftCard({ live, draft, identity, onNavigate }) {
  const changes = draft && live ? diff(live.document, draft.document) : null;
  const total = changes
    ? changes.added.length + changes.removed.length + changes.changed.length + changes.moved.length
    : 0;

  return el('section', { class: 'card', 'aria-labelledby': 'draft-h' }, [
    el('h2', { id: 'draft-h', text: 'Drögin þín' }),
    !draft || !changes || changes.isEmpty
      ? el('p', { class: 'muted', text: 'Þú átt engin óbirt drög.' })
      : el('div', {}, [
        el('p', { text: `${plural(total, 'breyting', 'breytingar')} bíða birtingar.` }),
        el('ul', { class: 'change-list' }, [
          changes.changed.length ? el('li', { text: `${plural(changes.changed.length, 'atriði breytt', 'atriðum breytt')}` }) : null,
          changes.added.length ? el('li', { text: `${plural(changes.added.length, 'atriði bætt við', 'atriðum bætt við')}` }) : null,
          changes.removed.length ? el('li', { text: `${plural(changes.removed.length, 'atriði fjarlægt', 'atriðum fjarlægt')}` }) : null,
          changes.moved.length ? el('li', { text: `${plural(changes.moved.length, 'atriði fært', 'atriðum fært')}` }) : null,
          changes.changedHrefs.length ? el('li', { class: 'strong', text: `${plural(changes.changedHrefs.length, 'hlekkur breyttist', 'hlekkir breyttust')}` }) : null,
        ]),
      ]),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'primary', text: 'Opna ritilinn', on: { click: () => onNavigate('ritstjori') } }),
      draft && changes && !changes.isEmpty
        ? el('button', { class: 'ghost', text: 'Sjá breytingar', on: { click: () => onNavigate('utgafa') } })
        : null,
    ]),
    identity?.role === 'viewer'
      ? el('p', { class: 'hint', text: 'Aðgangslykillinn þinn leyfir aðeins lestur, svo vistun er óvirk.' })
      : null,
  ]);
}

function renderLinkCard({ config, linkReport, onNavigate }) {
  const summary = linkReport?.summary;
  return el('section', { class: 'card', 'aria-labelledby': 'links-h' }, [
    el('h2', { id: 'links-h', text: 'Heilsa hlekkja' }),
    !summary || !linkReport?.generatedAt
      ? el('p', { class: 'muted', text: 'Engin hlekkjaskýrsla hefur verið keyrð enn.' })
      : el('div', {}, [
        el('ul', { class: 'tally' }, [
          tally('ok', summary.ok, 'í lagi'),
          tally('redirect', summary.redirect, 'áframsendingar'),
          tally('broken', summary.broken, 'bilaðir'),
          tally('unknown', summary.unknown, 'óvissir'),
        ]),
        el('p', { class: 'muted', text: `Síðast athugað ${formatDateTime(linkReport.generatedAt)}.` }),
      ]),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'ghost', text: 'Skoða alla hlekki', on: { click: () => onNavigate('hlekkir') } }),
      externalLink(
        `${config.repoUrl}/issues?q=is%3Aissue+is%3Aopen+label%3A${encodeURIComponent(config.brokenLinkIssueLabel)}`,
        'Opin mál um bilaða hlekki', { class: 'ghost-link' }),
    ]),
  ]);
}

function tally(kind, count, label) {
  return el('li', { class: `tally-item tally--${kind}` }, [
    el('span', { class: 'tally-count', text: String(count ?? 0) }),
    el('span', { class: 'tally-label', text: label }),
  ]);
}

function renderActivity({ config, state }) {
  const entries = state.historyPreview ?? [];
  return el('section', { class: 'card', 'aria-labelledby': 'activity-h' }, [
    el('h2', { id: 'activity-h', text: 'Nýlegar breytingar' }),
    entries.length === 0
      ? el('p', { class: 'muted', text: 'Engar skráðar breytingar.' })
      : el('ul', { class: 'activity' }, entries.slice(0, 5).map((entry) => el('li', {}, [
        el('span', { class: 'activity-when', text: formatDateTime(entry.date) }),
        el('span', { class: 'activity-who', text: entry.author }),
        el('span', { class: 'activity-what', text: entry.message }),
        externalLink(entry.url, entry.short, { class: 'mono' }),
      ]))),
    el('p', {}, [externalLink(`${config.repoUrl}/commits/${config.defaultBranch}/${config.documentPath}`,
      'Öll sagan á GitHub')]),
  ]);
}
