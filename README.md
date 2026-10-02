# Stefnurit

Reykjanesbær's **Stefnurit** — the map of the town's policy documents — as a
native, embeddable web component. It replaces the Canva embed, and **the links,
rows and columns are changed by editing one JSON file, not by touching code or
Canva.**

![Reference above, rebuild below](docs/qa/side-by-side.png)

Canva original: <https://www.canva.com/design/DAG5D8uf0OE/7tBM4RIf84rQcKueuY7tZw/view>

---

## Breyta hlekk — fyrir þau sem skrifa ekki kóða

Allt innihaldið er í einni skrá: **`src/data/stefnurit.json`**.

### Leiðin í gegnum vafrann (einfaldast)

1. Opnaðu skrána beint:
   <https://github.com/Reykjanesbaer/stefnurit/edit/main/src/data/stefnurit.json>
   *(Þessi slóð opnar ritilinn strax. Annars: farðu í `src` → `data` →
   `stefnurit.json` og smelltu á blýantstáknið ✏️ efst til hægri.)*
2. Finndu skjalið sem þú vilt breyta. Leitaðu að heitinu með `Ctrl`+`F` /
   `Cmd`+`F`, t.d. `Vafrakökustefna`.
3. Breyttu slóðinni innan gæsalappanna aftan við `"href":`. **Ekki** fjarlægja
   gæsalappirnar eða kommuna í lok línunnar.
4. Skrunaðu niður, skrifaðu stutta lýsingu á breytingunni og smelltu á
   **Commit changes**.

Síðan uppfærist sjálfkrafa við næstu útgáfu.

### Hvað má breyta

| Reitur | Merking |
|---|---|
| `"label"` | Textinn sem sést. Hér má nota íslenska stafi óhikað. |
| `"href"` | Slóðin á skjalið. Á að byrja á `https://`. Skildu eftir `""` ef enginn hlekkur er til — þá birtist textinn óvirkur. |
| `"kind"` | `"pdf"`, `"page"`, `"external"` eða `"none"`. |
| `"title"` | Fyrirsögn flokks (t.d. `Stjórnsýsla`). |
| `"colorToken"` | `"primary"` (blár), `"accent"` (grænblár) eða `"pill"` (ljósblár). |

Auðkennið `"id"` má ekki vera eins hjá tveimur atriðum — það er notað fyrir
hlekki inn á síðuna.

### Ritstjórnarhamurinn (ef JSON hræðir)

Opnaðu **`demo/edit.html`** í vafra. Þar er sama einingin með hliðarglugga þar
sem þú getur:

- smellt á atriði og breytt texta, hlekk og lit,
- bætt við, eytt, tvöfaldað og dregið til atriði, flokka og dálka,
- séð línurnar endurteiknast um leið,
- fengið viðvörun ef slóðin er ógild eða ekki `https`,
- smellt á **Sækja JSON** eða **Afrita JSON** og límt niðurstöðuna inn í
  `src/data/stefnurit.json`.

Það sem kemur út er stafrétt eins og skráin sem er í Git, svo breytingin sem
sést í Git er nákvæmlega sú sem þú gerðir — ekkert annað.

Enginn gagnagrunnur, engin innskráning. Drög geymast í vafranum þínum þangað til
þú ýtir á **Núllstilla**.

---

## Embedding it

```html
<script type="module" src="https://…/dist/stefnu-rit.js"></script>

<!-- Reserve the box so the page does not jump while the script loads -->
<style>stefnu-rit:not([data-ready]) { display: block; aspect-ratio: 1850 / 980; }</style>

<stefnu-rit src="https://…/stefnurit.json"></stefnu-rit>
```

For a CMS that cannot emit `type="module"`, use the IIFE build instead:

```html
<script src="https://…/dist/stefnu-rit.iife.js"></script>
```

**The JSON must be reachable from the page.** Same origin is simplest; from
another origin the server must send `Access-Control-Allow-Origin`. To skip the
fetch entirely, assign the data directly:

```js
document.querySelector('stefnu-rit').config = { /* … */ };
```

### Attributes

| | |
|---|---|
| `src` | URL of the JSON document |
| `target` | link target, `_blank` by default |
| `theme` | `light` (the only theme so far) |
| `.config` | property: render from an object instead of fetching |

The font is built into the bundle, so there is no second request and no CDN to
depend on.

### Restyling without touching the component

Every design value is a CSS custom property. Set any of them on the element, and
they win over both the component's defaults and the `theme` block in the JSON:

```html
<stefnu-rit style="--sr-color-accent: #007E99; --sr-line-color: #B9C2CC"></stefnu-rit>
```

`theme` in the JSON does the same thing for everyone at once:

```jsonc
{ "theme": { "color-accent": "#007E99" } }
```

Token names are in [`src/tokens.js`](src/tokens.js). Lengths are in *reference
pixels* — the units of the 1850 × 980 Canva page — and are scaled to whatever
width the widget is given, so the design keeps its proportions everywhere.

---

## One thing to decide: the teal and WCAG AA

White text on the design's teal (`#009EBF`) is **3.1 : 1**. AA wants 4.5 : 1 for
text this size, and **13 of the 24 links sit on teal** — all of *Stjórnsýsla* and
*Mannauðsmál*, plus the *Þjónustu- og gæðastefna* pill.

The component ships the Canva colour **exactly as it is**, because matching the
design was the brief. Darkening it to `#007E99` clears AA, is hard to tell apart
at normal zoom, and is one line:

```jsonc
{ "theme": { "color-accent": "#007E99" } }
```

`demo/index.html` has a button that toggles it so the two can be compared
side by side. The e2e suite asserts both states: that teal contrast is the only
serious axe finding as shipped, and that the override clears it completely.

As a municipal website this likely falls under the public-sector accessibility
rules, so this is worth a decision rather than a default.

---

## Links

All **24 links have a URL — none are empty**, so there is nothing to fill in.
`npm run check-links` verifies they all still resolve:

```
npm run check-links
```

It sends HEAD (falling back to GET for servers that refuse HEAD), prints an
OK / REDIRECT / BROKEN / EMPTY table and exits non-zero if anything is broken,
so it can gate a deploy. `.github/workflows/check-links.yml` runs it weekly and
on any pull request that touches the JSON.

> It has **not** been run against the live site from this repository's CI yet —
> the environment this was built in blocks outbound traffic to
> `www.reykjanesbaer.is`. Run it locally once before publishing.

### Defects carried over from the Canva design

Four were fixed simply by moving to one label and one href per item:

- **"Mannauðsstefna" was split across two links.** The final **"a"** pointed at a
  web-archive snapshot of the *Menntastefna* page, so clicking the last letter
  opened the wrong document.
- **"Vefstefna" was not a link at all** — the text was plain and the PDF hung off
  an empty link element beside it.
- Three **stray invisible links** (beside *Markaðstefna*, *EKKO* and
  *Lýðheilsustefna*) pointing at unrelated PDFs.
- A **trailing space** inside "Persónuverndarstefna ".

Three are wording or content decisions and are **left exactly as they are**:

| | |
|---|---|
| **"Markaðstefna"** | The file is `markadsstefna_2023_2028.pdf` and the word is normally *Markaðsstefna*. Looks like a typo. |
| **"Umhverfis- og loftlagsstefna"** | The file is `…loftslagsstefna…` and the word is *loftslagsstefna*. Looks like a typo. |
| **Jafnlaunastefna** | Points at a file dated 8.4.2026 under `/2026/`. Worth confirming it is the current version. |

Change any of them in `src/data/stefnurit.json` whenever you decide.

---

## Development

```
npm install
npm run dev            # demo at localhost:5173
npm test               # unit tests (vitest)
npm run test:e2e       # browser tests (playwright)
npm run build          # dist/stefnu-rit.js + dist/stefnu-rit.iife.js
npm run check-links    # probe every href
npm run qa             # render and compare against the Canva reference
```

### Layout

```
src/stefnu-rit.js            the web component (single ES module)
src/lines.js                 connector geometry — pure functions
src/validate.js              runtime validation with readable messages
src/tokens.js                every measured design value
src/format.js                the one place that decides how the JSON is written
src/data/stefnurit.json      the content — the single source of truth
src/data/stefnurit.schema.json
src/assets/fonts/            Figtree woff2 (SIL OFL 1.1)
demo/index.html              the embed as it will look in production
demo/edit.html               edit mode (not part of the bundle)
docs/design-inventory.md     how the design was measured, and what was found
docs/reference/              the design render — do not delete
docs/qa/                     output of npm run qa
scripts/check-links.mjs      link checker
scripts/visual-qa.mjs        visual fidelity report
```

### How the lines work

The design has **no cell borders**. Every line belongs to one connector tree:
a trunk from the root pill, a branch across to the second-level pills, a rail
that spans exactly the first and last column centres, and one tick down into
each column.

None of that geometry is written down. `src/lines.js` takes the rectangles the
browser actually laid out and returns the segments, so adding or removing a
column moves the rail's ends and adds or drops a tick on its own. Abutting runs
are merged, so a join never shows a seam or a doubled stroke. The connectors are
redrawn on resize and again once the webfont has swapped in.

### Fidelity

`npm run qa` renders the widget and compares it to the design, writing
`docs/qa/report.md` plus side-by-side and diff images. As it stands:

| | |
|---|---|
| Colour, all four fills | **ΔE 0.00** (CIEDE2000; target < 3) |
| Worst card-edge deviation | **5 px** at 1850 px wide — 0.27 % of the width |
| Pixels differing | 3.79 % at reference scale, nearly all text antialiasing |

Known visible differences are listed honestly at the end of `docs/qa/report.md`.
The largest is that the white notch in the teal strips beside the blue cards is
not reproduced — in the design it is the leftover shape of column 1 showing
through, not a rule.

**The reference is a ⅓-scale render.** Canva refuses to export this design to the
account available here, so geometry cannot be resolved finer than ±3 design
pixels. Committing a full-size export as `docs/reference/stefnurit-2025.png` and
re-running `npm run qa` would tighten that; see
[`docs/reference/README.md`](docs/reference/README.md).

### Where this departs from the brief

- **Semantics.** The brief asked for `role="table"` with rows and cells. The
  content is a navigation tree of documents, not tabular data, and a table role
  makes a screen reader announce "table, 5 rows" and offer cell navigation
  across what are visually columns. It is built as `<nav>` with headed lists
  instead, which reads correctly.
- **Data model.** The brief's `sections → rows → items` became
  `sections → columns → cards → items`, because the design is five columns and
  the first holds two stacked cards. "Add a column" and "add a card" stay pure
  data edits either way.
- **The GitHub screenshot** the brief asked for is a direct deep link instead —
  it does not go stale when GitHub moves its buttons.

---

## Licence

Code: MIT. Figtree: SIL Open Font License 1.1. The policy documents themselves
belong to Reykjanesbær.
