figma.showUI(__html__, { width: 400, height: 400 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate-css') {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const targetCollections = collections.filter(c => 
        ["Main color", "Semantic", "Support color", "Size", "Theme"].indexOf(c.name) !== -1
      );

      let output = 'Collections funnet:\n';
      targetCollections.forEach(c => {
        output += `- ${c.name}\n`;
      });

      // Sjekk for manglende collections
      const requiredCollections = ["Main color", "Semantic", "Support color", "Size", "Theme"];
      const missingCollections = requiredCollections.filter(name => 
        !collections.some(c => c.name === name)
      );

      if (missingCollections.length > 0) {
        output += '\nAdvarsel: Følgende collections mangler:\n';
        missingCollections.forEach(name => {
          output += `- ${name}\n`;
        });
      }

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
            // Tall (f.eks. size, border-radius, border-width, opacity, font-size)
            const fullName = variable.name.toLowerCase();
            const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
            
            // Ignorer variabler som starter med _size
            if (fullName.startsWith('_size/')) {
              continue;
            }
            
            let codeSyntax = '';
            
            // Bestem riktig prefiks basert på hele navnet
            if (fullName.includes('font-size/')) {
              codeSyntax = `--ds-font-size-${name}`;
            } else if (fullName.includes('border-radius')) {
              codeSyntax = `--ds-border-radius-${name}`;
            } else if (fullName.includes('border-width')) {
              codeSyntax = `--ds-border-width-${name}`;
            } else if (fullName.includes('opacity')) {
              codeSyntax = `--ds-opacity-${name}`;
            } else if (fullName.includes('size/')) {
              codeSyntax = `--ds-size-${name}`;
            } else {
              codeSyntax = `--ds-${collection.name.toLowerCase()}-${name}`;
            }
            
            // Oppdater variabelen med ny code syntax
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          } else if (variable.resolvedType === 'STRING') {
            // String (f.eks. font-family, font-weight)
            const fullName = variable.name.toLowerCase();
            const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
            
            let codeSyntax = '';
            
            // Spesialhåndtering for Theme collection
            if (collection.name === 'Theme') {
              if (fullName.includes('font-weight/')) {
                codeSyntax = `--ds-font-weight-${name}`;
              } else if (fullName === 'font-family') {
                codeSyntax = '--ds-font-family';
              } else {
                // Ignorer andre variabler i Theme collection
                continue;
              }
            }
            
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