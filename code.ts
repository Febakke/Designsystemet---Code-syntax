figma.showUI(__html__, { width: 400, height: 400 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate-css') {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const targetCollections = collections.filter(c => 
        ["Main color", "Semantic", "Support color"].indexOf(c.name) !== -1
      );

      let output = 'Collections funnet:\n';
      targetCollections.forEach(c => {
        output += `- ${c.name}\n`;
      });

      if (targetCollections.length === 0) {
        output += '\nIngen collections funnet med navn "Main color", "Semantic" eller "Support color".';
        figma.ui.postMessage({
          type: 'css-output',
          css: output
        });
        return;
      }

      let updatedCount = 0;

      for (const collection of targetCollections) {
        const allVariables = await figma.variables.getLocalVariablesAsync();
        const variables = allVariables.filter(v => 
          v.variableCollectionId === collection.id
        );

        for (const variable of variables) {
          const value = variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
          
          if (variable.resolvedType === 'COLOR') {
            // Farge
            const fullName = variable.name.toLowerCase();
            const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
            
            // Spesialhåndtering for fokus og link farger
            let codeSyntax = '';
            if (fullName === 'link/color/visited') {
              codeSyntax = '--ds-link-color-visited';
            } else if (fullName.includes('focus/inner')) {
              codeSyntax = '--ds-color-focus-inner';
            } else if (fullName.includes('focus/outer')) {
              codeSyntax = '--ds-color-focus-outer';
            } else {
              // Standard fargehåndtering
              codeSyntax = `--ds-color-${name}`;
            }
            
            // Oppdater variabelen med ny code syntax
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          } else if (variable.resolvedType === 'FLOAT') {
            // Tall (f.eks. size, border-radius, border-width, opacity)
            const fullName = variable.name.toLowerCase();
            const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
            
            // Bestem riktig prefiks basert på hele navnet
            let prefix = '--ds-';
            if (fullName.includes('size')) {
              prefix += 'size-';
            } else if (fullName.includes('border-radius')) {
              prefix += 'border-radius-';
            } else if (fullName.includes('border-width')) {
              prefix += 'border-width-';
            } else if (fullName.includes('opacity')) {
              prefix += 'opacity-';
            } else {
              prefix += collection.name.toLowerCase() + '-';
            }
            
            const codeSyntax = `${prefix}${name}`;
            
            // Oppdater variabelen med ny code syntax
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          }
        }
      }

      output += `\nOppdaterte ${updatedCount} variabler med ny code syntax.`;

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
  }
}; 