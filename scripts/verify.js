/*
 * Verification harness for the Code Syntax plugin.
 *
 * Loads the COMPILED code.js inside a stubbed `figma` global, then drives the
 * real onmessage handler with synthetic variable fixtures to assert:
 *   - migration state detection (pre / post / half)
 *   - semantic colors get the color-group name, others don't
 *   - color scopes are ALL_SCOPES (covers fills + strokes + effects for colors)
 *   - float / string scope + syntax rules
 *
 * Run: node scripts/verify.js   (build first: npm run build)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

// --- Fixture builders -------------------------------------------------------

let nextId = 0;
function mkVar(collectionId, name, resolvedType, scopes, web) {
  const codeSyntax = {};
  if (web !== undefined) codeSyntax.WEB = web;
  return {
    id: `Var:${nextId++}`,
    name,
    resolvedType,
    variableCollectionId: collectionId,
    scopes: scopes || [],
    codeSyntax,
    setVariableCodeSyntax(platform, value) {
      this.codeSyntax[platform] = value;
    },
  };
}

// A small but representative slice of the real library, in PRE-migration shape.
function preFixture() {
  const collections = [
    { id: 'c-main', name: 'Main color' },
    { id: 'c-support', name: 'Support color' },
    { id: 'c-semantic', name: 'Semantic' },
    { id: 'c-size', name: 'Size' },
    { id: 'c-theme', name: 'Theme' },
    { id: 'c-scheme', name: 'Color scheme' },
    { id: 'c-typo', name: 'Typography' },
  ];
  const variables = [
    mkVar('c-main', 'color/main/base-default', 'COLOR', ['ALL_FILLS', 'STROKE_COLOR'], 'var(--ds-color-base-default)'),
    mkVar('c-support', 'color/support/base-default', 'COLOR', ['ALL_FILLS', 'STROKE_COLOR'], 'var(--ds-color-base-default)'),
    // Semantic colors stored WITHOUT the group name (the old convention).
    mkVar('c-semantic', 'color/accent/base-default', 'COLOR', ['ALL_FILLS', 'STROKE_COLOR'], 'var(--ds-color-base-default)'),
    mkVar('c-semantic', 'color/neutral/text-default', 'COLOR', ['ALL_FILLS', 'STROKE_COLOR'], 'var(--ds-color-text-default)'),
    mkVar('c-semantic', 'border-radius/md', 'FLOAT', ['CORNER_RADIUS'], 'var(--ds-border-radius-md)'),
    mkVar('c-semantic', 'link/color/visited', 'COLOR', ['ALL_FILLS', 'STROKE_COLOR'], 'var(--ds-link-color-visited)'),
    mkVar('c-size', 'font-size/md', 'FLOAT', ['FONT_SIZE'], 'var(--ds-font-size-md)'),
    mkVar('c-theme', 'font-weight/regular', 'STRING', ['FONT_STYLE'], 'var(--ds-font-weight-regular)'),
    mkVar('c-theme', 'font-family', 'STRING', ['FONT_FAMILY'], 'var(--ds-font-family)'),
    mkVar('c-scheme', 'global/blue/100', 'COLOR', [], undefined),
  ];
  return { collections, variables };
}

// POST-migration: Main color -> Color, strip `color/main/`, drop Support color.
function postFixture() {
  const { collections, variables } = preFixture();
  const cols = collections
    .filter((c) => c.name !== 'Support color')
    .map((c) => (c.name === 'Main color' ? { ...c, name: 'Color' } : c));
  const vars = variables
    .filter((v) => v.variableCollectionId !== 'c-support')
    .map((v) => {
      if (v.variableCollectionId === 'c-main' && v.name.startsWith('color/main/')) {
        return { ...v, name: v.name.slice('color/main/'.length) };
      }
      return v;
    });
  return { collections: cols, variables: vars };
}

// HALF-migrated: pre shape, but a `Color` collection has appeared too.
function halfFixture() {
  const { collections, variables } = preFixture();
  return { collections: [...collections, { id: 'c-color', name: 'Color' }], variables };
}

// --- Plugin loader ----------------------------------------------------------

function loadPlugin(fixture) {
  const messages = [];
  let onmessage = null;
  const figma = {
    showUI() {},
    ui: {
      set onmessage(fn) { onmessage = fn; },
      get onmessage() { return onmessage; },
      postMessage(msg) { messages.push(msg); },
    },
    variables: {
      async getLocalVariableCollectionsAsync() { return fixture.collections; },
      async getLocalVariablesAsync() { return fixture.variables; },
    },
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');
  vm.runInNewContext(code, { figma, __html__: '' });
  return {
    async send(msg) {
      messages.length = 0;
      await onmessage(msg);
      return messages[messages.length - 1];
    },
  };
}

function varByName(fixture, name) {
  return fixture.variables.find((v) => v.name === name);
}

// --- Tests ------------------------------------------------------------------

async function run() {
  console.log('PRE-migration fixture');
  {
    const fx = preFixture();
    const plugin = loadPlugin(fx);
    const health = await plugin.send({ type: 'check-health' });
    assert(health.migrationState === 'pre', 'detects pre-migration');
    assert(health.action === 'check-health' && !!health.health, 'returns health summary');

    // generate-syntax with default (recommended = with color name)
    const fx2 = preFixture();
    const p2 = loadPlugin(fx2);
    await p2.send({ type: 'generate-syntax' });
    assert(
      varByName(fx2, 'color/accent/base-default').codeSyntax.WEB === 'var(--ds-color-accent-base-default)',
      'semantic accent gets group name'
    );
    assert(
      varByName(fx2, 'color/neutral/text-default').codeSyntax.WEB === 'var(--ds-color-neutral-text-default)',
      'semantic neutral gets group name'
    );
    assert(
      varByName(fx2, 'color/main/base-default').codeSyntax.WEB === 'var(--ds-color-base-default)',
      'main color has no group name'
    );
    assert(
      varByName(fx2, 'color/support/base-default').codeSyntax.WEB === 'var(--ds-color-base-default)',
      'support color has no group name'
    );
    assert(
      varByName(fx2, 'link/color/visited').codeSyntax.WEB === 'var(--ds-link-color-visited)',
      'link visited special case preserved'
    );

    // generate-scopes
    const fx3 = preFixture();
    const p3 = loadPlugin(fx3);
    // wipe scopes to force a change, then regenerate
    fx3.variables.forEach((v) => { v.scopes = []; });
    await p3.send({ type: 'generate-scopes' });
    const colorScopes = varByName(fx3, 'color/main/base-default').scopes;
    assert(
      colorScopes.length === 1 && colorScopes[0] === 'ALL_SCOPES',
      'color scopes = ALL_SCOPES'
    );
    assert(
      JSON.stringify(varByName(fx3, 'font-size/md').scopes) === JSON.stringify(['FONT_SIZE']),
      'font-size scope = FONT_SIZE'
    );
    assert(
      JSON.stringify(varByName(fx3, 'font-family').scopes) === JSON.stringify(['FONT_FAMILY']),
      'font-family scope = FONT_FAMILY'
    );
  }

  console.log('POST-migration fixture');
  {
    const fx = postFixture();
    const plugin = loadPlugin(fx);
    const health = await plugin.send({ type: 'check-health' });
    assert(health.migrationState === 'post', 'detects post-migration');

    const fx2 = postFixture();
    const p2 = loadPlugin(fx2);
    await p2.send({ type: 'generate-syntax' });
    assert(
      varByName(fx2, 'base-default').codeSyntax.WEB === 'var(--ds-color-base-default)',
      'Color collection var keeps group-less syntax'
    );
    assert(
      varByName(fx2, 'color/accent/base-default').codeSyntax.WEB === 'var(--ds-color-accent-base-default)',
      'semantic still gets group name post-migration'
    );

    const fx3 = postFixture();
    const p3 = loadPlugin(fx3);
    fx3.variables.forEach((v) => { v.scopes = []; });
    await p3.send({ type: 'generate-scopes' });
    const colorScopes = varByName(fx3, 'base-default').scopes;
    assert(
      colorScopes.length === 1 && colorScopes[0] === 'ALL_SCOPES',
      'Color collection scopes = ALL_SCOPES'
    );
  }

  console.log('HALF-migrated fixture');
  {
    const fx = halfFixture();
    const plugin = loadPlugin(fx);
    const res = await plugin.send({ type: 'check-health' });
    assert(res.migrationState === 'half', 'detects half-migration');
    // Non-blocking: a half-migrated file is still checked and processed.
    assert(!!res.health, 'half-migration returns a health summary (not blocked)');

    // a write action processes the color collections that are present
    const before = JSON.stringify(fx.variables.map((v) => v.codeSyntax));
    await plugin.send({ type: 'generate-syntax' });
    const after = JSON.stringify(fx.variables.map((v) => v.codeSyntax));
    assert(before !== after, 'half-migration writes syntax (not blocked)');

    // semantic colors get the recommended group name even mid-migration
    const sem = fx.variables.find((v) => v.name === 'color/accent/base-default');
    assert(
      sem && sem.codeSyntax.WEB === 'var(--ds-color-accent-base-default)',
      'half-migration applies semantic group name'
    );
  }

  console.log('');
  if (failures === 0) {
    console.log('All checks passed.');
  } else {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
