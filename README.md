## Designsystemet - Code syntax (Figma plugin)

En intern plugin for å sette **code syntax** og **variable scopes** på Figma-variabler basert på vår token-struktur.

## Hva pluginen gjør

Pluginen har to handlinger:

1. `Generer CSS-syntax`
- Setter `variable.setVariableCodeSyntax('WEB', ...)` for utvalgte collections.
- Har toggle for `Semantic`:
  - uten fargenavn (default): `var(--ds-color-background-default)`
  - med fargenavn: `var(--ds-color-neutral-background-default)`

2. `Sett scopes`
- Setter `variable.scopes` for relevante variabler.
- Variabler uten match får eksplisitt `[]` (null scope).

## Collections

### Syntax
- `Main color`
- `Semantic`
- `Support color`
- `Size`
- `Theme`

### Scopes
- `Main color`
- `Semantic`
- `Support color`
- `Size`
- `Theme`
- `Color scheme`
- `Typography`

`Color scheme` og `Typography` håndteres kun i scope-kjøring og får default `[]` (null scope).

## Scope-regler

### Color
- `Semantic` -> `ALL_SCOPES`
- `Main color` -> `ALL_SCOPES`
- `Support color` -> `ALL_SCOPES`

### Number (FLOAT)
- `Size` + `font-size/*` -> `FONT_SIZE`
- `Semantic` + `opacity` -> `OPACITY`
- `Semantic` + `border-width` -> `STROKE_FLOAT`
- `Semantic` + `border-radius` -> `CORNER_RADIUS`
- `Semantic` + `size/*` -> `GAP`, `WIDTH_HEIGHT`

### String
- `Theme` + `font-weight/*` -> `FONT_STYLE`
- `Theme` + `font-family` -> `FONT_FAMILY`

## Viktig
- Pluginen er laget for vår navnekonvensjon og token-struktur.
- Avvik i collection-navn eller variabelnavn vil gi færre treff.
