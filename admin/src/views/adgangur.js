/**
 * Aðgangur — who can change this, and where that is actually managed.
 *
 * Read-only on purpose. Access is granted on GitHub, and a panel that looked
 * like it could grant access while GitHub quietly decided otherwise would be
 * worse than no screen at all.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { ROLE_LABEL_IS, ROLE_DESCRIPTION_IS } from '../storage/github-client.js';

export function renderAdgangur(root, { state }) {
  clear(root);
  const list = el('div');

  append(root, [
    el('h1', { text: 'Aðgangur' }),
    el('p', { class: 'muted', text: 'Hverjir geta breytt stefnuritinu. Aðgangi er stýrt á GitHub, ekki hér.' }),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Hlutverkin þrjú' }),
      el('dl', { class: 'facts' }, Object.keys(ROLE_LABEL_IS).flatMap((role) => [
        el('dt', { text: ROLE_LABEL_IS[role] }),
        el('dd', { text: ROLE_DESCRIPTION_IS[role] }),
      ])),
      el('p', { class: 'hint', text: 'Hlutverkið ræðst af réttindum aðgangslykilsins á geymslunni: pull → áhorfandi, push → ritstjóri, maintain eða admin → útgefandi.' }),
    ]),
    list,
    el('section', { class: 'card' }, [
      el('h2', { text: 'Breyta aðgangi' }),
      el('p', {}, ['Aðgangur er veittur og afturkallaður í stillingum geymslunnar á GitHub.']),
      externalLink(`${state.config.repoUrl}/settings/access`, 'Opna aðgangsstillingar á GitHub', { class: 'button-link' }),
      el('p', { class: 'hint', text: 'Krefst þess að þú sért stjórnandi geymslunnar eða stofnunarinnar.' }),
    ]),
  ]);

  load();

  async function load() {
    append(list, [el('p', { class: 'muted', text: 'Sæki lista…' })]);
    try {
      const result = await state.storage.collaborators();
      clear(list);

      if (!result.permitted) {
        append(list, [el('section', { class: 'card' }, [
          el('h2', { text: 'Listinn er ekki aðgengilegur' }),
          el('p', { text: 'Aðgangslykillinn þinn má ekki lesa lista yfir notendur. Það þarf Administration: Read-only, sem er valfrjálst.' }),
          el('p', { class: 'hint', text: 'Þetta er ekki villa — flestir lyklar hafa ekki þessa heimild og þurfa hennar ekki.' }),
        ])]);
        return;
      }

      append(list, [el('section', { class: 'card' }, [
        el('h2', { text: `Með skrifaðgang (${result.entries.length})` }),
        el('ul', { class: 'people' }, result.entries.map((person) => el('li', {}, [
          el('span', { class: 'person-login', text: person.login }),
          el('span', { class: 'person-role', text: ROLE_LABEL_IS[person.role] }),
          externalLink(person.url, 'GitHub-síða', { class: 'ghost-link' }),
        ]))),
      ])]);
    } catch (error) {
      clear(list);
      append(list, [el('p', { class: 'bad-text', text: error.message })]);
    }
  }
}
