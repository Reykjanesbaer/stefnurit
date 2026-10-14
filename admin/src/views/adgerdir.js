/**
 * Aðgerðir — who published what, and when.
 *
 * Read-only by design. The record is git's, not this panel's, and nothing here
 * can edit it; that is the point of keeping it in git in the first place.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { formatDateTime, formatRelative } from '../ui/format.js';

export function renderAdgerdir(root, { state }) {
  clear(root);
  const list = el('div');

  append(root, [
    el('h1', { text: 'Aðgerðir' }),
    el('p', { class: 'muted', text: 'Allar birtingar, í tímaröð. Þetta er ekki hægt að breyta eða eyða héðan.' }),
    el('div', { class: 'banner banner--info', role: 'status' }, [
      el('div', { class: 'banner-body' }, [
        el('strong', { text: 'Sagan er varanleg.' }),
        el('span', {
          text: 'Git geymir hverja útgáfu að eilífu, ásamt nafni og netfangi þess sem breytti. '
            + 'Það er kostur þegar þarf að rekja breytingu — og það þýðir líka að ekkert hverfur alveg.',
        }),
      ]),
      externalLink(`${state.config.repoUrl}/commits/${state.config.defaultBranch}`, 'Sjá á GitHub', { class: 'ghost-link' }),
    ]),
    list,
  ]);

  load();

  async function load() {
    append(list, [el('p', { class: 'muted', text: 'Sæki sögu…' })]);
    try {
      const [merged, commits] = await Promise.all([
        state.storage.activity({ limit: 25 }).catch(() => []),
        state.storage.history({ limit: 25 }).catch(() => []),
      ]);
      clear(list);

      append(list, [
        el('section', { class: 'card' }, [
          el('h2', { text: 'Birtingar í gegnum stjórnborðið' }),
          merged.length === 0
            ? el('p', { class: 'muted', text: 'Engar breytingabeiðnir hafa verið sameinaðar enn.' })
            : el('ul', { class: 'audit-list' }, merged.map((entry) => el('li', {}, [
              el('span', { class: 'audit-when', text: formatDateTime(entry.mergedAt) }),
              el('span', { class: 'audit-who', text: entry.author }),
              el('span', { class: 'audit-what', text: entry.title }),
              externalLink(entry.url, `#${entry.number}`, { class: 'mono' }),
            ]))),
        ]),
        el('section', { class: 'card' }, [
          el('h2', { text: 'Allar breytingar á skjalinu' }),
          el('p', { class: 'hint', text: 'Þar með taldar breytingar gerðar beint á GitHub.' }),
          commits.length === 0
            ? el('p', { class: 'muted', text: 'Engar skráðar breytingar.' })
            : el('ul', { class: 'audit-list' }, commits.map((entry) => el('li', {}, [
              el('span', { class: 'audit-when', text: formatDateTime(entry.date) }),
              el('span', { class: 'audit-who', text: entry.author }),
              el('span', { class: 'audit-what', text: entry.message }),
              el('span', { class: 'muted', text: formatRelative(entry.date) }),
              externalLink(entry.url, entry.short, { class: 'mono' }),
            ]))),
        ]),
      ]);
    } catch (error) {
      clear(list);
      append(list, [el('p', { class: 'bad-text', text: error.message })]);
    }
  }
}
