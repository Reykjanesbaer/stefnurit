/**
 * Runtime validation for stefnurit.json.
 *
 * Deliberately hand-written rather than schema-driven: the component ships with
 * zero runtime dependencies, and the people editing the JSON are not
 * developers, so the messages have to name the offending path in plain terms
 * ("sections[2].columns[0].cards[1].items[3].href") instead of emitting a JSON
 * Pointer. src/data/stefnurit.schema.json stays the formal contract and is
 * checked against this file in the tests.
 */

const COLOR_TOKENS = ['primary', 'accent', 'pill'];
const LINK_KINDS = ['pdf', 'page', 'external', 'none'];
const SECTION_KINDS = ['root', 'branch', 'columns'];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * @param {unknown} data
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validate(data) {
  const errors = [];
  const warnings = [];
  const seenIds = new Map();

  const fail = (path, message) => errors.push(`${path}: ${message}`);
  const warn = (path, message) => warnings.push(`${path}: ${message}`);

  const checkId = (value, path) => {
    if (typeof value !== 'string' || !value) return fail(path, 'id is required');
    if (!ID_RE.test(value)) {
      fail(path, `id "${value}" must be lowercase letters, digits and hyphens only`);
    }
    if (seenIds.has(value)) {
      fail(path, `id "${value}" is already used at ${seenIds.get(value)} — ids must be unique`);
    } else {
      seenIds.set(value, path);
    }
  };

  const checkItem = (item, path) => {
    if (!isObject(item)) return fail(path, 'must be an object');
    checkId(item.id, `${path}.id`);
    if (typeof item.label !== 'string' || !item.label.trim()) {
      fail(`${path}.label`, 'label is required and cannot be empty');
    }
    if (item.href !== undefined && typeof item.href !== 'string') {
      fail(`${path}.href`, 'href must be a string (use "" for no link)');
    }
    if (typeof item.href === 'string' && item.href !== '') {
      const url = parseUrl(item.href);
      if (!url) {
        fail(`${path}.href`, `"${item.href}" is not a valid absolute URL`);
      } else if (url.protocol === 'http:') {
        warn(`${path}.href`, 'uses http:// — prefer https://');
      }
    }
    if (item.kind !== undefined && !LINK_KINDS.includes(item.kind)) {
      fail(`${path}.kind`, `"${item.kind}" is not one of ${LINK_KINDS.join(', ')}`);
    }
    if (item.colorToken !== undefined && !COLOR_TOKENS.includes(item.colorToken)) {
      fail(`${path}.colorToken`, `"${item.colorToken}" is not one of ${COLOR_TOKENS.join(', ')}`);
    }
  };

  if (!isObject(data)) {
    return { ok: false, errors: ['the file must contain a JSON object'], warnings };
  }
  if (typeof data.title !== 'string' || !data.title.trim()) {
    fail('title', 'title is required');
  }
  if (data.theme !== undefined && !isObject(data.theme)) {
    fail('theme', 'theme must be an object of token overrides');
  }
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    fail('sections', 'at least one section is required');
    return { ok: errors.length === 0, errors, warnings };
  }

  data.sections.forEach((section, si) => {
    const path = `sections[${si}]`;
    if (!isObject(section)) return fail(path, 'must be an object');
    checkId(section.id, `${path}.id`);

    if (!SECTION_KINDS.includes(section.kind)) {
      return fail(`${path}.kind`, `"${section.kind}" is not one of ${SECTION_KINDS.join(', ')}`);
    }

    if (section.kind === 'columns') {
      if (section.items !== undefined) {
        fail(`${path}.items`, 'a "columns" section uses columns, not items');
      }
      if (!Array.isArray(section.columns) || section.columns.length === 0) {
        return fail(`${path}.columns`, 'at least one column is required');
      }
      section.columns.forEach((column, ci) => {
        const cpath = `${path}.columns[${ci}]`;
        if (!isObject(column)) return fail(cpath, 'must be an object');
        checkId(column.id, `${cpath}.id`);
        if (!Array.isArray(column.cards) || column.cards.length === 0) {
          return fail(`${cpath}.cards`, 'a column needs at least one card');
        }
        column.cards.forEach((card, di) => {
          const dpath = `${cpath}.cards[${di}]`;
          if (!isObject(card)) return fail(dpath, 'must be an object');
          checkId(card.id, `${dpath}.id`);
          if (typeof card.title !== 'string' || !card.title.trim()) {
            fail(`${dpath}.title`, 'a card needs a title');
          }
          if (card.colorToken !== undefined && !COLOR_TOKENS.includes(card.colorToken)) {
            fail(`${dpath}.colorToken`, `"${card.colorToken}" is not one of ${COLOR_TOKENS.join(', ')}`);
          }
          if (!Array.isArray(card.items)) {
            return fail(`${dpath}.items`, 'items must be an array (use [] for an empty card)');
          }
          card.items.forEach((item, ii) => checkItem(item, `${dpath}.items[${ii}]`));
        });
      });
      return;
    }

    // root and branch
    if (section.columns !== undefined) {
      fail(`${path}.columns`, `a "${section.kind}" section uses items, not columns`);
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      return fail(`${path}.items`, 'at least one item is required');
    }
    if (section.kind === 'root' && section.items.length > 1) {
      fail(`${path}.items`, `a "root" section holds exactly one item, found ${section.items.length}`);
    }
    section.items.forEach((item, ii) => checkItem(item, `${path}.items[${ii}]`));
  });

  return { ok: errors.length === 0, errors, warnings };
}

/** Every item in the document, flattened, with the path that located it. */
export function collectItems(data) {
  const out = [];
  if (!isObject(data) || !Array.isArray(data.sections)) return out;
  data.sections.forEach((section, si) => {
    const base = `sections[${si}]`;
    if (section?.kind === 'columns') {
      section.columns?.forEach((column, ci) => {
        column.cards?.forEach((card, di) => {
          card.items?.forEach((item, ii) => {
            out.push({ item, card, column, path: `${base}.columns[${ci}].cards[${di}].items[${ii}]` });
          });
        });
      });
    } else {
      section.items?.forEach((item, ii) => out.push({ item, path: `${base}.items[${ii}]` }));
    }
  });
  return out;
}

function parseUrl(value) {
  try {
    const url = new URL(value, 'https://example.invalid');
    return /^https?:$/.test(url.protocol) && /^https?:\/\//i.test(value) ? url : null;
  } catch {
    return null;
  }
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
