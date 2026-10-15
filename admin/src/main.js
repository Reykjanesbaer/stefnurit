/**
 * The panel's entry point: sign in, load, route.
 *
 * There is no framework and no router library. Nine views, one document and a
 * hash fragment is not a problem that needs either.
 */
import { el, append, clear, externalLink, announce } from './ui/dom.js';
import { state, update, subscribe, tokenStore } from './state.js';
import { GitHubStorage } from './storage/github-storage.js';
import { GitHubError, ERROR_KIND, ROLE_LABEL_IS, ROLE_DESCRIPTION_IS } from './storage/github-client.js';
import { renderLogin } from './views/login.js';
import { renderYfirlit } from './views/yfirlit.js';
import { renderRitstjori, resetEditorSession } from './views/ritstjori.js';
import { renderUtgafa, resetPublishState } from './views/utgafa.js';
import { renderSaga } from './views/saga.js';
import { renderHlekkir } from './views/hlekkir.js';
import { renderAdgerdir } from './views/adgerdir.js';
import { renderAdgangur } from './views/adgangur.js';
import { renderStillingar } from './views/stillingar.js';
import { renderHjalp } from './views/hjalp.js';
import { formatDateTime } from './ui/format.js';

const VIEWS = [
  { id: 'yfirlit', label: 'Yfirlit', render: renderYfirlit },
  { id: 'ritstjori', label: 'Ritstjóri', minRole: 'editor', render: renderRitstjori },
  { id: 'utgafa', render: renderUtgafa, label: 'Útgáfa', minRole: 'editor' },
  { id: 'saga', render: renderSaga, label: 'Saga' },
  { id: 'hlekkir', render: renderHlekkir, label: 'Hlekkir' },
  { id: 'adgerdir', render: renderAdgerdir, label: 'Aðgerðir' },
  { id: 'adgangur', render: renderAdgangur, label: 'Aðgangur' },
  { id: 'stillingar', render: renderStillingar, label: 'Stillingar', minRole: 'editor' },
  { id: 'hjalp', render: renderHjalp, label: 'Hjálp' },
];

const ROLE_RANK = { viewer: 0, editor: 1, publisher: 2 };
const mayUse = (view, role) => ROLE_RANK[role ?? 'viewer'] >= ROLE_RANK[view.minRole ?? 'viewer'];

const app = document.getElementById('app');

// ---- boot -------------------------------------------------------------------

const config = await loadConfig();
update({ config });

// Subscribed before the boot sign-in, not after it. The sign-in below awaits
// the network and calls update() as it goes; with the subscription placed
// after it, a remembered token signed in fine and then nothing ever drew the
// panel — the page sat on "Hleð stjórnborðinu…" until somebody gave up and
// typed the token again. renderApp() returns early until there is an identity,
// so listening this soon costs nothing.
subscribe(renderApp);

const stored = tokenStore.get();
if (stored) {
  await signIn(stored, { remember: tokenStore.isRemembered }).catch((error) => {
    // A token GitHub has rejected must not trap anybody on a broken screen;
    // drop it and show the login form with the reason. Anything else — a
    // dropped connection, a 502, an exhausted quota — says nothing about the
    // token, and forgetting it would turn a hiccup into "create a new token".
    const rejected = error instanceof GitHubError && error.kind === ERROR_KIND.UNAUTHORIZED;
    if (rejected) tokenStore.clear();
    showLogin(error.message);
  });
} else {
  showLogin(null);
}

/**
 * site.config.json is copied into the build next to index.html, so it is always
 * reachable relative to the page. Resolving against import.meta.url would point
 * at the hashed asset directory after bundling.
 */
async function loadConfig() {
  for (const candidate of ['./site.config.json', '../site.config.json']) {
    try {
      const response = await fetch(new URL(candidate, document.baseURI), { cache: 'no-cache' });
      if (response.ok) return await response.json();
    } catch { /* try the next location */ }
  }
  throw new Error('Fann ekki site.config.json');
}

function showLogin(error) {
  app.setAttribute('aria-busy', 'false');
  renderLogin(app, {
    config: state.config,
    error,
    onSubmit: async (token, options) => { await signIn(token, options); },
  });
}

async function signIn(token, { remember }) {
  const storage = new GitHubStorage({ token, config: state.config });
  const identity = await storage.whoAmI();     // throws a GitHubError the form shows
  tokenStore.set(token, { remember });
  update({ storage, identity, error: null });
  await loadEverything();
}

async function loadEverything() {
  update({ busy: true });
  const { storage, identity } = state;
  try {
    const [live, draft, linkReport, history, settings] = await Promise.all([
      storage.readDocument(),
      identity.role === 'viewer' ? null : storage.readDraft({ login: identity.login }).catch(() => null),
      storage.linkStatus().catch(() => null),
      storage.history({ limit: 10 }).catch(() => []),
      storage.repositorySettings().catch(() => ({ protectionChecked: false, mainProtected: null })),
    ]);
    if (live) live.head = await storage.headCommit(state.config.defaultBranch).catch(() => null);
    update({ live, draft, linkReport, historyPreview: history, settings, busy: false });
  } catch (error) {
    update({ busy: false, error });
    throw error;
  }
}

// ---- rendering --------------------------------------------------------------

function renderApp() {
  if (!state.identity) return;
  app.setAttribute('aria-busy', String(state.busy));
  clear(app);

  // Views that attach document-level listeners clean up on this event.
  app.querySelector('.content')?.dispatchEvent(new CustomEvent('sr-unmount'));

  const view = VIEWS.find((v) => v.id === state.view) ?? VIEWS[0];
  const main = el('main', { id: 'efni', class: 'content', tabindex: '-1' });

  append(app, [renderHeader(), renderNav(view), main]);

  if (state.error) {
    append(main, [renderError(state.error)]);
    return;
  }
  if (state.busy && !state.live) {
    append(main, [el('p', { class: 'muted', text: 'Sæki gögn frá GitHub…' })]);
    return;
  }

  if (typeof view.render === 'function') {
    view.render(main, { state, onNavigate: navigate });
  } else {
    append(main, [
      el('h1', { text: view.label }),
      el('p', { class: 'muted', text: 'Þessi hluti er ekki tilbúinn enn.' }),
      el('p', {}, ['Á meðan er hægt að breyta skjalinu beint á GitHub: ',
        externalLink(`${state.config.repoUrl}/edit/${state.config.defaultBranch}/${state.config.documentPath}`,
          'opna skjalið í GitHub-ritlinum'), '.']),
    ]);
  }
}

function renderHeader() {
  const { identity, config } = state;
  return el('header', { class: 'app-head' }, [
    el('div', { class: 'app-title' }, [
      el('span', { class: 'app-mark', 'aria-hidden': 'true' }),
      el('span', { text: 'Stjórnborð stefnurits' }),
    ]),
    el('div', { class: 'app-user' }, [
      el('img', {
        src: identity.avatarUrl, alt: '', width: 28, height: 28, class: 'avatar',
      }),
      el('div', { class: 'app-user-text' }, [
        el('span', { class: 'app-user-name', text: identity.name }),
        el('span', { class: 'app-user-role', text: ROLE_LABEL_IS[identity.role], title: ROLE_DESCRIPTION_IS[identity.role] }),
      ]),
      el('button', {
        class: 'ghost', text: 'Skrá út',
        on: {
          click: () => {
            tokenStore.clear();
            resetEditorSession();
            resetPublishState();
            update({ identity: null, storage: null, live: null, draft: null });
            showLogin(null);
            announce('Þú ert skráður út.');
          },
        },
      }),
    ]),
  ]);
}

function renderNav(current) {
  return el('nav', { class: 'app-nav', 'aria-label': 'Hlutar stjórnborðsins' }, [
    el('ul', {}, VIEWS.map((view) => {
      const allowed = mayUse(view, state.identity.role);
      return el('li', {}, [
        el('button', {
          class: `nav-item${view.id === current.id ? ' is-current' : ''}`,
          'aria-current': view.id === current.id ? 'page' : null,
          disabled: !allowed,
          title: allowed ? null : 'Aðgangslykillinn þinn leyfir ekki þennan hluta',
          text: view.label,
          on: { click: () => navigate(view.id) },
        }),
      ]);
    })),
  ]);
}

function renderError(error) {
  const isAuth = error instanceof GitHubError && error.kind === ERROR_KIND.UNAUTHORIZED;
  const isRate = error instanceof GitHubError && error.kind === ERROR_KIND.RATE_LIMITED;

  return el('div', { class: 'banner banner--error', role: 'alert' }, [
    el('div', { class: 'banner-body' }, [
      el('strong', { text: 'Eitthvað fór úrskeiðis' }),
      el('span', { text: error.message }),
      isRate && error.resetAt
        ? el('span', { text: `Þú kemst að aftur ${formatDateTime(error.resetAt)}.` })
        : null,
      el('span', { class: 'hint', text: 'Það sem þú hefur skrifað er óskemmt — það er geymt í þessum vafra.' }),
    ]),
    isAuth
      ? el('button', {
        class: 'ghost', text: 'Skrá inn aftur',
        on: { click: () => { tokenStore.clear(); update({ identity: null }); showLogin(error.message); } },
      })
      : el('button', { class: 'ghost', text: 'Reyna aftur', on: { click: () => { update({ error: null }); loadEverything().catch(() => {}); } } }),
  ]);
}

function navigate(id) {
  const view = VIEWS.find((v) => v.id === id);
  if (!view || !mayUse(view, state.identity?.role)) return;
  update({ view: id });
  document.getElementById('efni')?.focus();
  announce(`${view.label} opnað`);
}

// Exposed for the end-to-end tests to drive the panel deterministically.
if (globalThis.__STEFNURIT_TEST__) {
  globalThis.__stefnurit = { state, update, navigate, signIn };
}
