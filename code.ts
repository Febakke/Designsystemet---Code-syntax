figma.showUI(__html__, { width: 400, height: 400 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate-css') {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const requiredCollections = ["Main color", "Semantic", "Support color", "Size", "Theme"];
      const targetCollections = collections.filter(c => 
        requiredCollections.some(name => name === c.name)
      );

      let output = 'Collections funnet:\n';
      targetCollections.forEach(c => output += `- ${c.name}\n`);

      // Sjekk for manglende collections
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
      
      // Hent alle variabler én gang
      const allVariables = await figma.variables.getLocalVariablesAsync();

      // Hjelpefunksjon for å hente formatert navn
      function getFormattedName(variable: Variable) {
        const fullName = variable.name.toLowerCase();
        const name = variable.name.split('/').pop()?.replace(/\s+/g, '-').toLowerCase() || '';
        return { fullName, name };
      }

      for (const collection of targetCollections) {
        const variables = allVariables.filter(v => v.variableCollectionId === collection.id);

        for (const variable of variables) {
          const { fullName, name } = getFormattedName(variable);
          
          // Håndterer fargevariabler i alle collections UNNTATT Theme
          if (variable.resolvedType === 'COLOR' && collection.name !== 'Theme') {
            let codeSyntax = '';
            if (fullName === 'link/color/visited') {
              codeSyntax = '--ds-link-color-visited';
            } else if (fullName.includes('focus/inner')) {
              codeSyntax = '--ds-color-focus-inner';
            } else if (fullName.includes('focus/outer')) {
              codeSyntax = '--ds-color-focus-outer';
            } else {
              codeSyntax = `--ds-color-${name}`;
            }
            
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          } 
          // Håndterer tallvariabler (size, border-radius, etc.) i alle collections UNNTATT Theme
          else if (variable.resolvedType === 'FLOAT' && collection.name !== 'Theme') {
            if (fullName.startsWith('_size/')) continue;
            
            let codeSyntax = '';
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
            
            variable.setVariableCodeSyntax('WEB', codeSyntax);
            updatedCount++;
          } 
          // Håndterer KUN STRING-variabler i Theme collection
          else if (collection.name === 'Theme' && variable.resolvedType === 'STRING') {
            let codeSyntax = '';
            if (fullName.includes('font-weight/')) {
              codeSyntax = `--ds-font-weight-${name}`;
            } else if (fullName === 'font-family') {
              codeSyntax = '--ds-font-family';
            }
            
            if (codeSyntax) {
              variable.setVariableCodeSyntax('WEB', codeSyntax);
              updatedCount++;
            }
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
