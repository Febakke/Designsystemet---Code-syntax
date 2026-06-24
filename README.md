## Designsystemet - Code Syntax (Figma Plugin)

Internal plugin for setting variable **CSS code syntax** and **scopes** in Figma based on our token structure.

## Migration awareness

The plugin auto-detects whether the file is in its **pre-** or **post-** color-migration shape (see the sibling `color-migration-helper` plugin) and adapts which collections it reads:

- **Pre-migration**: `Main color` + `Support color` collections, variables prefixed `color/main/`.
- **Post-migration**: `Main color` is renamed to `Color`, the `color/main/` prefix is stripped, and `Support color` is removed (its colors become modes on `Color`).

Because the WEB syntax uses the last name segment, the generated `var(--ds-color-…)` is identical before and after migration — only the collection set changes.

| Detected state | Topbar tag | Behavior |
| --- | --- | --- |
| `pre` | `Pre-migration` | Uses `Main color` + `Support color`. |
| `post` | `Post-migration` | Uses `Color` (no Support color). |
| `half` | `Mid-migration` + info banner | **Non-blocking.** Both shapes (or a leftover `color/main/` prefix) detected. The plugin processes whichever color collections are present (`Color`, `Main color`, `Support color`) and shows a note recommending the migration be finished. Writing syntax/scopes is idempotent and color output is identical pre/post, so this is safe. |
| `not-library` | info banner | No color collections found. Nothing to check. |

## Current Workflow

When the plugin opens, it runs a check automatically.

UI then shows:
- Status tags for `Scopes` and `Syntax` (each shows a plain-language count of how many variables need fixing).
- `Fix Scopes` button only when scope issues exist.
- `Fix CSS Syntax` button only when syntax issues exist.

There is no per-variable issue table — with large libraries the list is always long and the user just runs the relevant fix. Only the aggregate counts are shown.

### Loading indication

There is no separate status/loading line. Loading is shown as a spinner inside the relevant button:
- The reload (`↻`) button spins while a check runs (on open and on manual re-check).
- A `Fix …` button spins while its fix runs, and keeps spinning through the automatic re-check that follows.
- While one action runs, the other buttons are disabled to prevent overlapping writes.

## UI Text Reference

- `Scopes correct` / `N variables need scope fixes`: scope validation result.
- `Syntax correct` / `N variables need syntax fixes`: syntax validation result.

## Actions

### `Fix Scopes`
Sets `variable.scopes` according to the rules below.
Result text:
- `Scopes changed on X variables.`
- `Scopes already correct on Y variables.`
- `Z variables end with no scope.`

### `Fix CSS Syntax`
Sets `variable.setVariableCodeSyntax('WEB', ...)`.

Semantic naming rule (fixed, not configurable):
- **Semantic** colors always include the color-group name → `var(--ds-color-<group>-<token>)` (e.g. `var(--ds-color-neutral-background-default)`). Semantic colors are locked to one color regardless of `data-color`/mode, and the name communicates that. The group is read from the variable path (`color/<group>/<token>`).
- **Color / Main color / Support color** are always group-less → `var(--ds-color-<token>)`. The actual color is chosen at runtime via the `data-color` attribute.

## Collections Used

The color collection set depends on the detected migration state: **pre** uses `Main color` + `Support color`; **post** uses `Color` instead (Support color removed).

### Syntax check/fix
- `Main color` (pre) / `Color` (post)
- `Support color` (pre only)
- `Semantic`
- `Size`
- `Theme`

### Scope check/fix
- everything from Syntax, plus
- `Color scheme`
- `Typography`

`Color scheme` and `Typography` are scope-only and default to `[]` unless a rule matches.

## Scope Rules

### Color
All color collections get `ALL_SCOPES`. For a COLOR variable this covers exactly the color fields (fills, strokes, effects/shadows) — Figma never offers a color in number fields like opacity or gap — so it is equivalent to `ALL_FILLS` + `STROKE_COLOR` + `EFFECT_COLOR`, just tidier and future-proof. Note: `ALL_SCOPES` cannot be combined with any other scope.
- `Semantic` -> `ALL_SCOPES`
- `Main color` / `Color` -> `ALL_SCOPES`
- `Support color` -> `ALL_SCOPES`

### Number (`FLOAT`)
- `Size` + `font-size/*` -> `FONT_SIZE`
- `Semantic` + `opacity` -> `OPACITY`
- `Semantic` + `border-width` -> `STROKE_FLOAT`
- `Semantic` + `border-radius` -> `CORNER_RADIUS`
- `Semantic` + `size/*` -> `GAP`, `WIDTH_HEIGHT`

### String
- `Theme` + `font-weight/*` -> `FONT_STYLE`
- `Theme` + `font-family` -> `FONT_FAMILY`

## Development

```bash
npm install
npm run build     # tsc: code.ts -> code.js
npm run lint
npm run verify    # build + run scripts/verify.js (logic checks against synthetic fixtures)
```

## Notes

- Built for our naming conventions and collection names.
- If names/structure differ, detection and fixes may be incomplete.
- **Planned (not built yet):** more granular color scoping (e.g. text colors scoped to `TEXT_FILL` only) exposed as a user-toggleable switch.
