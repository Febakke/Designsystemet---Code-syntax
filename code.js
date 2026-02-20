"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { themeColors: true, width: 500, height: 400 });
const syntaxCollections = ['Main color', 'Semantic', 'Support color', 'Size', 'Theme'];
const scopeCollections = [...syntaxCollections, 'Color scheme', 'Typography'];
function getFormattedName(variable) {
    var _a;
    const fullName = variable.name.toLowerCase();
    const name = ((_a = variable.name.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace(/\s+/g, '-').toLowerCase()) || '';
    return { fullName, name };
}
function getScopes(collectionName, resolvedType, fullName) {
    if (resolvedType === 'COLOR') {
        if (collectionName === 'Semantic' || collectionName === 'Main color' || collectionName === 'Support color') {
            return ['ALL_FILLS', 'STROKE_COLOR'];
        }
        return [];
    }
    if (resolvedType === 'FLOAT') {
        if (collectionName === 'Size' && fullName.includes('font-size/')) {
            return ['FONT_SIZE'];
        }
        if (collectionName === 'Semantic') {
            if (fullName.includes('opacity'))
                return ['OPACITY'];
            if (fullName.includes('border-width'))
                return ['STROKE_FLOAT'];
            if (fullName.includes('border-radius'))
                return ['CORNER_RADIUS'];
            if (fullName.includes('size/'))
                return ['GAP', 'WIDTH_HEIGHT'];
        }
        return [];
    }
    if (resolvedType === 'STRING' && collectionName === 'Theme') {
        if (fullName.includes('font-weight/'))
            return ['FONT_STYLE'];
        if (fullName === 'font-family')
            return ['FONT_FAMILY'];
    }
    return [];
}
function getExpectedSyntax(collectionName, resolvedType, fullName, name, useSemanticColorName) {
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
        if (collectionName === 'Semantic') {
            const [, colorName, ...rest] = fullName.split('/');
            const semanticParts = useSemanticColorName
                ? [colorName, ...rest].filter(Boolean)
                : rest.filter(Boolean);
            const semanticName = semanticParts.join('-') || name;
            return `var(--ds-color-${semanticName})`;
        }
        return `var(--ds-color-${name})`;
    }
    if (resolvedType === 'FLOAT' && collectionName !== 'Theme') {
        if (fullName.startsWith('_size/'))
            return null;
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
        return `var(--ds-${collectionName.toLowerCase()}-${name})`;
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
function normalizeScopes(scopes) {
    return [...scopes].sort().join('|');
}
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    if (msg.type !== 'generate-syntax' && msg.type !== 'generate-scopes' && msg.type !== 'check-health') {
        return;
    }
    try {
        const action = msg.type;
        const useSemanticColorName = Boolean(msg.useSemanticColorName);
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        const requiredCollections = action === 'generate-syntax' ? syntaxCollections : scopeCollections;
        const targetCollections = collections.filter(c => requiredCollections.some(name => name === c.name));
        let output = '';
        const appendOutputLine = (line) => {
            output += output ? `\n${line}` : line;
        };
        const missingCollections = requiredCollections.filter(name => !collections.some(c => c.name === name));
        if (missingCollections.length > 0) {
            appendOutputLine('Warning: The following collections are missing:');
            missingCollections.forEach(name => appendOutputLine(`- ${name}`));
        }
        if (targetCollections.length === 0) {
            appendOutputLine('No relevant collections found.');
            figma.ui.postMessage({ type: 'action-result', action, output });
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
        const issues = [];
        const issueRows = [];
        const allVariables = yield figma.variables.getLocalVariablesAsync();
        const variablesByCollectionId = new Map();
        for (const variable of allVariables) {
            const existing = variablesByCollectionId.get(variable.variableCollectionId);
            if (existing) {
                existing.push(variable);
            }
            else {
                variablesByCollectionId.set(variable.variableCollectionId, [variable]);
            }
        }
        let semanticModeForCheck = useSemanticColorName ? 'with' : 'without';
        let semanticDetected = 'unknown';
        if (action === 'check-health') {
            let withColorNameHits = 0;
            let withoutColorNameHits = 0;
            for (const collection of targetCollections) {
                if (collection.name !== 'Semantic')
                    continue;
                const variables = (_a = variablesByCollectionId.get(collection.id)) !== null && _a !== void 0 ? _a : [];
                for (const variable of variables) {
                    if (variable.resolvedType !== 'COLOR')
                        continue;
                    const { fullName, name } = getFormattedName(variable);
                    const expectedWithName = getExpectedSyntax('Semantic', variable.resolvedType, fullName, name, true);
                    const expectedWithoutName = getExpectedSyntax('Semantic', variable.resolvedType, fullName, name, false);
                    const actualSyntax = (variable.codeSyntax['WEB'] || '').trim();
                    if (!expectedWithName || !expectedWithoutName || expectedWithName === expectedWithoutName || !actualSyntax) {
                        continue;
                    }
                    if (actualSyntax === expectedWithName)
                        withColorNameHits++;
                    if (actualSyntax === expectedWithoutName)
                        withoutColorNameHits++;
                }
            }
            if (withColorNameHits > 0 || withoutColorNameHits > 0) {
                semanticModeForCheck = withColorNameHits > withoutColorNameHits ? 'with' : 'without';
                semanticDetected = withColorNameHits > 0 && withoutColorNameHits > 0
                    ? 'mixed'
                    : semanticModeForCheck;
            }
            else {
                semanticDetected = 'unknown';
            }
        }
        for (const collection of targetCollections) {
            const variables = (_b = variablesByCollectionId.get(collection.id)) !== null && _b !== void 0 ? _b : [];
            for (const variable of variables) {
                const { fullName, name } = getFormattedName(variable);
                if (action === 'generate-scopes') {
                    const scopes = getScopes(collection.name, variable.resolvedType, fullName);
                    const actualScopes = (_c = variable.scopes) !== null && _c !== void 0 ? _c : [];
                    const hasScopeChange = normalizeScopes(scopes) !== normalizeScopes(actualScopes);
                    if (hasScopeChange) {
                        variable.scopes = scopes;
                        scopeChangedCount++;
                    }
                    else {
                        scopeUnchangedCount++;
                    }
                    if (scopes.length > 0) {
                    }
                    else {
                        noScopeCount++;
                    }
                    continue;
                }
                if (action === 'generate-syntax') {
                    const expectedSyntax = getExpectedSyntax(collection.name, variable.resolvedType, fullName, name, useSemanticColorName);
                    if (expectedSyntax) {
                        variable.setVariableCodeSyntax('WEB', expectedSyntax);
                        updatedCount++;
                    }
                    continue;
                }
                const expectedScopes = getScopes(collection.name, variable.resolvedType, fullName);
                const actualScopes = (_d = variable.scopes) !== null && _d !== void 0 ? _d : [];
                checkedScopes++;
                if (normalizeScopes(expectedScopes) === normalizeScopes(actualScopes)) {
                }
                else {
                    scopeMismatch++;
                    if (issueRows.length < 40) {
                        issueRows.push({
                            type: 'Scope',
                            variable: `${collection.name} / ${variable.name}`,
                            issue: `expected: [${expectedScopes.join(', ')}] | actual: [${actualScopes.join(', ')}]`
                        });
                        issues.push(`[Scope] ${collection.name} / ${variable.name} | expected: [${expectedScopes.join(', ')}] | actual: [${actualScopes.join(', ')}]`);
                    }
                }
                if (syntaxCollections.indexOf(collection.name) === -1) {
                    continue;
                }
                const expectedSyntax = getExpectedSyntax(collection.name, variable.resolvedType, fullName, name, semanticModeForCheck === 'with');
                if (!expectedSyntax) {
                    continue;
                }
                checkedSyntax++;
                const actualSyntax = ((_e = variable.codeSyntax['WEB']) === null || _e === void 0 ? void 0 : _e.trim()) || '';
                if (!actualSyntax) {
                    syntaxMissing++;
                    if (issueRows.length < 40) {
                        issueRows.push({
                            type: 'Syntax',
                            variable: `${collection.name} / ${variable.name}`,
                            issue: `missing WEB syntax | expected: ${expectedSyntax}`
                        });
                        issues.push(`[Syntax] ${collection.name} / ${variable.name} | missing WEB syntax | expected: ${expectedSyntax}`);
                    }
                    continue;
                }
                if (actualSyntax === expectedSyntax) {
                }
                else {
                    syntaxMismatch++;
                    if (issueRows.length < 40) {
                        issueRows.push({
                            type: 'Syntax',
                            variable: `${collection.name} / ${variable.name}`,
                            issue: `expected: ${expectedSyntax} | actual: ${actualSyntax}`
                        });
                        issues.push(`[Syntax] ${collection.name} / ${variable.name} | expected: ${expectedSyntax} | actual: ${actualSyntax}`);
                    }
                }
            }
        }
        if (action === 'generate-scopes') {
            appendOutputLine(`Scopes changed on ${scopeChangedCount} variables.`);
            appendOutputLine(`Scopes already correct on ${scopeUnchangedCount} variables.`);
            appendOutputLine(`${noScopeCount} variables end with no scope.`);
        }
        else if (action === 'generate-syntax') {
            appendOutputLine(`Updated ${updatedCount} variables with the design system CSS syntax.`);
            appendOutputLine(`Semantic was generated ${useSemanticColorName ? 'with color name' : 'without color name'}.`);
        }
        else {
            const syntaxIssueCount = syntaxMissing + syntaxMismatch;
            appendOutputLine('Check complete.');
            appendOutputLine(`Semantic mode: ${semanticDetected}.`);
            appendOutputLine(`Syntax: ${syntaxIssueCount === 0 ? 'OK' : `${syntaxIssueCount} issue(s)`}.`);
            appendOutputLine(`Scopes: ${scopeMismatch === 0 ? 'OK' : `${scopeMismatch} issue(s)`}.`);
        }
        const health = action === 'check-health'
            ? {
                scopeMismatch,
                syntaxMissing,
                syntaxMismatch,
                syntaxChecked: checkedSyntax,
                scopesChecked: checkedScopes,
                semanticDetected,
                primarySemanticMode: semanticModeForCheck,
                issues,
                issueRows
            }
            : undefined;
        figma.ui.postMessage({
            type: 'action-result',
            action,
            output,
            health
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
            type: 'action-result',
            action: 'error',
            output: `Error: ${errorMessage}`
        });
    }
});
