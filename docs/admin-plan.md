# Admin panel — architecture and plan

How a municipality edits a published document with no server, no database and no
subscription: the repository *is* the backend. GitHub stores the content, runs
the validation, keeps the history, hosts the result and does the authorisation.
The admin panel is a static page that talks to `api.github.com` as the person
sitting at it.

## Why this shape

The alternative — a small CMS on a VM — needs a server, a database, backups,
patching, a login system and somebody to own all of it. For one JSON file edited
a handful of times a year, that is a permanent cost against a brief task. GitHub
already provides durable storage, an audit trail nobody can quietly rewrite,
review before publication, free hosting and an identity system the municipality
already pays for.

The cost of this choice is honest and worth stating: **the repository is public**,
so drafts and pull requests are readable by anyone before they are published, and
git history is permanent. See [`privacy.md`](privacy.md).

## The shape of it

```
   Ritstjóri í vafra                    GitHub                         Íbúi
  ┌──────────────────┐        ┌───────────────────────────┐      ┌─────────────┐
  │  /admin/         │        │                           │      │  vefur      │
  │                  │ HTTPS  │  Contents API             │      │  bæjarins   │
  │  token í minni   ├───────►│   stefnurit/draft-<login> │      │             │
  │  storage adapter │        │                           │      │ <stefnu-rit>│
  │  3-way merge     │        │  Pull request             │      │      ▲      │
  └────────┬─────────┘        │   └► stefnurit / validate │      └──────┼──────┘
           │                  │        ├ skema + snið     │             │
           │ les              │        ├ einingapróf      │             │
           ▼                  │        └ hlekkir sem      │             │
  ┌──────────────────┐        │           breyttust       │             │
  │ GitHub Pages     │        │                           │             │
  │  stefnurit.json  │◄───────┤  squash-merge í main      │             │
  │  link-status.json│ deploy │   └► pages.yml            ├─────────────┘
  │  revisions/<sha> │        │        ├ full hlekkjaleit │   afhendir
  └──────────────────┘        │        └ deploy           │
                              └───────────────────────────┘
```

Nothing holds state between those boxes. The panel can be closed at any point
and the draft survives, because the draft is a branch.

## File tree

```
site.config.json              repo coordinates and public URLs — one place to change
src/
  stefnu-rit.js               the widget (zero runtime dependencies)
  lines.js                    connector geometry
  tokens.js                   design values
  validate.js                 one definition of "valid", shared by widget, admin and CI
  migrate.js                  schemaVersion and upgrade steps
  format.js                   the only writer of stefnurit.json
  diff.js                     structural diff keyed by node id
  merge.js                    three-way merge and conflict detection
  contrast.js                 WCAG contrast maths                         (M5)
  data/stefnurit.json         the content
  data/stefnurit.schema.json  the formal contract
admin/
  index.html                  login + the nine views
  src/storage/
    storage-adapter.js        the interface every view talks to            (M2)
    github-client.js          fetch wrapper: auth, ETag, rate limit, errors (M2)
    github-storage.js         the GitHub implementation of the adapter     (M2)
  src/views/*.js              one module per view                         (M2–M5)
embed/
  frame.html                  iframe embed with height messaging          (M5)
  embed-config.json           allowlist of parent origins                 (M5)
scripts/
  validate-document.mjs       CI gate: schema, validity, canonical format
  check-links.mjs             link probing and classification + weekly monitor
  check-changed-links.mjs     PR mode: only the hrefs the PR touches
  sync-broken-link-issue.mjs  keeps one "Bilaðir hlekkir" issue in step
  assemble-pages.mjs          builds _site/, rebuilds revisions from git history
  github-api.mjs              the few REST calls CI makes
  format-document.mjs         rewrites the document canonically
tests/
  *.test.js                   unit (vitest)
  integration/mock-github-server.mjs   deterministic GitHub stand-in      (M2)
  e2e/*.spec.js               browser (playwright)
```

## Dependencies

The widget has **zero runtime dependencies** and that does not change. The admin
panel adds none either: it is vanilla ES modules, built by Vite in multi-page
mode, and reuses `src/validate.js`, `src/diff.js` and `src/merge.js` directly.

Every dependency below is a devDependency and never reaches a browser.

| Package | Why it is here | What replaces it if dropped |
|---|---|---|
| `vite` | Already the widget's bundler; multi-page mode builds `/admin/` with no second toolchain. | Hand-written build script |
| `vitest` | Already the unit runner. | Node's built-in test runner |
| `@playwright/test` | Already the browser runner; the admin panel needs real DOM, real `fetch`, real `sessionStorage`. | Nothing equivalent |
| `@axe-core/playwright` | Automated WCAG checks on all nine views. Already present. | Manual auditing only |
| `ajv` | Checks `validate.js` and the JSON Schema agree, in tests only. | Hand-written schema walker |
| `pngjs`, `pixelmatch` | Pixel comparison for the ≥1400px regression check. | Eyeballing |

No CDN is loaded at runtime, by the widget or the panel. The font is inlined in
the bundle.

## The storage adapter

Every GitHub call sits behind one module. If the municipality later moves to
Entra ID and a database, only `github-storage.js` is replaced — the nine views
and the merge logic do not know where the document comes from.

```js
/** @typedef {{ sha: string, commit: string, document: object, etag: string|null }} LoadedDocument */

export class StorageAdapter {
  /** Who is signed in, and what they may do: 'viewer' | 'editor' | 'publisher'. */
  async whoAmI()                                      // -> { login, name, avatarUrl, role }

  /** The published document, plus the commit it came from. */
  async readDocument({ ref })                         // -> LoadedDocument

  /** This person's draft, or null when they have none. */
  async readDraft({ login })                          // -> LoadedDocument | null

  /** Write the draft branch. Carries the file sha for optimistic concurrency. */
  async saveDraft({ login, document, sha, message })  // -> { sha, commit }

  /** Open or update the pull request and return its number and check state. */
  async publish({ login, note })                      // -> { number, url, checkState }

  /** Poll the required check for live per-link feedback. */
  async checkStatus({ number })                       // -> { state, conclusion, links[] }

  /** Squash-merge once the check is green. */
  async merge({ number, note })                       // -> { sha, mergedAt }

  /** Commits that touched the document. */
  async history({ limit, cursor })                    // -> { entries[], cursor }

  /** One past version, by commit sha. */
  async revision({ sha })                             // -> object

  /** The weekly link report from Pages. */
  async linkStatus()                                  // -> report

  /** Who has write access (when the token may see it). */
  async collaborators()                               // -> { entries[], permitted: boolean }

  /** Kick the Actions workflow behind "Athuga núna". */
  async requestLinkCheck()                            // -> { dispatched: boolean, reason? }
}
```

Nothing above returns a raw HTTP response; `github-client.js` turns status codes
into typed outcomes (`unauthorized`, `rateLimited`, `conflict`, `notFound`) so no
view ever branches on a number.

## GitHub APIs used

| Need | Endpoint | Token permission |
|---|---|---|
| Who is signed in | `GET /user` | Metadata: read |
| Role and repo facts | `GET /repos/{o}/{r}` | Metadata: read |
| Read the document | `GET /repos/{o}/{r}/contents/{path}?ref=` | Contents: read |
| Save a draft | `PUT /repos/{o}/{r}/contents/{path}` | Contents: write |
| Branch bookkeeping | `GET/POST /repos/{o}/{r}/git/refs` | Contents: write |
| Open / update a PR | `POST`, `PATCH /repos/{o}/{r}/pulls` | Pull requests: write |
| Watch the check | `GET /repos/{o}/{r}/commits/{sha}/check-runs` | Checks: read (implied) |
| Publish | `PUT /repos/{o}/{r}/pulls/{n}/merge` | Pull requests: write |
| History | `GET /repos/{o}/{r}/commits?path=` | Contents: read |
| Audit log | `GET /repos/{o}/{r}/pulls?state=closed` | Pull requests: read |
| Access list | `GET /repos/{o}/{r}/collaborators` | Administration: read (optional) |
| "Athuga núna" | `POST /repos/{o}/{r}/actions/workflows/{id}/dispatches` | Actions: write (optional) |

Reads send `If-None-Match`; a `304` costs no rate-limit quota.

## Workflows

| Workflow | Trigger | Job | Does | Permissions |
|---|---|---|---|---|
| `stefnurit` (`validate.yml`) | `pull_request` → `main` | `validate` | unit tests, schema, canonical format, probes only changed hrefs, one PR comment | `contents: read`, `pull-requests: write` |
| `pages` (`pages.yml`) | push to `main`, Mondays 06:00 UTC, manual | `build` | tests, build, full link monitor, issue sync, assemble `_site` | `contents: read`, `issues: write` |
| | | `deploy` | publish to Pages | `pages: write`, `id-token: write` |

The required check is **`stefnurit / validate`** — workflow name, then job name.

One wrinkle, found by running it rather than by reading the docs: that is the
form GitHub *displays*. The check-run name the API returns, and the context a
branch ruleset actually matches on, is just **`validate`**. Verified on the live
run for pull request #3. `docs/setup-github.md` gives both, and the first-run
checklist has the person setting the rule confirm which one the UI offers.

The monitor never fails the deploy. A municipal web server being slow on a
Monday is not a reason to stop publishing.

## Threat model

Ten things that could go wrong, and what stands in the way of each.

| # | Threat | Mitigation | Where |
|---|---|---|---|
| 1 | A stored token is stolen from a shared machine | In memory by default; `sessionStorage` only on opt-in, cleared with the tab; never `localStorage`, never in a URL, never logged | M2 `admin/src/storage/` |
| 2 | A malicious label injects script into the widget | No `innerHTML` with document or API data anywhere; `textContent` and DOM creation only | M2–M5, asserted by a security E2E test |
| 3 | A `javascript:` or `data:` URL is pasted as a link | The validator rejects any scheme but `https`/`http` as a blocking error, in the panel *and* in CI | M1 `validate.js`, `href-scheme` |
| 4 | The admin panel is framed by a hostile page to harvest a token | Synchronous frame-bust before render, plus a CSP meta tag | M2 `admin/index.html` |
| 5 | A compromised third-party Action exfiltrates the repo token | Every action pinned to a 40-character commit SHA; Dependabot moves the pins; minimal per-job `permissions` | M1 workflows |
| 6 | A fork PR runs with a writable token | `pull_request`, never `pull_request_target`; no secrets in the validate job | M1 `validate.yml` |
| 7 | Two editors silently overwrite each other | File `sha` sent on every write; `409`/`422` triggers a three-way merge and a conflict dialog, never a blind retry | M1 `merge.js`, M3 editor |
| 8 | A bad document is published and the site breaks | Required check blocks the merge; the widget falls back to its cached last-valid document and never shows a raw error | M1 CI, M5 widget |
| 9 | A link silently rots, or a PDF is swapped at the same URL | Weekly probe records `Last-Modified`; a change is flagged; one issue tracks it | M1 `check-links.mjs` |
| 10 | Somebody loses the ability to undo a published change | Every version is reachable: git history, `data/revisions/<sha>.json` on Pages, and "Endurheimta" in the panel | M1 `assemble-pages.mjs`, M4 Saga |

What this design explicitly does **not** defend against: a person with write
access to the repository publishing something wrong on purpose. GitHub's own
permissions and the permanent audit trail are the control there.

## Milestones

| | Branch | Contents |
|---|---|---|
| M1 | `feat/m1-data-and-workflows` | `site.config.json`, this document, schema version + migration, extended validator, diff, merge, link monitor, both workflows, repo hygiene, unit tests |
| M2 | `feat/m2-storage-and-login` | Storage adapter, GitHub client, mock server, Vite multi-page build, login, role detection, **Yfirlit** |
| M3 | `feat/m3-editor-and-merge` | **Ritstjóri**: tree, inspector, autosave, draft branch, undo/redo, conflict dialog, validation panel |
| M4 | `feat/m4-publish-history-links` | **Útgáfa**, **Saga**, **Hlekkir**, **Aðgerðir**, **Aðgangur** |
| M5 | `feat/m5-settings-widget-frontend` | **Stillingar**, **Hjálp**, widget fallbacks and caching, iframe embed, breakpoint work |
| M6 | `docs/m6-docs-and-hardening` | Setup, runbook, embedding, privacy, first-run checklist, security and accessibility sweeps |

## Conventions

- Everything a member of staff or the public reads is **Icelandic**, with real
  characters (ð þ æ ö á é í ó ú ý) and a **24-hour clock** (`kl. 14:30`). No
  AM/PM anywhere, including logs and commit messages.
- Code, comments and commit messages are **English**.
- The validator produces each finding once and renders it twice — Icelandic for
  the panel, English for CI and tests — so the two cannot drift apart.
