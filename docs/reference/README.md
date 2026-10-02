# Design reference

## What is here

| File | Source | Size | Notes |
|---|---|---|---|
| `stefnurit-2025-canva-thumb-614w.png` | Canva page thumbnail, design `DAG5D8uf0OE` ("Stefnurit 2025") | 614 × 325 px | **Only ⅓-scale.** The design's real page size is 1850 × 980 px. |

## Missing: the full-resolution export

The prompt asks for `docs/reference/stefnurit-2025.png` exported "as large as
possible". That file is **not** in the repo and could not be produced from this
session:

- `export-design` on the Canva API returns `Not allowed to access design with
  id DAG5D8uf0OE` — the connected Canva account can read the design through the
  share link but is not allowed to export it.
- Canva's own render host (`media.canva.com`) is blocked by this environment's
  egress policy (proxy returns 403 on CONNECT), so the thumbnail could not be
  re-requested at a larger size either.

Every measurement in `docs/design-inventory.md` was therefore taken from the
614 px render and multiplied by 3.013 to reach the 1850 px reference width.
That is accurate for flat fills (colour values are exact) and approximate for
line weights, corner radii and font sizes — each of those is flagged in the
inventory's *Doubts* section.

**To remove the doubts:** open the design in Canva, `Share → Download → PNG`,
tick *Size ×2* (or higher), and commit the result as
`docs/reference/stefnurit-2025.png`. A PDF export works too and is better for
measuring line weights.
