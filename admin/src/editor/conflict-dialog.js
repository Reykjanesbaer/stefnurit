/**
 * The conflict dialog.
 *
 * Shown only when two people genuinely disagree — same field set two ways, same
 * node moved two ways, or one side deleting what the other edited. Everything
 * else was merged before this opened.
 *
 * Each conflict is a choice between two concrete values, shown side by side,
 * because "resolve conflicts" is meaningless to somebody who just wanted to fix
 * a link.
 */
import { el, append, clear } from '../ui/dom.js';
import { resolveConflict } from '../../../src/merge.js';

const FIELD_LABEL = {
  label: 'Texti', title: 'Fyrirsögn', href: 'Hlekkur',
  kind: 'Tegund', colorToken: 'Litur', note: 'Skýring',
};

const KIND_TEXT = {
  field: 'Þið breyttuð sama reitnum í sitt hvora áttina.',
  'delete-vs-edit': 'Þú breyttir þessu en einhver annar eyddi því.',
  'edit-vs-delete': 'Þú eyddir þessu en einhver annar breytti því.',
  move: 'Þið færðuð þetta á sitt hvorn staðinn.',
  'add-vs-delete-parent': 'Einhver bætti þessu við í flokk sem þú eyddir.',
};

/**
 * @returns {Promise<object|null>} the resolved document, or null if cancelled
 */
export function showConflictDialog({ conflicts, merged, theirs }) {
  return new Promise((resolve) => {
    const choices = new Map(conflicts.map((conflict, index) => [index, 'mine']));

    const dialog = el('dialog', { class: 'conflict-dialog', 'aria-labelledby': 'conflict-h' });

    const list = el('div', { class: 'conflict-list' });
    conflicts.forEach((conflict, index) => {
      list.append(renderConflict(conflict, index, choices));
    });

    append(dialog, [
      el('div', { class: 'conflict-head' }, [
        el('h2', { id: 'conflict-h', text: 'Einhver annar breytti skjalinu á meðan' }),
        el('p', {
          text: `Flestar breytingar voru sameinaðar sjálfkrafa. ${conflicts.length === 1
            ? 'Eitt atriði stangast á og þú þarft að velja.'
            : `${conflicts.length} atriði stangast á og þú þarft að velja.`}`,
        }),
        el('p', { class: 'hint', text: 'Ekkert er vistað fyrr en þú staðfestir. Breytingarnar þínar eru óskemmdar þangað til.' }),
      ]),
      list,
      el('div', { class: 'conflict-actions' }, [
        el('button', {
          class: 'ghost', text: 'Hætta við', value: 'cancel',
          on: { click: () => { dialog.close(); cleanUp(); resolve(null); } },
        }),
        el('button', {
          class: 'primary', text: 'Nota valið og halda áfram',
          on: {
            click: () => {
              let document_ = merged;
              conflicts.forEach((conflict, index) => {
                document_ = resolveConflict(document_, conflict, choices.get(index), theirs);
              });
              dialog.close();
              cleanUp();
              resolve(document_);
            },
          },
        }),
      ]),
    ]);

    // Escape must behave like "Hætta við", not like a silent accept.
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dialog.close();
      cleanUp();
      resolve(null);
    });

    function cleanUp() { dialog.remove(); }

    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input')?.focus();
  });
}

function renderConflict(conflict, index, choices) {
  const name = `conflict-${index}`;
  const fieldName = conflict.field ? (FIELD_LABEL[conflict.field] ?? conflict.field) : null;

  const option = (side, value, labelText) => {
    const input = el('input', {
      type: 'radio', name, id: `${name}-${side}`, value: side,
      checked: side === 'mine',
      on: { change: () => choices.set(index, side) },
    });
    return el('div', { class: 'conflict-option' }, [
      input,
      el('label', { for: `${name}-${side}` }, [
        el('span', { class: 'conflict-side', text: labelText }),
        el('span', { class: 'conflict-value', text: describeValue(value) }),
      ]),
    ]);
  };

  return el('section', { class: 'conflict' }, [
    el('h3', { text: conflict.label + (fieldName ? ` — ${fieldName}` : '') }),
    el('p', { class: 'conflict-why', text: KIND_TEXT[conflict.kind] ?? '' }),
    conflict.base !== null && conflict.base !== undefined
      ? el('p', { class: 'conflict-base' }, [
        el('span', { class: 'muted', text: 'Var áður: ' }),
        el('span', { text: describeValue(conflict.base) }),
      ])
      : null,
    el('div', { class: 'conflict-options', role: 'radiogroup', 'aria-label': `Val fyrir ${conflict.label}` }, [
      option('mine', conflict.mine, 'Nota mína breytingu'),
      option('theirs', conflict.theirs, 'Nota þeirra breytingu'),
    ]),
  ]);
}

function describeValue(value) {
  if (value === null || value === undefined) return '(eytt)';
  if (typeof value === 'string') return value === '' ? '(tómt)' : value;
  if (typeof value === 'object') {
    if ('parentId' in value) return `staðsetning ${value.index + 1}`;
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${v}`).join(', ') || '(engin gildi)';
  }
  return String(value);
}
