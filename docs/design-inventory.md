# Stefnurit 2025 — design inventory

> **Status: provenance, not specification.** This is the record of what was in
> the Canva file — its structure, its exact colours, its text, its links, and
> the seven defects found in it. That is still the source of the content and of
> the palette, and §6.3 is still the list of things worth deciding.
>
> It is no longer the design brief. The layout is the project's own now; where
> the two differ, `src/tokens.js` and `docs/qa/` are authoritative. The
> measurements below describe the Canva page, not the rendered widget.


Reverse-engineered from the Canva design `DAG5D8uf0OE` ("Stefnurit 2025").

**Reference page size: 1850 × 980 px** (Canva "custom" page, 1 page).

> **Read this first.** The only render available to this session is a
> 614 × 325 px thumbnail (`docs/reference/stefnurit-2025-canva-thumb-614w.png`)
> — see `docs/reference/README.md` for why the full-size export is missing.
> All geometry below was measured on that render with Pillow and scaled up by
> **3.013×**. Colours are exact. Line weights, corner radii and font sizes are
> ±1 render pixel, i.e. **±3 px at reference width**. Everything uncertain is
> listed in §7.
>
> Text and links are **not** approximate — they were read from Canva's own
> content API, not from the picture, so they are character-exact.

---

## 1. Structure

### 1.1 Layer tree

```
Frame "Stefnurit 2025"  1850 × 980, fill #FFFFFF
│
├── Section A · Root (1 item)
│   └── Pill  "Stefna Reykjanesbæjar"            fill #2562AE  → PDF
│
├── Connector group 1   (trunk down from root pill)
│
├── Section B · Level 2 (2 items, flanking the trunk)
│   ├── Pill  "Mannréttindastefna"               fill #2562AE  → PDF
│   └── Pill  "Þjónustu- og gæðastefna"          fill #009EBF  → PDF
│
├── Connector group 2   (rail + 5 drop ticks)
│
└── Section C · Málaflokkar — 5 columns
    ├── Col 1  "Stjórnsýsla"      card fill #009EBF   8 items
    │   └── Col 1b "Mannauðsmál"  card fill #009EBF   4 items   (second card, same column)
    ├── Col 2  "Menningarmál"     card fill #1F559F   3 items   + teal backing sliver
    ├── Col 3  "Menntamál"        card fill #1F559F   3 items   + teal backing sliver
    ├── Col 4  "Umhverfismál"     card fill #1F559F   1 item    + teal backing sliver
    └── Col 5  "Velferðarmál"     card fill #1F559F   2 items   + teal backing sliver

    Card
    ├── Heading   (bold, white, no bullet, no link)
    └── Item ×n
        ├── Bullet dot  (white, ~4 px)
        ├── Label       (white, wraps to 2 lines when long)
        └── Icon        (white "open in new" glyph, trailing)
```

### 1.2 ASCII grid sketch

```
 x:  0         268        596        922       1241       1565      1850
     │          │          │          │          │          │
 y   │                         ┌───────────────┐
 33  │                         │ Stefna        │                      ← root pill
 78  │                         │ Reykjanesbæjar│                        #2562AE
     │                         └───────┬───────┘
     │                                 │                              ← trunk, centre x=920
130  │          ┌──────────────┐       │       ┌──────────────┐
     │          │Mannréttinda- ├───────┼───────┤Þjónustu- og  │        ← level-2 branch
151  │          │stefna #2562AE│       │       │gæðastefna    │          (T-junction at trunk)
     │          └──────────────┘       │       │   #009EBF    │
     │                                 │       └──────────────┘
172  ├──────────┬──────────┬───────────┼──────────┬──────────┤         ← RAIL  x 268→1570
     │          │          │           │          │          │           5 drop ticks
196  │          ↓          ↓           ↓          ↓          ↓
     │     ┌────────┐ ┌────────┐  ┌────────┐ ┌────────┐ ┌────────┐
208  │     │Stjórn- │ │Menning-│  │Mennta- │ │Umhverf-│ │Velferð-│
     │     │sýsla   │ │armál   │  │mál     │ │ismál   │ │armál   │
     │     │        │ │        │  │        │ │        │ │        │
     │     │ 8 items│ │ 3 items│  │ 3 items│ │ 1 item │ │ 2 items│
615  │     └────────┘ │        │  │        │ │        │ │        │
     │       (gap)    │        │  │        │ │        │ │        │     ← gap shows through
651  │     ┌────────┐ │        │  │        │ │        │ │        │       the teal sliver only
     │     │Mannauðs│ │        │  │        │ │        │ │        │
     │     │mál     │ │        │  │        │ │        │ │        │
868  │     │ 4 items│ │        │  │        │ │        │ │        │
877  │     └────────┘ └────────┘  └────────┘ └────────┘ └────────┘
     │       TEAL       BLUE        BLUE       BLUE       BLUE
```

**Merged / spanned cells:** none in the usual table sense. The only
"span" is that **column 1 is split into two stacked cards** while columns 2–5
are one card each. In data terms that is *rows per column*, not a colspan.

**Empty cells:** none — every column slot is filled.

**Headers:** the five category names are `rowheader`-like (they label the card
but are not links). The root pill and the two level-2 pills **are** links.

### 1.3 The teal sliver — a layering artifact

Columns 2–5 are blue cards, but a **teal strip ≈18 px wide shows down their
right-hand edge**, and that strip has a white notch in it at y 615–651 —
exactly where column 1's gap between *Stjórnsýsla* and *Mannauðsmál* sits.

Measured evidence:

| | column 1 (teal) | teal sliver beside col 2 | blue card col 2 |
|---|---|---|---|
| top y | 208 | 208 | 199 |
| break | 615 → 651 | 615 → 651 | *(none — continuous)* |
| bottom y | 868 | 868 | 877 |

So the teal shape behind every column is **the same two-card pair as column 1**,
and in columns 2–5 a single taller blue card is laid over it, offset up and to
the left, leaving the teal visible on the right.

This reads as a Canva layering leftover rather than a deliberate accent.
**Decision needed — see §7, Q1.**

---

## 2. Design tokens (colour-picked, not eyeballed)

Sampled with Pillow over the whole render; these four fills are 93.9 % of all
pixels, so they are the design, not antialiasing.

| Token | Hex | RGB | Coverage | Used for |
|---|---|---|---|---|
| `--sr-color-surface` | `#FFFFFF` | 255,255,255 | 35.9 % | page background |
| `--sr-color-primary` | `#1F559F` | 31,85,159 | 43.9 % | card fill, columns 2–5 |
| `--sr-color-accent` | `#009EBF` | 0,158,191 | 13.0 % | card fill column 1; "Þjónustu- og gæðastefna" pill; backing sliver |
| `--sr-color-pill` | `#2562AE` | 37,98,174 | 1.2 % | root pill, "Mannréttindastefna" pill |
| `--sr-color-on-dark` | `#FFFFFF` | 255,255,255 | — | all card/pill text, bullets, icons |
| `--sr-line-color` | `#CACACA` | 202,202,202 | — | connector core (rail, trunk, branch, ticks) |
| `--sr-line-color-soft` | `#E2E2E2` | 226,226,226 | — | connector antialias halo — probably **not** a real second token |

Note there are **two blues**, 5 % apart in luminance: `#1F559F` for cards and
`#2562AE` for pills. They are visibly distinct side by side and must not be
collapsed into one token.

Contrast check — white on each fill:

| Fill | Contrast vs #FFFFFF | WCAG AA (4.5:1) |
|---|---|---|
| `#1F559F` | 7.4:1 | pass |
| `#2562AE` | 6.3:1 | pass |
| `#009EBF` | 3.1:1 | **fail for body text** |

The teal cards carry 12 of the 24 links (all of Stjórnsýsla and Mannauðsmál),
and the "Þjónustu- og gæðastefna" pill is teal too — so 13 of 24 fail AA for
normal-size white text. Flagged in §7, Q4 — it is a real accessibility problem in the original,
and acceptance criterion 6 asks for no serious axe issues.

---

## 3. Lines

Every line in the design is a **connector**, in one flat grey. There are **no
cell borders, no dividers and no card outlines** — cards are separated by white
space only.

| # | Line | Colour | Weight @1850 | Style | From → To | Join |
|---|---|---|---|---|---|---|
| L1 | Trunk, root → branch | `#CACACA` | ≈2–4 px | solid | x 920, y 81 → 172 | butt into rail |
| L2 | Level-2 branch | `#CACACA` | ≈2–4 px | solid | y 130, x 780 → 1064 | **crosses** trunk at x 920 |
| L3 | Rail | `#CACACA` | ≈2–4 px | solid | y 172, x 268 → 1570 | **T** with trunk at x 920 |
| L4–L8 | Drop ticks ×5 | `#CACACA` | ≈2–4 px | solid | y 172 → ~200, at x 271, 596, 920, 1241, 1567 | T off rail, free lower end |

Measured facts worth keeping:

- **The rail starts and ends exactly on the outer columns' centres** (268 and
  1570 vs computed centres 274 and 1565) — it does not run the full width, and
  it does not overhang. Adding or removing a column must move both ends.
- **Every tick sits on its column's centre line** (271/596/920/1241/1567 vs
  centres 274/596/922/1241/1565). Within measurement error, exact.
- **The trunk is on the canvas centre** (920 vs 925).
- L2 crosses L1 rather than T-ing into it — the trunk continues through the
  branch down to the rail.
- All ends are square (butt) caps. No arrowheads, no dashes, no radii on the
  joins — the corners are plain right angles.
- The ticks stop ~8–12 px short of the card tops. Could be a deliberate gap or
  antialiasing fade; see §7.

**Implication for the rebuild:** none of these can be CSS cell borders. They are
a connector tree whose geometry depends on *how many columns there are* and
*where their centres fall*. This is exactly the `src/lines.js` + inline-SVG case
from the brief: compute the rail's extent and every tick's x from the live DOM
positions of the cards, so adding or removing a column re-routes the lines with
no code change.

---

## 4. Typography

The design uses **one sans-serif family throughout**, in two weights. The
rendering is too small to identify it from shapes; the metrics below are
measured, the family is a proposal.

| Role | Size @1850 | Weight | Case | Colour | Measured from |
|---|---|---|---|---|---|
| Root / level-2 pill label | ≈22 px | 700 | sentence | #FFFFFF | pill text band 15 px tall |
| Card heading | ≈22 px | 700 | sentence | #FFFFFF | band y 232–244 (15 px) |
| Item label | ≈18 px | 400 | sentence | #FFFFFF | bands 12 px tall |

- **Item row pitch: 39 px** (measured over 8 consecutive items: 40, 39, 42, 36,
  42, 37, 39, 39). With an 18 px font that is ~2.17 line-height, so the items
  almost certainly have margin between them rather than a huge line-height.
  Proposal: `font-size 18px / line-height 1.35` + `margin-block 9px`.
- A wrapped label ("Stefna Reykjanesbæjar í skjalamálum") takes two lines at the
  **same 39 px pitch**, which confirms the spacing is line-height-driven inside
  an item and margin-driven between items.
- At a 1440 px embed the heading lands at ~17 px and items at ~14 px — both
  above the 12 px floor the brief sets.

**Font proposal:** the letterforms (single-storey `a` is absent, `ó`/`ð`/`þ`
render cleanly, geometric round `o`, fairly tight apertures) are consistent with
Canva's common UI sans. Closest freely-hostable match with full Icelandic
coverage: **Figtree**, then **Inter**, then **Source Sans 3** — all three cover
ð þ æ ö á é í ó ú ý. Recommend self-hosting Figtree woff2 (400 + 700).
**Needs your confirmation — see §7, Q3.**

---

## 5. Spacing grid

All values in reference px (1850 × 980).

| Measurement | Value |
|---|---|
| Canvas | 1850 × 980 |
| Outer margin, left → first card | 105 |
| Outer margin, last card → right | 105 (card ends 1745) |
| Root pill | x 765–1075 (w ≈310), y 33–78 (h ≈46) |
| Level-2 pills | w ≈305, y 109–151 (h ≈42) |
| Level-2 left pill | x 479–780 |
| Level-2 right pill | x 1064–1374 |
| Column pitch (cols 2–5) | ≈322 |
| Column 1 card width | ≈338 |
| Columns 2–5 card width | ≈301 |
| Gap between cards | ≈20 |
| Teal backing sliver, visible width | ≈18 |
| Card top (teal) / (blue) | 208 / 199 |
| Card bottom (teal) / (blue) | 868 / 877 |
| Column 1 inter-card gap | 615 → 651 (36) |
| Card inner padding, left | ≈40 |
| Heading baseline from card top | ≈36 |
| Heading → first item | ≈42 |
| Item row pitch | ≈39 |
| Corner radius, cards | ≈9 |
| Corner radius, pills | ≈8 |
| Shadows | **none** — flat fills throughout |

---

## 6. Content, links and icons

### 6.1 Icons

One icon only: a small white **"open in new window"** glyph (square with an
arrow leaving its top-right corner) trailing every linked label, including the
three pills. It renders at ~4 × 4 px in the available thumbnail — far too small
to vectorise. It is **not** extracted to `src/assets/`; it will be drawn as an
inline SVG at ~14 px. There is **no Reykjanesbær logo** anywhere on the page.

### 6.2 Every link in the design

24 links: the 3 pills plus 21 items in the five columns. "Kind" is `pdf`
unless noted.

| # | Section | Label (exact) | Target |
|---|---|---|---|
| 1 | *root* | Stefna Reykjanesbæjar | `…/pdf_skjol_allir/samthykkt-stefna_uppfaert-utlit_25feb2020.pdf` |
| 2 | *level 2* | Mannréttindastefna | `…/2024/desember/mannrettindastefna-reykjanesbaejar-2024.pdf` |
| 3 | *level 2* | Þjónustu- og gæðastefna | `…/2023/januar/gaeda_og_tjonustustefna_2020_2025.pdf` |
| 4 | Stjórnsýsla | Innkaupastefna | `…/innkaupastefna-reykjanesbaejar.pdf` |
| 5 | Stjórnsýsla | Persónuverndarstefna | `…/personuverndarstefna-reykjanesbaejar_ny.pdf` |
| 6 | Stjórnsýsla | Stefna Reykjanesbæjar í skjalamálum | `…/stefna-reykjanesbaejar-i-skjalamalum.pdf` |
| 7 | Stjórnsýsla | Upplýsingatæknistefna | `…/upplysingataeknistefna-reykjanesbaejar.pdf` |
| 8 | Stjórnsýsla | Upplýsingaöryggisstefna | `…/upplysingaoryggisstefna_samthykkt.pdf` |
| 9 | Stjórnsýsla | Vafrakökustefna | `…/vafrakokustefna_ny.pdf` |
| 10 | Stjórnsýsla | Atvinnustefna | `…/Reykjaneshofn/atvinnustefna_2025-2035.pdf` |
| 11 | Stjórnsýsla | Vefstefna | `…/2024/vefstefna-2024-2027.pdf` ⚠️ **see B5** |
| 12 | Mannauðsmál | EKKO | `…/2022/stefna-og-vidbragdsaaetlun-ekko-2022.pdf` |
| 13 | Mannauðsmál | Jafnlaunastefna | `…/2026/4.2-jafnlaunastefna-8.4.2026.pdf` |
| 14 | Mannauðsmál | Mannauðsstefna | `…/2023/september/mannaudsstefna_reykjanesbaejar.pdf` ⚠️ **see B4** |
| 15 | Mannauðsmál | Fræðslustefna | `…/2025/fraedslustefna.pdf` |
| 16 | Menningarmál | Ferðamálastefna | `…/ferdamalastefna-reykjanesbaejar_nyrri.pdf` |
| 17 | Menningarmál | Markaðstefna | `…/2024/markadsstefna_2023_2028.pdf` ⚠️ **see B1** |
| 18 | Menningarmál | Menningarstefna | `…/Stjornsyslusvid/Menning/menningarstefna_2020_2025.pdf` |
| 19 | Menntamál | Læsistefna | `…/rnb-laesisstefna-2017.pdf` |
| 20 | Menntamál | Menntastefna | `…/is/stjornsysla/stefnumotun/stefnur-og-samthykktir/menntastefna-reykjanesbaejar-2021-2030` — kind `page` |
| 21 | Menntamál | Tómstundastefna | `…/Fraedslusvid/tomstundastefna.pdf` |
| 22 | Umhverfismál | Umhverfis- og loftlagsstefna | `…/2021/Juni/umhverfis_og_loftslagsstefna_reykjanesbaejar_2021.pdf` ⚠️ **see B2** |
| 23 | Velferðarmál | Lýðheilsustefna | `…/2021/Juni/lydheilsustefan_2021.pdf` |
| 24 | Velferðarmál | Stefna í málefnum eldri borgara | `…/stefna-i-malefnum-eldri-borgara.pdf` |

All targets are on `https://www.reykjanesbaer.is`. Every one of the 24 links has
a URL — **there are no empty links to fill in**, so the brief's "list every
empty `href` in the README" step has nothing to list. `check-links` will still
verify all 24 resolve before we publish.

### 6.3 Defects found in the Canva source

Per the ground rules these are **reported, not fixed**. Nothing below has been
changed.

| ID | What | Where | Suggested action |
|---|---|---|---|
| **B1** | Label reads **"Markaðstefna"**. The file it points at is `markadsstefna_2023_2028.pdf`, and Icelandic would be *Markaðsstefna* (two s). Looks like a typo. | Menningarmál | your call |
| **B2** | Label reads **"Umhverfis- og loftlagsstefna"**. The file is `…loftslagsstefna…` and the word is *loftslagsstefna*. Looks like a typo. | Umhverfismál | your call |
| **B3** | **"Persónuverndarstefna "** carries a trailing space inside the link text. | Stjórnsýsla | trim |
| **B4** | **"Mannauðsstefna" is split across two links.** "Mannauðsstefn" points at the right PDF; the final **"a"** points at a *web-archive snapshot of the Menntastefna page* (`vefsafn.is/is/20240621162833mp_/…menntastefna…`). Clicking the last letter opens the wrong document. | Mannauðsmál | merge into one link |
| **B5** | **"Vefstefna" itself is not a link.** The label is plain text; the vefstefna PDF hangs off an adjacent empty link element. In the Canva embed the word is probably not clickable. | Stjórnsýsla | make the label the link |
| **B6** | **Stray invisible links.** Empty link elements sit beside Markaðstefna, EKKO and Lýðheilsustefna, pointing at `vefstefna-2024-2027.pdf` / the umhverfis PDF — leftovers from copy-paste. Invisible but reachable by keyboard in some embeds. | several | drop |
| **B7** | Jafnlaunastefna points at a file dated **8.4.2026** under `/2026/`. Worth confirming it is the intended current version. | Mannauðsmál | verify |

Rebuilding from JSON fixes B3–B6 automatically (one label, one href, one link).
B1, B2 and B7 are wording/content decisions and are **left exactly as they are**
until you say otherwise.

---

## 7. Decisions taken

The inventory originally ended with seven open questions. All were answered with
"pick the best option and stay as close to the design as possible". Here is what
was chosen and why, so the reasoning survives the conversation.

**Q1 · The teal strip (§1.3) — reproduced, per card.**
Each card gets its own accent rectangle, offset 21 px right and inset 9 px top
and bottom. That reproduces the strip in every column and the vertical band
column 1 sits in, from one rule rather than a special case. What it does *not*
reproduce is the white notch at y 616–650 in columns 2–5's strips, which in the
design is the leftover outline of column 1 showing through. Four patches of
roughly 21 × 34 px; recorded in `docs/qa/report.md`.

**Q2 · Column 1's teal — a property of the card, not its position.**
`colorToken` is per card, so a sixth column looks like whichever token it is
given. A card already filled with the accent colour takes the backing's own
vertical band instead of drawing a second one, which is what makes column 1 sit
9 px inside the blue columns.

**Q3 · Font — Figtree, self-hosted.**
The Canva original could not be identified from a ⅓-scale render. Figtree is the
closest freely-hostable match and covers the Icelandic alphabet in its *latin*
subset alone. Both subsets are vendored as woff2 and inlined into the bundle:
~40 kB, in exchange for no external request and no font path to get wrong in a
CMS. A metric-matched fallback holds the layout until it swaps in.

**Q4 · Teal contrast — design colour kept, AA theme one line away.**
`#009EBF` ships as-is, because matching the design was the brief.
`{"theme": {"color-accent": "#007E99"}}` clears AA. The e2e suite asserts both:
that the teal contrast is the *only* serious axe finding as shipped, and that the
override removes it entirely. Flagged in the README as a decision worth making
deliberately, since this is a municipal site.

**Q5 · Line weight and radii — measured values, honestly bounded.**
`line-width: 2`, `radius-card: 9`, `radius-pill: 8` reference px. These cannot be
pinned tighter than ±3 design px against a ⅓-scale reference; `npm run qa` says
so in its own report rather than implying a precision that is not there.

**Q6 · Tick gap — the ticks touch the cards.**
Asserted by an e2e test: every tick's lower end is within 1 px of its column's
top edge, at every width.

**Q7 · Title — headless.**
No visible heading; `title` becomes the `aria-label` of the `<nav>`, leaving the
page's own `<h1>` to do its job.

**And one structural change.** The brief's `sections → rows → items` became
`sections → columns → cards → items`, because that is what the design is: five
columns, the first holding two stacked cards. Adding a column or a card stays a
pure data edit.

## 8. File tree

```
src/
  stefnu-rit.js              web component, single ES module, Shadow DOM
  lines.js                   pure connector geometry (rail extent, tick x, trunk, branch)
  validate.js                schema validation + visible fallback
  tokens.css.js              the token block from §2 and §5
  data/
    stefnurit.json           content — the single source of truth
    stefnurit.schema.json    JSON Schema
  assets/
    icon-external.svg        the §6.1 glyph, redrawn
    fonts/                   Figtree 400/700 woff2 (pending Q3)
demo/
  index.html                 production-shaped embed
  edit.html                  edit mode (not in the bundle)
docs/
  reference/                 design images  ← do not delete
  design-inventory.md        this file
  qa/                        side-by-side + diff output from §6 of the brief
scripts/
  check-links.mjs            npm run check-links
tests/
  lines.test.js              rail/tick geometry for 1, 2, 5, 6 columns
  grid.test.js               column + card layout, two-cards-in-one-column case
  validate.test.js           schema + fallback
  roundtrip.test.js          edit-mode output === input when unchanged
  e2e/render.spec.js         Playwright 1440 / 1024 / 390
  e2e/edit.spec.js           add a row, lines stay consistent
.github/workflows/pages.yml  deploy demo/
vite.config.js               library mode → dist/stefnu-rit.js (ES) + IIFE
README.md
```

---

## 9. The data model this produced

- `sections[]` — the three bands: `root`, `branch`, `columns`.
- Inside the `columns` section, `columns[]` → `cards[]` → `items[]`.
- A column may carry an optional `weight`; column 1 measures 1.045 because the
  designer widened it for its longer labels.

See `src/data/stefnurit.schema.json` for the contract and `src/validate.js` for
the runtime checks, which add the one rule JSON Schema cannot express: ids must
be unique across the whole document.
