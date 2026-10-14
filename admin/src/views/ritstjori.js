/**
 * Ritstjóri — the editing surface.
 *
 * Three panes: a live preview of exactly what residents will see, a tree of the
 * document, and an inspector for whatever is selected. Everything the old
 * demo/edit.html could do, plus undo, autosave, validation and a save that
 * cannot silently overwrite somebody else's work.
 *
 * No innerHTML anywhere: every label here is text somebody can type.
 */
import { el, append, clear, externalLink, field, announce } from '../ui/dom.js';
import { formatTime, plural } from '../ui/format.js';
import { validate, issuesInIcelandic } from '../../../src/validate.js';
import { formatJson } from '../../../src/format.js';
import { diff } from '../../../src/diff.js';
import { History } from '../editor/history.js';
import { createAutosaver, loadLocal, clearLocal, pruneLocal } from '../editor/autosave.js';
import { update } from '../state.js';
import { OUTCOME_IS } from './link-labels.js';
import '../../../src/stefnu-rit.js';

const COLOR_LABEL = {
  primary: 'Blár (primary)',
  accent: 'Grænblár (accent)',
  pill: 'Ljósblár (pill)',
};
const KIND_LABEL = {
  pdf: 'PDF-skjal', page: 'Vefsíða', external: 'Ytri vefur', none: 'Enginn hlekkur',
};
/**
 * The editor's panes are narrower than the widget's 1400px stacking
 * breakpoint, so "Breitt" needs a stage wide enough for the column tree and a
 * scrollbar — otherwise the editor would only ever preview the stacked
 * fallback while production showed the tree.
 */
const PREVIEW_WIDTHS = [
  { id: 'breitt', label: 'Breitt', width: '1460px', fixed: true },
  { id: 'staflad', label: 'Staflað', width: '860px', fixed: false },
  { id: 'simi', label: 'Sími', width: '390px', fixed: false },
];

/** Module-level so the editor survives navigating away and back. */
let session = null;

export function renderRitstjori(root, { state, onNavigate }) {
  clear(root);

  if (!state.live) {
    append(root, [el('p', { class: 'muted', text: 'Næ ekki í skjalið.' })]);
    return;
  }
  if (state.identity.role === 'viewer') {
    append(root, [
      el('h1', { text: 'Ritstjóri' }),
      el('div', { class: 'banner banner--warn', role: 'status' }, [
        el('div', { class: 'banner-body' }, [
          el('strong', { text: 'Aðgangslykillinn þinn leyfir aðeins lestur.' }),
          el('span', { text: 'Til að breyta þarf lykil með Contents: Read and write.' }),
        ]),
      ]),
    ]);
    return;
  }

  if (!session || session.baseCommit !== state.live.commit) {
    session = createSession(state);
  }
  session.mount(root, { state, onNavigate });
}

/** Everything the editor remembers between renders. */
function createSession(state) {
  const base = state.draft?.document ?? state.live.document;
  const baseCommit = state.live.commit;
  const login = state.identity.login;

  const restored = loadLocal(login, baseCommit);
  pruneLocal(login, baseCommit);

  const history = new History(restored?.document ?? base);
  const autosaver = createAutosaver({
    login, baseCommitSha: baseCommit,
    onSaved: (at) => { session.savedAt = at; session.refreshStatus?.(); },
  });

  return {
    baseCommit,
    login,
    history,
    autosaver,
    // The sha of the blob we loaded — sent back on write so GitHub can refuse a
    // stale update instead of letting it overwrite somebody.
    remoteSha: state.draft?.sha ?? state.live.sha,
    draftBranchSha: state.draft?.sha ?? null,
    savedAt: restored?.savedAt ?? null,
    restoredFromDevice: Boolean(restored),
    selected: null,
    previewWidth: 'breitt',
    saving: false,
    message: null,
    mount: mountEditor,
    refreshStatus: null,
  };
}

// ---- rendering --------------------------------------------------------------

function mountEditor(root, { state, onNavigate }) {
  const { history } = session;

  const preview = el('stefnu-rit', { id: 'forskodun' });
  const previewBox = el('div', { class: 'preview-stage' }, [preview]);
  const previewScroller = el('div', { class: 'preview-scroller' }, [previewBox]);
  const treeBox = el('div', { class: 'tree' });
  const inspectorBox = el('div', { class: 'inspector' });
  const validationBox = el('div', { class: 'validation' });
  const statusLine = el('p', { class: 'save-status', role: 'status', 'aria-live': 'polite' });

  const undoButton = el('button', {
    class: 'ghost', text: 'Afturkalla', title: 'Ctrl+Z',
    on: { click: () => { if (history.undo()) afterChange({ rebuildTree: true }); } },
  });
  const redoButton = el('button', {
    class: 'ghost', text: 'Endurtaka', title: 'Ctrl+Shift+Z',
    on: { click: () => { if (history.redo()) afterChange({ rebuildTree: true }); } },
  });
  const saveButton = el('button', {
    class: 'primary', text: 'Vista drög',
    on: { click: () => saveDraft() },
  });

  append(root, [
    el('div', { class: 'editor-head' }, [
      el('h1', { text: 'Ritstjóri' }),
      el('div', { class: 'editor-actions' }, [
        undoButton, redoButton, saveButton,
      ]),
    ]),
    statusLine,
    el('div', { class: 'preview-bar' }, [
      el('span', { class: 'preview-label', id: 'breidd-label', text: 'Forskoðun:' }),
      el('div', { class: 'width-switch', role: 'group', 'aria-labelledby': 'breidd-label' },
        PREVIEW_WIDTHS.map((option) => el('button', {
          class: `ghost${session.previewWidth === option.id ? ' is-current' : ''}`,
          'aria-pressed': String(session.previewWidth === option.id),
          text: option.label,
          on: {
            click: () => {
              session.previewWidth = option.id;
              applyPreviewWidth();
              root.querySelectorAll('.width-switch button').forEach((button, index) => {
                const current = PREVIEW_WIDTHS[index].id === session.previewWidth;
                button.classList.toggle('is-current', current);
                button.setAttribute('aria-pressed', String(current));
              });
            },
          },
        }))),
    ]),
    previewScroller,
    el('div', { class: 'editor-grid' }, [
      el('section', { class: 'card editor-pane', 'aria-labelledby': 'tree-h' }, [
        el('h2', { id: 'tree-h', text: 'Efnistré' }),
        el('p', { class: 'hint', text: 'Veldu atriði til að breyta því. Örvatakkarnir færa það til.' }),
        treeBox,
      ]),
      el('div', { class: 'editor-side' }, [
        el('section', { class: 'card', 'aria-labelledby': 'inspector-h' }, [
          el('h2', { id: 'inspector-h', text: 'Breyta' }),
          inspectorBox,
        ]),
        el('section', { class: 'card', 'aria-labelledby': 'validation-h' }, [
          el('h2', { id: 'validation-h', text: 'Yfirferð' }),
          validationBox,
        ]),
      ]),
    ]),
  ]);

  function applyPreviewWidth() {
    const option = PREVIEW_WIDTHS.find((o) => o.id === session.previewWidth);
    previewBox.style.width = option.width;
    previewBox.style.minWidth = option.fixed ? option.width : '0';
    previewBox.style.maxWidth = '100%';
    if (option.fixed) previewBox.style.maxWidth = 'none';
  }

  function refreshPreview() {
    preview.config = structuredClone(history.current);
  }

  function refreshStatus() {
    clear(statusLine);
    const changes = diff(state.live.document, history.current);
    const parts = [];

    if (session.savedAt) parts.push(`Vistað á þessu tæki ${formatTime(session.savedAt)}`);
    if (!changes.isEmpty) {
      const total = changes.added.length + changes.removed.length + changes.changed.length + changes.moved.length;
      parts.push(`${plural(total, 'óbirt breyting', 'óbirtar breytingar')}`);
    } else {
      parts.push('Engar breytingar frá því sem er í birtingu');
    }

    append(statusLine, [
      el('span', { text: parts.join(' · ') }),
      session.message ? el('strong', { class: `save-message save-message--${session.message.tone}`, text: ` ${session.message.text}` }) : null,
    ]);

    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    saveButton.disabled = session.saving || !validate(history.current).ok;
  }
  session.refreshStatus = refreshStatus;

  function afterChange({ rebuildTree = false, coalesce = false, label = '' } = {}) {
    if (rebuildTree) buildTree();
    refreshPreview();
    renderInspector();
    renderValidation();
    refreshStatus();
    session.autosaver.schedule(history.current);
  }

  // ---- tree -----------------------------------------------------------------

  function buildTree() {
    clear(treeBox);
    const document_ = history.current;

    document_.sections.forEach((section, si) => {
      const heading = section.kind === 'columns' ? 'Málaflokkar'
        : section.kind === 'root' ? 'Rót' : 'Yfirstefnur';
      treeBox.append(el('h3', { class: 'tree-heading', id: `tree-h-${si}`, text: heading }));
      const list = el('ul', { class: 'tree-list', 'aria-labelledby': `tree-h-${si}` });
      treeBox.append(list);

      if (section.kind !== 'columns') {
        section.items.forEach((item, ii) =>
          list.append(treeRow({
            node: item, depth: 1, path: ['sections', si, 'items', ii],
            list: section.items, index: ii,
          })));
        return;
      }

      section.columns.forEach((column, ci) => {
        list.append(treeRow({
          node: column, depth: 1, label: `Dálkur ${ci + 1}`,
          path: ['sections', si, 'columns', ci], list: section.columns, index: ci,
          badge: plural(column.cards.length, 'flokkur', 'flokkar'),
        }));

        column.cards.forEach((card, di) => {
          list.append(treeRow({
            node: card, depth: 2, label: card.title,
            path: ['sections', si, 'columns', ci, 'cards', di], list: column.cards, index: di,
          }));
          card.items.forEach((item, ii) =>
            list.append(treeRow({
              node: item, depth: 3, path: ['sections', si, 'columns', ci, 'cards', di, 'items', ii],
              list: card.items, index: ii,
            })));
          list.append(el('li', { class: 'tree-add-row' }, [el('button', {
            class: 'tree-add', text: '+ skjal',
            on: { click: () => addItem(['sections', si, 'columns', ci, 'cards', di]) },
          })]));
        });

        list.append(el('li', { class: 'tree-add-row' }, [el('button', {
          class: 'tree-add tree-add--card', text: '+ flokkur',
          on: { click: () => addCard(['sections', si, 'columns', ci]) },
        })]));
      });

      list.append(el('li', { class: 'tree-add-row' }, [el('button', {
        class: 'tree-add tree-add--column', text: '+ dálkur',
        on: { click: () => addColumn(['sections', si]) },
      })]));
    });
  }

  function treeRow({ node, depth, label, path, list, index, badge }) {
    const isSelected = session.selected && session.selected.join('.') === path.join('.');
    const linkStatus = node.href !== undefined ? linkBadgeFor(node.id, state.linkReport) : null;

    const row = el('li', {
      class: `tree-row depth-${depth}${isSelected ? ' is-selected' : ''}`,
      id: `tree-${node.id}`,
      dataset: { nodeId: node.id },
    }, [
      el('button', {
        class: 'tree-name', text: label ?? node.label ?? node.title ?? node.id,
        'aria-pressed': String(Boolean(isSelected)),
        on: { click: () => { session.selected = path; buildTree(); renderInspector(); } },
      }),
      badge ? el('span', { class: 'tree-badge', text: badge }) : null,
      linkStatus,
      el('span', { class: 'tree-tools' }, [
        toolButton('↑', 'Færa upp', index === 0, () => move(path, list, index, -1)),
        toolButton('↓', 'Færa niður', index === list.length - 1, () => move(path, list, index, +1)),
        toolButton('⧉', 'Tvöfalda', false, () => duplicate(path, list, index)),
        toolButton('✕', 'Eyða', false, () => remove(path, list, index), 'danger'),
      ]),
    ]);
    return row;
  }

  function toolButton(glyph, title, disabled, onClick, extra = '') {
    return el('button', {
      class: `tree-tool ${extra}`.trim(), text: glyph, title,
      'aria-label': title, disabled, on: { click: onClick },
    });
  }

  // ---- mutations ------------------------------------------------------------

  const at = (document_, path) => path.reduce((node, key) => node?.[key], document_);

  function mutate(label, change, { coalesce = false, rebuildTree = true } = {}) {
    const next = structuredClone(history.current);
    change(next);
    history.push(next, label, { coalesce });
    session.message = null;
    afterChange({ rebuildTree, coalesce, label });
  }

  function move(path, _list, index, delta) {
    const parentPath = path.slice(0, -1);
    const target = index + delta;
    mutate(`move:${path.join('.')}`, (next) => {
      const list = at(next, parentPath);
      if (target < 0 || target >= list.length) return;
      list.splice(target, 0, list.splice(index, 1)[0]);
    });
    session.selected = [...path.slice(0, -1), target];
    buildTree();
    announce(`Fært í sæti ${target + 1}`);
  }

  function duplicate(path, _list, index) {
    const parentPath = path.slice(0, -1);
    mutate(`duplicate:${path.join('.')}`, (next) => {
      const list = at(next, parentPath);
      const copy = withFreshIds(structuredClone(list[index]), next);
      if ('label' in copy) copy.label += ' (afrit)';
      if ('title' in copy) copy.title += ' (afrit)';
      list.splice(index + 1, 0, copy);
    });
    announce('Afrit búið til');
  }

  function remove(path, list, index) {
    const node = at(history.current, path);
    const name = node.label ?? node.title ?? node.id;
    if (list.length <= 1 && path.at(-2) !== 'items') {
      session.message = { tone: 'bad', text: 'Ekki hægt að eyða síðasta atriðinu á þessu stigi.' };
      refreshStatus();
      return;
    }
    const parentPath = path.slice(0, -1);
    mutate(`remove:${path.join('.')}`, (next) => { at(next, parentPath).splice(index, 1); });
    session.selected = null;
    buildTree();
    renderInspector();
    announce(`${name} fjarlægt`);
  }

  function addItem(cardPath) {
    mutate('add:item', (next) => {
      const card = at(next, cardPath);
      card.items.push({ id: freshId('nytt-skjal', next), label: 'Nýtt skjal', href: '', kind: 'pdf' });
    });
    announce('Nýtt skjal bætt við');
  }

  function addCard(columnPath) {
    mutate('add:card', (next) => {
      const column = at(next, columnPath);
      column.cards.push({
        id: freshId('nyr-flokkur', next), title: 'Nýr flokkur', colorToken: 'primary', items: [],
      });
    });
    announce('Nýr flokkur bætt við');
  }

  function addColumn(sectionPath) {
    mutate('add:column', (next) => {
      const section = at(next, sectionPath);
      section.columns.push({
        id: freshId('nyr-dalkur', next),
        cards: [{ id: freshId('nyr-flokkur', next), title: 'Nýr flokkur', colorToken: 'primary', items: [] }],
      });
    });
    announce('Nýr dálkur bætt við');
  }

  // ---- inspector ------------------------------------------------------------

  function renderInspector() {
    clear(inspectorBox);
    if (!session.selected) {
      append(inspectorBox, [el('p', { class: 'muted', text: 'Veldu atriði í trénu til vinstri.' })]);
      return;
    }
    const node = at(history.current, session.selected);
    if (!node) { session.selected = null; return renderInspector(); }

    const isItem = node.href !== undefined || node.label !== undefined;
    const idPath = session.selected.join('.');

    const nameInput = el('input', {
      type: 'text', id: 'f-name', value: isItem ? (node.label ?? '') : (node.title ?? ''),
      on: {
        input: () => mutate(`name:${idPath}`, (next) => {
          const target = at(next, session.selected);
          if (isItem) target.label = nameInput.value; else target.title = nameInput.value;
        }, { coalesce: true, rebuildTree: false }),
      },
    });

    append(inspectorBox, [
      field('f-name', isItem ? 'Texti sem sést' : 'Fyrirsögn flokks', nameInput),
    ]);

    if (isItem) {
      const hrefInput = el('input', {
        type: 'url', id: 'f-href', value: node.href ?? '',
        placeholder: 'https://www.reykjanesbaer.is/…',
        on: {
          input: () => mutate(`href:${idPath}`, (next) => {
            at(next, session.selected).href = hrefInput.value.trim();
          }, { coalesce: true, rebuildTree: false }),
        },
      });
      const hint = el('p', { class: 'hint' });
      const updateHint = () => {
        const value = hrefInput.value.trim();
        if (!value) { hint.className = 'hint warn'; hint.textContent = 'Enginn hlekkur — birtist sem óvirkur texti.'; return; }
        if (/^https:\/\//i.test(value)) { hint.className = 'hint ok'; hint.textContent = 'Gild https-slóð.'; return; }
        if (/^http:\/\//i.test(value)) { hint.className = 'hint warn'; hint.textContent = 'Óörugg slóð (http). Notaðu https:// ef hægt er.'; return; }
        hint.className = 'hint bad';
        hint.textContent = 'Þetta er ekki gild slóð. Hún verður að byrja á https://';
      };
      hrefInput.addEventListener('input', updateHint);
      updateHint();

      const kindSelect = el('select', {
        id: 'f-kind',
        on: { change: () => mutate(`kind:${idPath}`, (next) => { at(next, session.selected).kind = kindSelect.value; }) },
      }, Object.entries(KIND_LABEL).map(([value, label]) =>
        el('option', { value, text: label, selected: (node.kind ?? 'pdf') === value })));

      append(inspectorBox, [
        field('f-href', 'Hlekkur', hrefInput, null),
        hint,
        field('f-kind', 'Tegund', kindSelect),
        // Browsers cannot probe another site from a page; this is not a bug.
        el('p', { class: 'hint' }, [
          'Vafrinn getur ekki athugað hvort slóð virki — vefþjónar annarra leyfa það ekki (CORS). ',
          'Nýir og breyttir hlekkir eru prófaðir sjálfkrafa þegar þú ýtir á „Birta“.',
        ]),
      ]);
    }

    if (node.colorToken !== undefined || !isItem) {
      const colorSelect = el('select', {
        id: 'f-color',
        on: { change: () => mutate(`color:${idPath}`, (next) => { at(next, session.selected).colorToken = colorSelect.value; }) },
      }, Object.entries(COLOR_LABEL).map(([value, label]) =>
        el('option', { value, text: label, selected: (node.colorToken ?? 'primary') === value })));
      append(inspectorBox, [field('f-color', 'Litur', colorSelect)]);
    }

    append(inspectorBox, [
      el('p', { class: 'hint' }, ['Auðkenni: ', el('code', { text: node.id })]),
    ]);
  }

  // ---- validation -----------------------------------------------------------

  function renderValidation() {
    clear(validationBox);
    const result = validate(history.current);
    const errors = result.issues.filter((i) => i.severity === 'error');
    const warnings = result.issues.filter((i) => i.severity === 'warning');

    if (!errors.length && !warnings.length) {
      append(validationBox, [el('p', { class: 'ok-text', text: '✓ Skjalið er gilt og tilbúið til birtingar.' })]);
      return;
    }

    if (errors.length) {
      append(validationBox, [
        el('p', { class: 'bad-text', text: `${plural(errors.length, 'villa stöðvar birtingu', 'villur stöðva birtingu')}.` }),
        el('ul', { class: 'issue-list' }, errors.map((issue) => issueRow(issue, 'bad'))),
      ]);
    }
    if (warnings.length) {
      append(validationBox, [
        el('p', { class: 'warn-text', text: `${plural(warnings.length, 'aðvörun', 'aðvaranir')} — stöðva ekki birtingu.` }),
        el('ul', { class: 'issue-list' }, warnings.map((issue) => issueRow(issue, 'warn'))),
      ]);
    }
  }

  function issueRow(issue, tone) {
    const nodeId = idFromPath(issue.path, history.current);
    return el('li', { class: `issue issue--${tone}` }, [
      el('button', {
        class: 'issue-link',
        text: issue.message,
        title: issue.path,
        on: {
          click: () => {
            if (!nodeId) return;
            session.selected = pathToNode(history.current, nodeId);
            buildTree();
            renderInspector();
            document.getElementById(`tree-${nodeId}`)?.scrollIntoView({ block: 'center' });
            inspectorBox.querySelector('input, select')?.focus();
          },
        },
      }),
    ]);
  }

  // ---- saving ---------------------------------------------------------------

  async function saveDraft() {
    const result = validate(history.current);
    if (!result.ok) {
      session.message = { tone: 'bad', text: 'Lagaðu villurnar fyrst.' };
      refreshStatus();
      return;
    }

    session.saving = true;
    session.message = { tone: 'info', text: 'Vista…' };
    refreshStatus();

    try {
      const saved = await state.storage.saveDraft({
        login: session.login,
        document: history.current,
        sha: session.remoteSha,
        message: 'Uppfæra drög að stefnuriti',
      });
      session.remoteSha = saved.sha;
      // The other views read state.draft; without this, Útgáfa still believes
      // there is nothing to publish immediately after a save.
      update({
        draft: {
          document: structuredClone(history.current),
          sha: saved.sha,
          commit: saved.commit,
          ref: saved.branch,
        },
      });
      session.message = { tone: 'ok', text: `Drög vistuð á GitHub kl. ${formatTime(new Date())}.` };
      clearLocal(session.login, session.baseCommit);
      session.savedAt = null;
      announce('Drög vistuð á GitHub.');
    } catch (error) {
      if (error.kind === 'conflict') {
        await handleConflict();
      } else {
        session.message = { tone: 'bad', text: error.message };
        announce(error.message, 'assertive');
      }
    } finally {
      session.saving = false;
      refreshStatus();
    }
  }

  async function handleConflict() {
    const { showConflictDialog } = await import('../editor/conflict-dialog.js');
    const { merge3 } = await import('../../../src/merge.js');

    const theirs = await state.storage.readDraft({ login: session.login })
      ?? await state.storage.readDocument();
    const base = state.draft?.document ?? state.live.document;
    const result = merge3(base, history.current, theirs.document);

    if (result.ok) {
      history.push(result.merged, 'merge', {});
      session.remoteSha = theirs.sha;
      session.message = {
        tone: 'info',
        text: `Breytingar annarra voru sameinaðar sjálfkrafa (${plural(
          result.applied.fields + result.applied.added + result.applied.removed + result.applied.moved,
          'breyting', 'breytingar')}). Ýttu aftur á „Vista drög“.`,
      };
      afterChange({ rebuildTree: true });
      return;
    }

    const resolved = await showConflictDialog({
      conflicts: result.conflicts, merged: result.merged, theirs: theirs.document,
    });
    if (!resolved) {
      session.message = { tone: 'bad', text: 'Vistun hætt. Breytingarnar þínar eru óskemmdar.' };
      return;
    }
    history.push(resolved, 'merge:resolved', {});
    session.remoteSha = theirs.sha;
    session.message = { tone: 'info', text: 'Árekstrar leystir. Ýttu aftur á „Vista drög“.' };
    afterChange({ rebuildTree: true });
  }

  // ---- keyboard -------------------------------------------------------------

  const onKeyDown = (event) => {
    const meta = event.ctrlKey || event.metaKey;
    if (!meta || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    const changed = event.shiftKey ? history.redo() : history.undo();
    if (changed) {
      afterChange({ rebuildTree: true });
      announce(event.shiftKey ? 'Endurtekið' : 'Afturkallað');
    }
  };
  document.addEventListener('keydown', onKeyDown);
  // The view is rebuilt on every navigation, so the old listener must go.
  root.addEventListener('sr-unmount', () => document.removeEventListener('keydown', onKeyDown), { once: true });

  // ---- first paint ----------------------------------------------------------

  applyPreviewWidth();
  buildTree();
  refreshPreview();
  renderInspector();
  renderValidation();
  refreshStatus();

  if (session.restoredFromDevice) {
    session.message = { tone: 'info', text: 'Óvistuð drög úr þessum vafra voru endurheimt.' };
    session.restoredFromDevice = false;
    refreshStatus();
  }
}

// ---- helpers ----------------------------------------------------------------

function freshId(base, document_) {
  const taken = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string') taken.add(node.id);
      Object.values(node).forEach(walk);
    }
  };
  walk(document_.sections);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function withFreshIds(node, document_) {
  const walk = (current) => {
    if (Array.isArray(current)) return current.forEach(walk);
    if (current && typeof current === 'object') {
      if (typeof current.id === 'string') current.id = freshId(current.id, document_);
      Object.values(current).forEach(walk);
    }
  };
  walk(node);
  return node;
}

/** "sections[2].columns[0].cards[1].items[3].href" -> the id of that node. */
function idFromPath(path, document_) {
  const indices = [...path.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const keys = path.split('.').map((part) => part.replace(/\[\d+\]/, ''));
  let current = document_;
  let lastWithId = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!(key in (current ?? {}))) break;
    current = current[key];
    if (Array.isArray(current)) current = current[indices.shift()];
    if (current && typeof current === 'object' && typeof current.id === 'string') lastWithId = current.id;
  }
  return lastWithId;
}

function pathToNode(document_, id) {
  const found = [];
  const walk = (node, path) => {
    if (found.length) return;
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, [...path, index]));
      return;
    }
    if (node && typeof node === 'object') {
      if (node.id === id) { found.push(...path); return; }
      for (const [key, value] of Object.entries(node)) {
        if (Array.isArray(value)) walk(value, [...path, key]);
      }
    }
  };
  walk(document_.sections, ['sections']);
  return found.length ? found : null;
}

function linkBadgeFor(id, report) {
  const entry = report?.links?.find((link) => link.id === id);
  if (!entry || entry.outcome === 'empty') return null;
  return el('span', {
    class: `link-badge link-badge--${entry.outcome}`,
    text: OUTCOME_IS[entry.outcome] ?? entry.outcome,
    title: `${entry.status ?? ''} ${entry.finalUrl ?? ''}`.trim(),
  });
}

/** Reset between tests, and when signing out. */
export function resetEditorSession() { session = null; }
