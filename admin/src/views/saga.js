/**
 * Saga — every version the document has ever had, and a way back to any of them.
 *
 * "Endurheimta" loads an old version into a new draft rather than force-pushing
 * over history. Undoing a change should leave a record that it was undone, not
 * make it look as though it never happened.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { formatDateTime, formatRelative, plural } from '../ui/format.js';
import { diff } from '../../../src/diff.js';

export function renderSaga(root, { state, onNavigate }) {
  clear(root);
  const entries = state.historyPreview ?? [];
  const detail = el('div', { class: 'history-detail' });
  const selected = new Set();

  append(root, [
    el('h1', { text: 'Saga' }),
    el('p', { class: 'muted' }, [
      'Allar útgáfur skjalsins. Git geymir þær varanlega, og hver þeirra er líka til sem ',
      el('span', { text: 'óbreytanlegt afrit á vefnum.' }),
    ]),
    entries.length === 0
      ? el('p', { class: 'muted', text: 'Engar skráðar breytingar.' })
      : el('section', { class: 'card' }, [
        el('h2', { text: 'Útgáfur' }),
        el('p', { class: 'hint', text: 'Hakaðu við tvær útgáfur til að bera þær saman.' }),
        el('ul', { class: 'history-list' }, entries.map((entry) => renderEntry(entry))),
      ]),
    detail,
  ]);

  function renderEntry(entry) {
    const checkbox = el('input', {
      type: 'checkbox', id: `cmp-${entry.short}`,
      'aria-label': `Velja útgáfu ${entry.short} til samanburðar`,
      on: {
        change: () => {
          if (checkbox.checked) selected.add(entry.sha); else selected.delete(entry.sha);
          // Two at a time: comparing three versions is not a thing anybody means.
          if (selected.size > 2) {
            selected.delete([...selected][0]);
            root.querySelectorAll('.history-list input[type=checkbox]').forEach((box) => {
              const sha = box.dataset.sha;
              box.checked = selected.has(sha);
            });
          }
          if (selected.size === 2) compare([...selected]);
        },
      },
      dataset: { sha: entry.sha },
    });

    return el('li', { class: 'history-item' }, [
      checkbox,
      el('div', { class: 'history-body' }, [
        el('span', { class: 'history-message', text: entry.message }),
        el('span', { class: 'history-meta' }, [
          el('span', { text: formatDateTime(entry.date) }),
          el('span', { class: 'muted', text: ` · ${formatRelative(entry.date)} · ${entry.author}` }),
        ]),
      ]),
      el('div', { class: 'history-actions' }, [
        el('button', { class: 'ghost', text: 'Skoða', on: { click: () => view(entry) } }),
        state.identity.role === 'viewer'
          ? null
          : el('button', { class: 'ghost', text: 'Endurheimta', on: { click: () => restore(entry) } }),
        externalLink(`${state.config.siteUrl}/${state.config.paths.revisions}/${entry.short}.json`,
          'JSON', { class: 'mono' }),
        externalLink(entry.url, entry.short, { class: 'mono' }),
      ]),
    ]);
  }

  async function view(entry) {
    clear(detail);
    append(detail, [el('p', { class: 'muted', text: 'Sæki útgáfuna…' })]);
    try {
      const document_ = await state.storage.revision({ sha: entry.sha });
      const changes = diff(document_, state.live.document);
      clear(detail);
      append(detail, [
        el('section', { class: 'card' }, [
          el('h2', { text: `Útgáfa ${entry.short}` }),
          el('p', { class: 'muted', text: `${formatDateTime(entry.date)} · ${entry.author} · ${entry.message}` }),
          changes.isEmpty
            ? el('p', { class: 'ok-text', text: 'Þessi útgáfa er eins og sú sem er í birtingu.' })
            : el('div', {}, [
              el('p', { text: `Munur frá því sem er í birtingu núna: ${summarise(changes)}.` }),
              el('ul', { class: 'change-rows' }, changes.changed.slice(0, 20).map((change) => el('li', { class: 'change change--changed' }, [
                el('span', { class: 'change-label', text: change.label }),
                el('ul', { class: 'change-fields' }, change.changes.map((field) => el('li', {}, [
                  el('span', { class: 'muted', text: `${field.field}: ` }),
                  el('span', { class: 'was', text: String(field.from ?? '(ekkert)') }),
                  el('span', { text: ' → ' }),
                  el('span', { class: 'now', text: String(field.to ?? '(ekkert)') }),
                ]))),
              ]))),
            ]),
        ]),
      ]);
    } catch (error) {
      clear(detail);
      append(detail, [el('p', { class: 'bad-text', text: error.message })]);
    }
  }

  async function compare(shas) {
    clear(detail);
    append(detail, [el('p', { class: 'muted', text: 'Ber saman…' })]);
    try {
      const [older, newer] = await Promise.all(shas.map((sha) => state.storage.revision({ sha })));
      const changes = diff(older, newer);
      const a = entries.find((e) => e.sha === shas[0]);
      const b = entries.find((e) => e.sha === shas[1]);
      clear(detail);
      append(detail, [
        el('section', { class: 'card' }, [
          el('h2', { text: `Samanburður ${a.short} → ${b.short}` }),
          changes.isEmpty
            ? el('p', { class: 'ok-text', text: 'Skjalið er eins í báðum útgáfum.' })
            : el('div', {}, [
              el('p', { text: summarise(changes) }),
              el('ul', { class: 'change-rows' }, [
                ...changes.changed.map((entry) => el('li', { class: 'change change--changed' }, [
                  el('span', { class: 'change-label', text: entry.label }),
                  el('ul', { class: 'change-fields' }, entry.changes.map((field) => el('li', {}, [
                    el('span', { class: 'muted', text: `${field.field}: ` }),
                    el('span', { class: 'was', text: String(field.from ?? '(ekkert)') }),
                    el('span', { text: ' → ' }),
                    el('span', { class: 'now', text: String(field.to ?? '(ekkert)') }),
                  ]))),
                ])),
                ...changes.added.map((entry) => el('li', { class: 'change change--added' }, [
                  el('span', { class: 'change-kind', text: 'Nýtt' }),
                  el('span', { class: 'change-label', text: entry.label }),
                ])),
                ...changes.removed.map((entry) => el('li', { class: 'change change--removed' }, [
                  el('span', { class: 'change-kind', text: 'Fjarlægt' }),
                  el('span', { class: 'change-label', text: entry.label }),
                ])),
              ]),
            ]),
        ]),
      ]);
    } catch (error) {
      clear(detail);
      append(detail, [el('p', { class: 'bad-text', text: error.message })]);
    }
  }

  async function restore(entry) {
    clear(detail);
    append(detail, [el('p', { class: 'muted', text: 'Sæki útgáfuna…' })]);
    try {
      const document_ = await state.storage.revision({ sha: entry.sha });
      // Read the draft's current sha rather than trusting the one from page
      // load: minutes may have passed, and the branch may have moved since.
      const current = await state.storage.readDraft({ login: state.identity.login }).catch(() => null);
      await state.storage.saveDraft({
        login: state.identity.login,
        document: document_,
        sha: current?.sha,
        message: `Endurheimta útgáfu ${entry.short}`,
      });
      clear(detail);
      append(detail, [
        el('div', { class: 'banner banner--info', role: 'status' }, [
          el('div', { class: 'banner-body' }, [
            el('strong', { text: `Útgáfa ${entry.short} er komin í drögin þín.` }),
            el('span', { text: 'Ekkert hefur verið birt. Skoðaðu hana í ritlinum og birtu þegar þú ert sátt(ur).' }),
          ]),
          el('button', { class: 'ghost', text: 'Opna ritilinn', on: { click: () => onNavigate('ritstjori') } }),
        ]),
      ]);
    } catch (error) {
      clear(detail);
      append(detail, [el('p', { class: 'bad-text', text: error.message })]);
    }
  }
}

function summarise(changes) {
  const parts = [];
  if (changes.changed.length) parts.push(plural(changes.changed.length, 'atriði breytt', 'atriðum breytt'));
  if (changes.added.length) parts.push(plural(changes.added.length, 'atriði bætt við', 'atriðum bætt við'));
  if (changes.removed.length) parts.push(plural(changes.removed.length, 'atriði fjarlægt', 'atriðum fjarlægt'));
  if (changes.moved.length) parts.push(plural(changes.moved.length, 'atriði fært', 'atriðum fært'));
  return parts.join(', ') || 'engar breytingar';
}
