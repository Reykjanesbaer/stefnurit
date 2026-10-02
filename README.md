# Stefnurit

Reykjanesbær's **Stefnurit 2025** — the map of the town's policy documents —
rebuilt as a native, embeddable web component so that the links behind each
document can be swapped, and rows added, removed and reordered, **without
touching code or Canva**.

Canva original: <https://www.canva.com/design/DAG5D8uf0OE/7tBM4RIf84rQcKueuY7tZw/view>

## Status

| Step | State |
|---|---|
| 1 · Design inventory | **done — awaiting review**, see [`docs/design-inventory.md`](docs/design-inventory.md) |
| 2 · Data model (`src/data/stefnurit.json` + schema) | not started |
| 3 · Rendering (`<stefnu-rit>`) | not started |
| 4 · Edit mode + link checker | not started |
| 5 · Build, Pages deploy, tests | not started |
| 6 · Visual fidelity check | not started |

Nothing is built yet beyond the inventory — by design. The brief asks for the
inventory to be confirmed before any UI code is written.

### Open questions blocking step 2

See [§7 of the inventory](docs/design-inventory.md#7-doubts--i-need-answers-before-building).
The short version: the teal edge on the blue cards (artifact or feature?), the
font name, and whether to darken the teal so white text clears WCAG AA.

### Known defects in the Canva source

The inventory's [§6.3](docs/design-inventory.md#63-defects-found-in-the-canva-source)
lists seven, including a link where clicking the last letter of
"Mannauðsstefna" opens the wrong document, and "Vefstefna" not being clickable
at all. **None have been changed** — they are reported for a decision.
