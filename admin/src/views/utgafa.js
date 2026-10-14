/**
 * Útgáfa — turning a draft into something residents can see.
 *
 * The flow is deliberately slow and legible: show exactly what changes, insist
 * on a note explaining why, then open the pull request and report what the
 * check says about each link as it happens. Nothing merges until the check is
 * green.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { formatTime, formatDateTime, plural } from '../ui/format.js';
import { diff } from '../../../src/diff.js';
import { validate } from '../../../src/validate.js';

const MIN_NOTE = 5;
let publishState = null;

export function renderUtgafa(root, { state, onNavigate }) {
  clear(root);
  const { live, draft } = state;

  if (!draft) {
    append(root, [
      el('h1', { text: 'Útgáfa' }),
      el('p', { class: 'muted', text: 'Þú átt engin drög til að birta.' }),
      el('button', { class: 'primary', text: 'Opna ritilinn', on: { click: () => onNavigate('ritstjori') } }),
    ]);
    return;
  }

  const changes = diff(live.document, draft.document);
  if (changes.isEmpty) {
    append(root, [
      el('h1', { text: 'Útgáfa' }),
      el('p', { class: 'muted', text: 'Drögin þín eru eins og það sem er í birtingu. Ekkert til að birta.' }),
      el('button', { class: 'primary', text: 'Opna ritilinn', on: { click: () => onNavigate('ritstjori') } }),
    ]);
    return;
  }

  const validation = validate(draft.document);
  const progress = el('div', { class: 'publish-progress', role: 'status', 'aria-live': 'polite' });

  const note = el('input', {
    type: 'text', id: 'publish-note', maxlength: '72',
    placeholder: 't.d. Uppfæra slóð á vafrakökustefnu',
    'aria-describedby': 'note-hint',
  });
  const publishButton = el('button', {
    class: 'primary', text: 'Birta',
    disabled: !validation.ok || state.identity.role !== 'publisher',
    on: { click: () => startPublish() },
  });
  note.addEventListener('input', () => {
    publishButton.disabled = note.value.trim().length < MIN_NOTE
      || !validation.ok || state.identity.role !== 'publisher';
  });
  publishButton.disabled = true;

  append(root, [
    el('h1', { text: 'Útgáfa' }),
    renderChanges(changes),
    !validation.ok
      ? el('div', { class: 'banner banner--error', role: 'alert' }, [
        el('div', { class: 'banner-body' }, [
          el('strong', { text: `${plural(validation.errors.length, 'villa', 'villur')} stöðva birtingu.` }),
          el('span', { text: 'Opnaðu ritilinn og lagaðu þær fyrst.' }),
        ]),
        el('button', { class: 'ghost', text: 'Í ritilinn', on: { click: () => onNavigate('ritstjori') } }),
      ])
      : null,
    state.identity.role !== 'publisher'
      ? el('div', { class: 'banner banner--warn', role: 'status' }, [
        el('div', { class: 'banner-body' }, [
          el('strong', { text: 'Þú getur vistað drög en ekki birt.' }),
          el('span', { text: 'Til þess þarf lykil með Pull requests: Read and write og heimild til að sameina.' }),
        ]),
      ])
      : null,
    el('section', { class: 'card' }, [
      el('h2', { text: 'Skýring á breytingunni' }),
      el('label', { for: 'publish-note', text: 'Hverju varstu að breyta?' }),
      el('p', { class: 'hint', id: 'note-hint' },
        ['Þessi texti verður titill breytingabeiðninnar og stendur í sögunni. ',
          'Skrifaðu það sem þú myndir segja samstarfsmanni.']),
      note,
      el('div', { class: 'card-actions' }, [publishButton]),
    ]),
    progress,
  ]);

  async function startPublish() {
    publishState = { step: 'opna', pull: null, check: null, error: null };
    publishButton.disabled = true;
    note.disabled = true;
    drawProgress();

    try {
      const pull = await state.storage.publish({ login: state.identity.login, note: note.value.trim() });
      publishState.pull = pull;
      publishState.step = 'athuga';
      drawProgress();

      const check = await pollCheck(pull.number);
      publishState.check = check;

      if (check.conclusion !== 'success') {
        publishState.step = 'fall';
        drawProgress();
        return;
      }

      publishState.step = 'sameina';
      drawProgress();
      const merged = await state.storage.merge({ number: pull.number, note: note.value.trim() });
      publishState.merged = merged;
      publishState.step = 'birt';
      drawProgress();
    } catch (error) {
      publishState.error = error;
      publishState.step = 'villa';
      drawProgress();
    }
  }

  async function pollCheck(number) {
    const deadline = Date.now() + 5 * 60 * 1000;
    for (;;) {
      const check = await state.storage.checkStatus({ number });
      publishState.check = check;
      drawProgress();
      if (check.state === 'completed') return check;
      if (Date.now() > deadline) return { ...check, conclusion: 'timed_out' };
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  function drawProgress() {
    clear(progress);
    if (!publishState) return;
    const { step, pull, check, error, merged } = publishState;

    const steps = [
      ['opna', 'Opna breytingabeiðni'],
      ['athuga', 'Athuga skjalið og hlekkina'],
      ['sameina', 'Sameina við main'],
      ['birt', 'Birt'],
    ];
    const reached = steps.findIndex(([id]) => id === step);

    append(progress, [
      el('section', { class: 'card' }, [
        el('h2', { text: 'Framvinda' }),
        el('ol', { class: 'steps-progress' }, steps.map(([id, label], index) => el('li', {
          class: `step${index < reached || step === 'birt' ? ' is-done' : ''}${id === step ? ' is-current' : ''}`,
          text: label,
        }))),
        pull ? el('p', {}, ['Beiðni ', externalLink(pull.url, `#${pull.number}`), pull.created ? ' stofnuð.' : ' uppfærð.']) : null,
        check && step === 'athuga'
          ? el('p', { class: 'muted', text: check.state === 'completed' ? 'Athugun lokið.' : 'Athugun keyrir…' })
          : null,
        step === 'fall' ? renderFailure(check) : null,
        step === 'villa' ? el('p', { class: 'bad-text', text: error.message }) : null,
        step === 'birt' ? renderDone(merged) : null,
      ]),
    ]);
  }

  function renderFailure(check) {
    return el('div', {}, [
      el('p', { class: 'bad-text', text: 'Athugunin fór ekki í gegn, svo ekkert var birt.' }),
      el('ul', { class: 'check-runs' }, (check.runs ?? []).map((run) => el('li', {}, [
        el('span', { text: `${run.name}: ${run.conclusion ?? run.status}` }),
        run.url ? externalLink(run.url, 'sjá niðurstöðu') : null,
      ]))),
      el('p', {}, ['Oftast er það hlekkur sem svarar ekki. ',
        externalLink(check.url, 'Opnaðu athugunina'), ' til að sjá hvaða skjal það var.']),
      el('button', { class: 'ghost', text: 'Fara aftur í ritilinn', on: { click: () => onNavigate('ritstjori') } }),
    ]);
  }

  function renderDone(merged) {
    return el('div', {}, [
      el('p', { class: 'ok-text', text: `Birt kl. ${formatTime(merged.mergedAt)}.` }),
      el('p', { class: 'hint' }, [
        'GitHub Pages geymir afrit í allt að ~10 mínútur, svo breytingin getur verið örlítið á eftir ',
        'á vefnum sjálfum. Hún er komin inn hjá GitHub strax.',
      ]),
      externalLink(state.config.siteUrl, 'Opna stefnuritið'),
    ]);
  }
}

function renderChanges(changes) {
  const row = (entry, kind) => el('li', { class: `change change--${kind}` }, [
    el('span', { class: 'change-kind', text: { added: 'Nýtt', removed: 'Fjarlægt', changed: 'Breytt', moved: 'Fært' }[kind] }),
    el('span', { class: 'change-label', text: entry.label }),
    kind === 'changed'
      ? el('ul', { class: 'change-fields' }, entry.changes.map((change) => el('li', {}, [
        el('span', { class: 'muted', text: `${change.field}: ` }),
        el('span', { class: 'was', text: String(change.from ?? '(ekkert)') }),
        el('span', { text: ' → ' }),
        el('span', { class: 'now', text: String(change.to ?? '(ekkert)') }),
      ])))
      : null,
  ]);

  return el('section', { class: 'card' }, [
    el('h2', { text: 'Hvað breytist' }),
    changes.changedHrefs.length
      ? el('p', { class: 'strong', text: `${plural(changes.changedHrefs.length, 'hlekkur breytist', 'hlekkir breytast')} — þeir verða prófaðir sjálfkrafa.` })
      : el('p', { class: 'muted', text: 'Engir hlekkir breytast.' }),
    el('ul', { class: 'change-rows' }, [
      ...changes.changed.map((entry) => row(entry, 'changed')),
      ...changes.added.map((entry) => row(entry, 'added')),
      ...changes.removed.map((entry) => row(entry, 'removed')),
      ...changes.moved.map((entry) => row(entry, 'moved')),
    ]),
  ]);
}

export function resetPublishState() { publishState = null; }
