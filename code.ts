// Width is fixed; height is driven by the UI, which measures its own content
// and posts a `resize` message (see ui.html). The initial height is just a
// starting point before the first measurement arrives.
const PLUGIN_WIDTH = 500;
figma.showUI(__html__, { themeColors: true, width: PLUGIN_WIDTH, height: 200 });

type PluginAction = 'generate-syntax' | 'generate-scopes' | 'check-health';
type MigrationState = 'pre' | 'post' | 'half' | 'not-library';

type HealthSummary = {
  scopeMismatch: number;
  syntaxMissing: number;
  syntaxMismatch: number;
  syntaxChecked: number;
  scopesChecked: number;
};

// The color migration (see ../color-migration-helper) reshapes the variables:
// pre-migration uses a `Main color` and a `Support color` collection, with
// variables prefixed `color/main/`. Post-migration these fold into a single
// `Color` collection (Support color is deleted) and the prefix is stripped.
const LEGACY_COLOR_PREFIX = 'color/main/';

function getSyntaxCollections(state: MigrationState): string[] {
  if (state === 'post') {
    return ['Color', 'Semantic', 'Size', 'Theme'];
  }
  // A half-migrated file may contain both the old (`Main color` / `Support
  // color`) and new (`Color`) color collections at once. We process the union;
  // `targetCollections` filters to those that actually exist. Writing syntax /
  // scopes is idempotent and the color output is identical pre/post migration,
  // so handling whichever collections are present is safe.
  if (state === 'half') {
    return ['Color', 'Main color', 'Support color', 'Semantic', 'Size', 'Theme'];
  }
  return ['Main color', 'Semantic', 'Support color', 'Size', 'Theme'];
}

function getScopeCollections(state: MigrationState): string[] {
  return [...getSyntaxCollections(state), 'Color scheme', 'Typography'];
}

// Mirrors the migration plugin's `checkPrimeStatus`: decides whether the file
// is in its pre-migration shape, fully migrated, half-migrated (ambiguous), or
// not a Designsystemet library file at all.
function detectMigrationState(
  collections: VariableCollection[],
  variablesByCollectionId: Map<string, Variable[]>
): MigrationState {
  const hasMainColor = collections.some((c) => c.name === 'Main color');
  const hasSupportColor = collections.some((c) => c.name === 'Support color');
  const hasColor = collections.some((c) => c.name === 'Color');

  // Variables still carrying the legacy prefix, in either the pre-rename
  // (`Main color`) or post-rename (`Color`) collection.
  let prefixedCount = 0;
  for (const collection of collections) {
    if (collection.name !== 'Main color' && collection.name !== 'Color') {
      continue;
    }
    const variables = variablesByCollectionId.get(collection.id) ?? [];
    for (const variable of variables) {
      if (variable.name.startsWith(LEGACY_COLOR_PREFIX)) {
        prefixedCount++;
      }
    }
  }

  if (!hasColor && !hasMainColor && !hasSupportColor) {
    return 'not-library';
  }
  // Clean post-migration: `Color` exists, no legacy collections, no residual prefix.
  if (hasColor && !hasMainColor && !hasSupportColor && prefixedCount === 0) {
    return 'post';
  }
  // Legacy shape: `Main color`/`Support color` present and `Color` not yet created.
  // The `color/main/` prefix is expected here, so it does not count against us.
  if (!hasColor && (hasMainColor || hasSupportColor)) {
    return 'pre';
  }
  // Anything else (both shapes coexist, or `Color` with leftover prefixed vars)
  // is a half-finished migration.
  return 'half';
}

function getFormattedName(variable: Variable) {
  const fullName = variable.name.toLowerCase();
  const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
  return { fullName, name };
}

function getScopes(
  collectionName: string,
  resolvedType: VariableResolvedDataType,
  fullName: string
): VariableScope[] {
  if (resolvedType === 'COLOR') {
    if (
      collectionName === 'Semantic' ||
      collectionName === 'Main color' ||
      collectionName === 'Support color' ||
      collectionName === 'Color'
    ) {
      // ALL_SCOPES: for a COLOR variable this covers exactly the color fields
      // (fills, strokes, effects) — Figma never offers a color in number fields
      // like opacity/gap. Equivalent to ALL_FILLS + STROKE_COLOR + EFFECT_COLOR
      // but tidier and future-proof. Cannot be combined with other scopes.
      return ['ALL_SCOPES'];
    }
    return [];
  }

  if (resolvedType === 'FLOAT') {
    if (collectionName === 'Size' && fullName.includes('font-size/')) {
      return ['FONT_SIZE'];
    }

    if (collectionName === 'Semantic') {
      if (fullName.includes('opacity')) return ['OPACITY'];
      if (fullName.includes('border-width')) return ['STROKE_FLOAT'];
      if (fullName.includes('border-radius')) return ['CORNER_RADIUS'];
      if (fullName.includes('size/')) return ['GAP', 'WIDTH_HEIGHT'];
    }

    return [];
  }

  if (resolvedType === 'STRING' && collectionName === 'Theme') {
    if (fullName.includes('font-weight/')) return ['FONT_STYLE'];
    if (fullName === 'font-family') return ['FONT_FAMILY'];
  }

  return [];
}

function getExpectedSyntax(
  collectionName: string,
  resolvedType: VariableResolvedDataType,
  fullName: string,
  name: string
): string | null {
  if (resolvedType === 'COLOR' && collectionName !== 'Theme') {
    if (fullName === 'link/color/visited') {
      return 'var(--ds-link-color-visited)';
    }
    if (fullName.includes('focus/inner')) {
      return 'var(--ds-color-focus-inner)';
    }
    if (fullName.includes('focus/outer')) {
      return 'var(--ds-color-focus-outer)';
    }
    // Semantic colors are locked to one color regardless of data-color/mode,
    // so their CSS var always includes the color-group name (read from the
    // path). Color / Main color / Support color stay group-less — the
    // data-color attribute selects the actual color at runtime.
    if (collectionName === 'Semantic') {
      const [, colorName, ...rest] = fullName.split('/');
      const semanticName = [colorName, ...rest].filter(Boolean).join('-') || name;
      return `var(--ds-color-${semanticName})`;
    }
    return `var(--ds-color-${name})`;
  }

  if (resolvedType === 'FLOAT' && collectionName !== 'Theme') {
    if (fullName.startsWith('_size/')) return null;

    if (fullName.includes('font-size/')) {
      return `var(--ds-font-size-${name})`;
    }
    if (fullName.includes('border-radius')) {
      return `var(--ds-border-radius-${name})`;
    }
    if (fullName.includes('border-width')) {
      return `var(--ds-border-width-${name})`;
    }
    if (fullName.includes('opacity')) {
      return `var(--ds-opacity-${name})`;
    }
    if (fullName.includes('size/')) {
      return `var(--ds-size-${name})`;
    }
    const collectionSlug = collectionName.toLowerCase().replace(/\s+/g, '-');
    return `var(--ds-${collectionSlug}-${name})`;
  }

  if (collectionName === 'Theme' && resolvedType === 'STRING') {
    if (fullName.includes('font-weight/')) {
      return `var(--ds-font-weight-${name})`;
    }
    if (fullName === 'font-family') {
      return 'var(--ds-font-family)';
    }
  }

  return null;
}

function normalizeScopes(scopes: readonly VariableScope[]): string {
  return [...scopes].sort().join('|');
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'resize') {
    const height = Math.max(1, Math.round(Number(msg.height) || 0));
    figma.ui.resize(PLUGIN_WIDTH, height);
    return;
  }

  if (msg.type !== 'generate-syntax' && msg.type !== 'generate-scopes' && msg.type !== 'check-health') {
    return;
  }

  try {
    const action = msg.type as PluginAction;

    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    const allVariables = await figma.variables.getLocalVariablesAsync();
    const variablesByCollectionId = new Map<string, Variable[]>();
    for (const variable of allVariables) {
      const existing = variablesByCollectionId.get(variable.variableCollectionId);
      if (existing) {
        existing.push(variable);
      } else {
        variablesByCollectionId.set(variable.variableCollectionId, [variable]);
      }
    }

    const migrationState = detectMigrationState(collections, variablesByCollectionId);

    let output = '';
    const appendOutputLine = (line: string) => {
      output += output ? `\n${line}` : line;
    };

    if (migrationState === 'not-library') {
      appendOutputLine('No Designsystemet color collections found in this file.');
      figma.ui.postMessage({ type: 'action-result', action, output, migrationState });
      return;
    }

    // A half-finished migration has an ambiguous structure, but writing syntax
    // and scopes is idempotent and the color output is identical pre/post
    // migration, so we process whatever color collections are present rather
    // than blocking. The UI shows a non-blocking note.
    if (migrationState === 'half') {
      appendOutputLine('Note: this file looks mid-migration (old and new color structures both detected).');
      appendOutputLine('Processing the color collections that are present; finishing the migration is still recommended.');
    }

    const syntaxCollections = getSyntaxCollections(migrationState);
    const requiredCollections = action === 'generate-syntax'
      ? syntaxCollections
      : getScopeCollections(migrationState);
    const targetCollections = collections.filter(c => requiredCollections.some(name => name === c.name));

    // In a half-migrated file the color collection set is inherently partial
    // (only some of Color / Main color / Support color exist), so a missing
    // color collection is expected and should not be warned about.
    const colorCollectionNames = ['Color', 'Main color', 'Support color'];
    const missingCollections = requiredCollections.filter(name =>
      !collections.some(c => c.name === name) &&
      !(migrationState === 'half' && colorCollectionNames.indexOf(name) !== -1)
    );

    if (missingCollections.length > 0) {
      appendOutputLine('Warning: The following collections are missing:');
      missingCollections.forEach(name => appendOutputLine(`- ${name}`));
    }

    if (targetCollections.length === 0) {
      appendOutputLine('No relevant collections found.');
      figma.ui.postMessage({ type: 'action-result', action, output, migrationState });
      return;
    }

    let updatedCount = 0;
    let scopeChangedCount = 0;
    let scopeUnchangedCount = 0;
    let noScopeCount = 0;

    let checkedSyntax = 0;
    let syntaxMissing = 0;
    let syntaxMismatch = 0;
    let checkedScopes = 0;
    let scopeMismatch = 0;

    for (const collection of targetCollections) {
      const variables = variablesByCollectionId.get(collection.id) ?? [];

      for (const variable of variables) {
        const { fullName, name } = getFormattedName(variable);

        if (action === 'generate-scopes') {
          const scopes = getScopes(collection.name, variable.resolvedType, fullName);
          const actualScopes = variable.scopes ?? [];
          const hasScopeChange = normalizeScopes(scopes) !== normalizeScopes(actualScopes);
          if (hasScopeChange) {
            variable.scopes = scopes;
            scopeChangedCount++;
          } else {
            scopeUnchangedCount++;
          }

          if (scopes.length === 0) {
            noScopeCount++;
          }
          continue;
        }

        if (action === 'generate-syntax') {
          const expectedSyntax = getExpectedSyntax(
            collection.name,
            variable.resolvedType,
            fullName,
            name
          );

          if (expectedSyntax) {
            variable.setVariableCodeSyntax('WEB', expectedSyntax);
            updatedCount++;
          }
          continue;
        }

        const expectedScopes = getScopes(collection.name, variable.resolvedType, fullName);
        const actualScopes = variable.scopes ?? [];
        checkedScopes++;

        if (normalizeScopes(expectedScopes) !== normalizeScopes(actualScopes)) {
          scopeMismatch++;
        }

        if (syntaxCollections.indexOf(collection.name) === -1) {
          continue;
        }

        const expectedSyntax = getExpectedSyntax(
          collection.name,
          variable.resolvedType,
          fullName,
          name
        );

        if (!expectedSyntax) {
          continue;
        }

        checkedSyntax++;
        const actualSyntax = variable.codeSyntax['WEB']?.trim() || '';

        if (!actualSyntax) {
          syntaxMissing++;
          continue;
        }

        if (actualSyntax !== expectedSyntax) {
          syntaxMismatch++;
        }
      }
    }

    if (action === 'generate-scopes') {
      appendOutputLine(`Scopes changed on ${scopeChangedCount} variables.`);
      appendOutputLine(`Scopes already correct on ${scopeUnchangedCount} variables.`);
      appendOutputLine(`${noScopeCount} variables end with no scope.`);
    } else if (action === 'generate-syntax') {
      appendOutputLine(`Updated ${updatedCount} variables with the design system CSS syntax.`);
    } else {
      const syntaxIssueCount = syntaxMissing + syntaxMismatch;
      appendOutputLine('Check complete.');
      appendOutputLine(`Syntax: ${syntaxIssueCount === 0 ? 'OK' : `${syntaxIssueCount} issue(s)`}.`);
      appendOutputLine(`Scopes: ${scopeMismatch === 0 ? 'OK' : `${scopeMismatch} issue(s)`}.`);
    }

    const health: HealthSummary | undefined = action === 'check-health'
      ? {
          scopeMismatch,
          syntaxMissing,
          syntaxMismatch,
          syntaxChecked: checkedSyntax,
          scopesChecked: checkedScopes
        }
      : undefined;

    figma.ui.postMessage({
      type: 'action-result',
      action,
      output,
      migrationState,
      health
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({
      type: 'action-result',
      action: 'error',
      output: `Error: ${errorMessage}`
    });
  }
};
