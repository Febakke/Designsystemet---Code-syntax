## Designsystemet - Code Syntax (Figma Plugin)

Internal plugin for setting variable **CSS code syntax** and **scopes** in Figma based on our token structure.

## Current Workflow

When the plugin opens, it runs a check automatically.

UI then shows:
- Status tags for `Scopes`, `Syntax`, and `Semantic` mode.
- `Fix Scopes` button only when scope issues exist.
- `Fix CSS Syntax` button only when syntax issues exist.
- Semantic switch button only when syntax is already correct and semantic mode can be detected.

## UI Text Reference

- `Running check...`: plugin is validating current variables.
- `Applying update...`: plugin is writing scope/syntax updates.
- `All checks passed.`: no action needed.
- `Issues found. Use the actions below.`: one or more fixes are available.
- `Scopes: OK` / `Scopes: N issue(s)`: scope validation result.
- `Syntax: OK` / `Syntax: N issue(s)`: syntax validation result.
- `Semantic: with color name` / `without color name` / `mixed`: detected semantic naming variant.

## Actions

### `Fix Scopes`
Sets `variable.scopes` according to the rules below.

### `Fix CSS Syntax`
Sets `variable.setVariableCodeSyntax('WEB', ...)`.
Default behavior is **without color name** in `Semantic`.

### Semantic switch
Available only when syntax is currently valid.
Applies syntax in the opposite semantic variant.
UI labels:
- `Add Color name to semantic`
- `Remove color name from semantic`

## Collections Used

### Syntax check/fix
- `Main color`
- `Semantic`
- `Support color`
- `Size`
- `Theme`

### Scope check/fix
- `Main color`
- `Semantic`
- `Support color`
- `Size`
- `Theme`
- `Color scheme`
- `Typography`

`Color scheme` and `Typography` are scope-only and default to `[]` unless a rule matches.

## Scope Rules

### Color
- `Semantic` -> `ALL_FILLS`, `STROKE_COLOR`
- `Main color` -> `ALL_FILLS`, `STROKE_COLOR`
- `Support color` -> `ALL_FILLS`, `STROKE_COLOR`

### Number (`FLOAT`)
- `Size` + `font-size/*` -> `FONT_SIZE`
- `Semantic` + `opacity` -> `OPACITY`
- `Semantic` + `border-width` -> `STROKE_FLOAT`
- `Semantic` + `border-radius` -> `CORNER_RADIUS`
- `Semantic` + `size/*` -> `GAP`, `WIDTH_HEIGHT`

### String
- `Theme` + `font-weight/*` -> `FONT_STYLE`
- `Theme` + `font-family` -> `FONT_FAMILY`

## Notes

- Built for our naming conventions and collection names.
- If names/structure differ, detection and fixes may be incomplete.
