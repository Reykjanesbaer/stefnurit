/**
 * Runtime validation for stefnurit.json.
 *
 * One definition of "valid", imported by the widget, the admin panel and the CI
 * check. Hand-written rather than schema-driven for two reasons: the widget
 * ships with zero runtime dependencies, and nothing here may use `eval` or
 * `new Function`, so the admin panel can run under a strict CSP that forbids
 * both. src/data/stefnurit.schema.json stays the formal contract and the tests
 * assert the two agree.
 *
 * Every finding is produced once, as a structured issue with a stable `code`,
 * and rendered twice: in Icelandic for the people editing the document, and in
 * English for logs, CI output and the existing test suite. Writing the two
 * message sets separately would let them drift apart.
 */

import { versionOf, CURRENT_SCHEMA_VERSION } from './migrate.js';

const COLOR_TOKENS = ['primary', 'accent', 'pill'];
const LINK_KINDS = ['pdf', 'page', 'external', 'none'];
const SECTION_KINDS = ['root', 'branch', 'columns'];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Fields each node type is allowed to carry. Anything else is rejected. */
const ALLOWED = {
  document: ['$schema', 'schemaVersion', 'title', 'lang', 'theme', 'sections'],
  section: ['id', 'kind', 'items', 'columns'],
  column: ['id', 'cards'],
  card: ['id', 'title', 'colorToken', 'items'],
  item: ['id', 'label', 'href', 'kind', 'colorToken', 'note'],
};

/**
 * Length caps. Generous enough that no real policy name hits them, tight enough
 * that a paste accident cannot push a megabyte through the editor into a commit.
 * There is no `subtitle` field in this schema; `note` is the tooltip text.
 */
export const LIMITS = {
  title: 120,
  cardTitle: 80,
  label: 120,
  note: 300,
  href: 2000,
};

export function validate(data) {
  const issues = [];
  const seenIds = new Map();

  const add = (severity, code, path, is, en) => issues.push({ severity, code, path, message: is, en });
  const fail = (code, path, is, en) => add('error', code, path, is, en);
  const warn = (code, path, is, en) => add('warning', code, path, is, en);

  const checkUnknown = (node, kind, path) => {
    for (const key of Object.keys(node)) {
      if (!ALLOWED[kind].includes(key)) {
        fail('unknown-field', `${path}.${key}`,
          `óþekktur reitur „${key}“. Leyfðir reitir hér eru: ${ALLOWED[kind].join(', ')}`,
          `unknown field "${key}" — allowed here: ${ALLOWED[kind].join(', ')}`);
      }
    }
  };

  const checkLength = (value, max, code, path, labelIs, labelEn) => {
    if (typeof value === 'string' && value.length > max) {
      fail(code, path,
        `${labelIs} er ${value.length} stafir en má mest vera ${max}`,
        `${labelEn} is ${value.length} characters, maximum is ${max}`);
    }
  };

  const checkId = (value, path) => {
    if (typeof value !== 'string' || !value) {
      return fail('id-missing', path, 'auðkenni vantar', 'id is required');
    }
    if (!ID_RE.test(value)) {
      fail('id-format', path,
        `auðkennið „${value}“ má aðeins innihalda lágstafi (a–z), tölustafi og bandstrik`,
        `id "${value}" must be lowercase letters, digits and hyphens only`);
    }
    if (seenIds.has(value)) {
      fail('id-duplicate', path,
        `auðkennið „${value}“ er þegar notað í ${seenIds.get(value)} — auðkenni verða að vera einstök`,
        `id "${value}" is already used at ${seenIds.get(value)} — ids must be unique`);
    } else {
      seenIds.set(value, path);
    }
  };

  const checkHref = (href, path) => {
    if (href === undefined) return;
    if (typeof href !== 'string') {
      return fail('href-type', path,
        'hlekkur verður að vera texti (notaðu "" fyrir engan hlekk)',
        'href must be a string (use "" for no link)');
    }
    if (href === '') return; // an item with no link is a deliberate, valid state
    checkLength(href, LIMITS.href, 'href-length', path, 'slóðin', 'href');

    const scheme = schemeOf(href);
    if (scheme === 'https') return;
    if (scheme === 'http') {
      return warn('href-insecure', path,
        'slóðin notar http:// — notaðu https:// ef hægt er',
        'uses http:// — prefer https://');
    }
    if (scheme === null) {
      return fail('href-relative', path,
        `„${href}“ er ekki gild slóð. Hún verður að byrja á https://`,
        `"${href}" is not a valid absolute URL`);
    }
    // javascript:, data:, vbscript:, file: and anything else: a link the browser
    // would execute or read locally has no business in this document.
    fail('href-scheme', path,
      `slóðin notar „${scheme}:“ sem er ekki leyft. Aðeins https:// (eða http://) er leyft`,
      `scheme "${scheme}:" is not allowed — only https:// (or http://)`);
  };

  const checkItem = (item, path) => {
    if (!isObject(item)) return fail('not-object', path, 'verður að vera hlutur', 'must be an object');
    checkUnknown(item, 'item', path);
    checkId(item.id, `${path}.id`);

    if (typeof item.label !== 'string' || !item.label.trim()) {
      fail('label-missing', `${path}.label`,
        'texti er nauðsynlegur og má ekki vera tómur',
        'label is required and cannot be empty');
    }
    checkLength(item.label, LIMITS.label, 'label-length', `${path}.label`, 'textinn', 'label');
    checkLength(item.note, LIMITS.note, 'note-length', `${path}.note`, 'skýringin', 'note');
    checkHref(item.href, `${path}.href`);

    if (item.kind !== undefined && !LINK_KINDS.includes(item.kind)) {
      fail('kind-unknown', `${path}.kind`,
        `„${item.kind}“ er ekki ein af ${LINK_KINDS.join(', ')}`,
        `"${item.kind}" is not one of ${LINK_KINDS.join(', ')}`);
    }
    if (item.colorToken !== undefined && !COLOR_TOKENS.includes(item.colorToken)) {
      fail('color-unknown', `${path}.colorToken`,
        `„${item.colorToken}“ er ekki einn af ${COLOR_TOKENS.join(', ')}`,
        `"${item.colorToken}" is not one of ${COLOR_TOKENS.join(', ')}`);
    }
  };

  if (!isObject(data)) {
    const issue = {
      severity: 'error', code: 'not-object', path: '',
      message: 'skráin verður að innihalda JSON-hlut',
      en: 'the file must contain a JSON object',
    };
    return finish([issue]);
  }

  checkUnknown(data, 'document', '');

  const version = versionOf(data);
  if (version === null) {
    fail('schema-version', 'schemaVersion',
      `ógild útgáfa skema: ${JSON.stringify(data.schemaVersion)}`,
      `invalid schemaVersion: ${JSON.stringify(data.schemaVersion)}`);
  } else if (version > CURRENT_SCHEMA_VERSION) {
    fail('schema-version-future', 'schemaVersion',
      `skjalið er af útgáfu ${version} en þessi útgáfa skilur mest ${CURRENT_SCHEMA_VERSION}`,
      `document is schema version ${version}, this build understands at most ${CURRENT_SCHEMA_VERSION}`);
  }

  if (typeof data.title !== 'string' || !data.title.trim()) {
    fail('title-missing', 'title', 'titill er nauðsynlegur', 'title is required');
  }
  checkLength(data.title, LIMITS.title, 'title-length', 'title', 'titillinn', 'title');

  if (data.theme !== undefined && !isObject(data.theme)) {
    fail('theme-type', 'theme',
      'theme verður að vera hlutur með stílbreytum',
      'theme must be an object of token overrides');
  }

  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    fail('sections-missing', 'sections',
      'að minnsta kosti ein sveit er nauðsynleg',
      'at least one section is required');
    return finish(issues);
  }

  data.sections.forEach((section, si) => {
    const path = `sections[${si}]`;
    if (!isObject(section)) return fail('not-object', path, 'verður að vera hlutur', 'must be an object');
    checkUnknown(section, 'section', path);
    checkId(section.id, `${path}.id`);

    if (!SECTION_KINDS.includes(section.kind)) {
      return fail('section-kind', `${path}.kind`,
        `„${section.kind}“ er ekki ein af ${SECTION_KINDS.join(', ')}`,
        `"${section.kind}" is not one of ${SECTION_KINDS.join(', ')}`);
    }

    if (section.kind === 'columns') {
      if (section.items !== undefined) {
        fail('section-shape', `${path}.items`,
          'sveit af gerðinni „columns“ notar columns, ekki items',
          'a "columns" section uses columns, not items');
      }
      if (!Array.isArray(section.columns) || section.columns.length === 0) {
        return fail('columns-missing', `${path}.columns`,
          'að minnsta kosti einn dálkur er nauðsynlegur',
          'at least one column is required');
      }
      section.columns.forEach((column, ci) => {
        const cpath = `${path}.columns[${ci}]`;
        if (!isObject(column)) return fail('not-object', cpath, 'verður að vera hlutur', 'must be an object');
        checkUnknown(column, 'column', cpath);
        checkId(column.id, `${cpath}.id`);

        if (!Array.isArray(column.cards) || column.cards.length === 0) {
          return fail('cards-missing', `${cpath}.cards`,
            'dálkur þarf að minnsta kosti einn flokk',
            'a column needs at least one card');
        }
        column.cards.forEach((card, di) => {
          const dpath = `${cpath}.cards[${di}]`;
          if (!isObject(card)) return fail('not-object', dpath, 'verður að vera hlutur', 'must be an object');
          checkUnknown(card, 'card', dpath);
          checkId(card.id, `${dpath}.id`);

          if (typeof card.title !== 'string' || !card.title.trim()) {
            fail('card-title-missing', `${dpath}.title`,
              'flokkur þarf fyrirsögn', 'a card needs a title');
          }
          checkLength(card.title, LIMITS.cardTitle, 'card-title-length', `${dpath}.title`,
            'fyrirsögnin', 'title');

          if (card.colorToken !== undefined && !COLOR_TOKENS.includes(card.colorToken)) {
            fail('color-unknown', `${dpath}.colorToken`,
              `„${card.colorToken}“ er ekki einn af ${COLOR_TOKENS.join(', ')}`,
              `"${card.colorToken}" is not one of ${COLOR_TOKENS.join(', ')}`);
          }
          if (!Array.isArray(card.items)) {
            return fail('items-type', `${dpath}.items`,
              'items verður að vera listi (notaðu [] fyrir tóman flokk)',
              'items must be an array (use [] for an empty card)');
          }
          card.items.forEach((item, ii) => checkItem(item, `${dpath}.items[${ii}]`));
        });
      });
      return;
    }

    // root and branch
    if (section.columns !== undefined) {
      fail('section-shape', `${path}.columns`,
        `sveit af gerðinni „${section.kind}“ notar items, ekki columns`,
        `a "${section.kind}" section uses items, not columns`);
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      return fail('items-missing', `${path}.items`,
        'að minnsta kosti eitt atriði er nauðsynlegt',
        'at least one item is required');
    }
    if (section.kind === 'root' && section.items.length > 1) {
      fail('root-single', `${path}.items`,
        `„root“ sveit geymir nákvæmlega eitt atriði, fann ${section.items.length}`,
        `a "root" section holds exactly one item, found ${section.items.length}`);
    }
    section.items.forEach((item, ii) => checkItem(item, `${path}.items[${ii}]`));
  });

  return finish(issues);
}

function finish(issues) {
  const render = (severity) => issues
    .filter((i) => i.severity === severity)
    .map((i) => (i.path ? `${i.path}: ${i.en}` : i.en));
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    errors: render('error'),
    warnings: render('warning'),
    issues,
  };
}

/** Icelandic rendering of the same issues, for the admin panel. */
export function issuesInIcelandic(issues) {
  return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message));
}

/**
 * The URL scheme, or null when the value is not an absolute URL at all.
 * Parsed by hand: `new URL(href, base)` resolves a relative path against the
 * base and would report a bare "skjal.pdf" as https.
 */
function schemeOf(value) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim());
  if (!match) return null;
  return match[1].toLowerCase();
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

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
