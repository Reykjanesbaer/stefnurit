/**
 * Hlekkir — the weekly link report, made usable.
 *
 * The important column is not the status code: it is whether a document that
 * used to be there still is, and whether the file behind an unchanged URL has
 * quietly been replaced.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { formatDateTime, formatBytes, plural } from '../ui/format.js';
import { OUTCOME_IS } from './link-labels.js';

const FILTERS = [
  { id: 'allt', label: 'Allt', test: () => true },
  { id: 'broken', label: 'Bilaðir', test: (l) => l.outcome === 'broken' },
  { id: 'redirect', label: 'Áframsendingar', test: (l) => l.outcome === 'redirect' },
  { id: 'unknown', label: 'Óvissir', test: (l) => l.outcome === 'unknown' },
  { id: 'stale', label: 'Breytt skjöl', test: (l) => l.lastModifiedChanged },
];

export function renderHlekkir(root, { state }) {
  clear(root);
  const report = state.linkReport;

  if (!report?.links?.length) {
    append(root, [
      el('h1', { text: 'Hlekkir' }),
      el('p', { class: 'muted', text: 'Engin hlekkjaskýrsla hefur verið keyrð enn.' }),
      el('p', {}, ['Hún keyrir sjálfkrafa á mánudögum. ',
        externalLink(`${state.config.repoUrl}/actions/workflows/pages.yml`, 'Sjá keyrslur á GitHub')]),
    ]);
    return;
  }

  let active = 'allt';
  const tbody = el('tbody');
  const count = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });

  const filterButtons = FILTERS.map((filter) => el('button', {
    class: `ghost${filter.id === active ? ' is-current' : ''}`,
    'aria-pressed': String(filter.id === active),
    text: filter.label,
    on: {
      click: () => {
        active = filter.id;
        root.querySelectorAll('.filters button').forEach((button, index) => {
          const current = FILTERS[index].id === active;
          button.classList.toggle('is-current', current);
          button.setAttribute('aria-pressed', String(current));
        });
        draw();
      },
    },
  }));

  append(root, [
    el('h1', { text: 'Hlekkir' }),
    el('p', { class: 'muted', text: `Síðast athugað ${formatDateTime(report.generatedAt)}.` }),
    el('div', { class: 'banner banner--info', role: 'status' }, [
      el('div', { class: 'banner-body' }, [
        el('strong', { text: 'Hvað þýðir „óviss“?' }),
        el('span', {
          text: 'Vefþjónninn svaraði ekki, hafnaði beiðninni eða tók of langan tíma. '
            + 'Oftast þýðir það að hann hleypir GitHub ekki inn — ekki að skjalið sé horfið. '
            + 'Prófaðu slóðina í vafra áður en þú breytir nokkru.',
        }),
      ]),
    ]),
    el('div', { class: 'links-toolbar' }, [
      el('div', { class: 'filters', role: 'group', 'aria-label': 'Sía hlekki' }, filterButtons),
      el('div', { class: 'links-actions' }, [
        el('button', { class: 'ghost', text: 'Sækja CSV', on: { click: () => downloadCsv(report) } }),
        el('button', { class: 'ghost', text: 'Athuga núna', on: { click: (event) => checkNow(event.currentTarget) } }),
      ]),
    ]),
    count,
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'links-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', text: 'Staða' }),
          el('th', { scope: 'col', text: 'Skjal' }),
          el('th', { scope: 'col', text: 'Svar' }),
          el('th', { scope: 'col', text: 'Gerð' }),
          el('th', { scope: 'col', text: 'Stærð' }),
          el('th', { scope: 'col', text: 'Breytt' }),
          el('th', { scope: 'col', text: 'Slóð' }),
        ])]),
        tbody,
      ]),
    ]),
  ]);

  function draw() {
    clear(tbody);
    const filter = FILTERS.find((f) => f.id === active);
    const rows = report.links.filter(filter.test);
    count.textContent = `${plural(rows.length, 'hlekkur', 'hlekkir')} af ${report.links.length}.`;

    for (const link of rows) {
      tbody.append(el('tr', {}, [
        el('td', {}, [el('span', { class: `link-badge link-badge--${link.outcome}`, text: OUTCOME_IS[link.outcome] ?? link.outcome })]),
        el('td', { text: link.label }),
        el('td', { class: 'mono', text: String(link.status ?? link.errorCode ?? link.note ?? '—') }),
        el('td', { text: shortType(link.contentType) }),
        el('td', { text: formatBytes(link.size) }),
        el('td', {}, link.lastModifiedChanged
          ? [el('span', { class: 'flagged', title: `Áður: ${link.previousLastModified}`, text: 'nýtt skjal' })]
          : [el('span', { class: 'muted', text: link.lastModified ? link.lastModified.slice(5, 16) : '—' })]),
        el('td', {}, [externalLink(link.href, shorten(link.href), { class: 'mono' })]),
      ]));
    }

    if (!rows.length) {
      tbody.append(el('tr', {}, [el('td', { colspan: '7', class: 'muted', text: 'Ekkert fellur undir þessa síu.' })]));
    }
  }

  async function checkNow(button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Bið um athugun…';
    const result = await state.storage.requestLinkCheck();
    if (result.dispatched) {
      button.textContent = 'Athugun hafin';
      append(root, [el('p', { class: 'ok-text', role: 'status', text: 'Athugun er hafin. Niðurstaðan birtist hér eftir næstu útgáfu, eftir nokkrar mínútur.' })]);
    } else {
      button.textContent = original;
      button.disabled = false;
      append(root, [el('p', { class: 'warn-text', role: 'status' }, [
        'Aðgangslykillinn þinn má ekki ræsa keyrslur (þarf Actions: Read and write). ',
        externalLink(`${state.config.repoUrl}/actions/workflows/pages.yml`, 'Ræstu hana handvirkt á GitHub'),
        '.',
      ])]);
    }
  }

  draw();
}

function shortType(value) {
  if (!value) return '—';
  if (value.includes('pdf')) return 'PDF';
  if (value.includes('html')) return 'Vefsíða';
  return value.split(';')[0];
}

const shorten = (url) => (url.length > 46 ? `${url.slice(0, 30)}…${url.slice(-12)}` : url);

/**
 * CSV for a spreadsheet. Semicolon-separated: Icelandic Excel treats the comma
 * as a decimal separator, so a comma-separated file opens as one column.
 */
function downloadCsv(report) {
  const header = ['Skjal', 'Staða', 'Svar', 'Slóð', 'Endaslóð', 'Gerð', 'Stærð', 'Breytt', 'Athugað', 'Bilanir í röð'];
  const rows = report.links.map((link) => [
    link.label, OUTCOME_IS[link.outcome] ?? link.outcome, link.status ?? link.errorCode ?? '',
    link.href, link.finalUrl ?? '', link.contentType ?? '', link.size ?? '',
    link.lastModified ?? '', link.checkedAt ?? '', link.consecutiveFailures ?? 0,
  ]);

  const escape = (value) => {
    const text = String(value ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // BOM so Excel reads it as UTF-8 and the Icelandic characters survive.
  const csv = '﻿' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hlekkir-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
