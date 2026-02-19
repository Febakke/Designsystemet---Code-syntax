figma.showUI(__html__, { themeColors: true, width: 400, height: 400 });

type PluginAction = 'generate-syntax' | 'generate-scopes';

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
    if (collectionName === 'Semantic' || collectionName === 'Main color' || collectionName === 'Support color') {
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

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'generate-syntax' && msg.type !== 'generate-scopes') {
    return;
  }

  try {
    const action = msg.type as PluginAction;
    const useSemanticColorName = Boolean(msg.useSemanticColorName);
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const syntaxCollections = ['Main color', 'Semantic', 'Support color', 'Size', 'Theme'];
    const scopeCollections = [...syntaxCollections, 'Color scheme', 'Typography'];
    const requiredCollections = action === 'generate-scopes' ? scopeCollections : syntaxCollections;
    const targetCollections = collections.filter(c => requiredCollections.some(name => name === c.name));

   let output = 'All collectons found';
   /*  targetCollections.forEach(c => output += `- ${c.name}\n`);*/

    const missingCollections = requiredCollections.filter(name =>
      !collections.some(c => c.name === name)
    );

    if (missingCollections.length > 0) {
      output += '\nAdvarsel: Følgende collections mangler:\n';
      missingCollections.forEach(name => output += `- ${name}\n`);
    }

    if (targetCollections.length === 0) {
      output += '\nIngen relevante collections funnet.';
      figma.ui.postMessage({ type: 'css-output', css: output });
      return;
    }

    let updatedCount = 0;
    let scopedCount = 0;
    let noScopeCount = 0;

    const allVariables = await figma.variables.getLocalVariablesAsync();

    for (const collection of targetCollections) {
      const variables = allVariables.filter(v => v.variableCollectionId === collection.id);

      for (const variable of variables) {
        const { fullName, name } = getFormattedName(variable);

        if (action === 'generate-scopes') {
          const scopes = getScopes(collection.name, variable.resolvedType, fullName);
          variable.scopes = scopes;
          if (scopes.length > 0) {
            scopedCount++;
          } else {
            noScopeCount++;
          }
          continue;
        }

        if (variable.resolvedType === 'COLOR' && collection.name !== 'Theme') {
          let codeSyntax = '';
          if (fullName === 'link/color/visited') {
            codeSyntax = 'var(--ds-link-color-visited)';
          } else if (fullName.includes('focus/inner')) {
            codeSyntax = 'var(--ds-color-focus-inner)';
          } else if (fullName.includes('focus/outer')) {
            codeSyntax = 'var(--ds-color-focus-outer)';
          } else if (collection.name === 'Semantic') {
            const [, colorName, ...rest] = fullName.split('/');
            const semanticParts = useSemanticColorName
              ? [colorName, ...rest].filter(Boolean)
              : rest.filter(Boolean);
            const semanticName = semanticParts.join('-') || name;
            codeSyntax = `var(--ds-color-${semanticName})`;
          } else {
            codeSyntax = `var(--ds-color-${name})`;
          }

          variable.setVariableCodeSyntax('WEB', codeSyntax);
          updatedCount++;
        } else if (variable.resolvedType === 'FLOAT' && collection.name !== 'Theme') {
          if (fullName.startsWith('_size/')) continue;

          let codeSyntax = '';
          if (fullName.includes('font-size/')) {
            codeSyntax = `var(--ds-font-size-${name})`;
          } else if (fullName.includes('border-radius')) {
            codeSyntax = `var(--ds-border-radius-${name})`;
          } else if (fullName.includes('border-width')) {
            codeSyntax = `var(--ds-border-width-${name})`;
          } else if (fullName.includes('opacity')) {
            codeSyntax = `var(--ds-opacity-${name})`;
          } else if (fullName.includes('size/')) {
            codeSyntax = `var(--ds-size-${name})`;
          } else {
            codeSyntax = `var(--ds-${collection.name.toLowerCase()}-${name})`;
          }

          variable.setVariableCodeSyntax('WEB', codeSyntax);
          updatedCount++;
        } else if (collection.name === 'Theme' && variable.resolvedType === 'STRING') {
          let codeSyntax = '';
          if (fullName.includes('font-weight/')) {
            codeSyntax = `var(--ds-font-weight-${name})`;
          } else if (fullName === 'font-family') {
            codeSyntax = 'var(--ds-font-family)';
          }

          if (codeSyntax) {
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          }
        }
      }
    }

    if (action === 'generate-scopes') {
      output += `\nOppdaterte scopes på ${scopedCount} variabler.`;
      output += `\nIngen scopes på ${noScopeCount} variabler.`;
    } else {
      output += `\nOppdaterte ${updatedCount} variabler med designsystemets CSS syntax.`;
      output += `\nSemantic ble generert ${useSemanticColorName ? 'med fargenavn' : 'uten fargenavn'}.`;
    }

    figma.ui.postMessage({
      type: 'css-output',
      css: output
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ukjent feil';
    figma.ui.postMessage({
      type: 'css-output',
      css: `Feil: ${errorMessage}`
    });
  }
};
