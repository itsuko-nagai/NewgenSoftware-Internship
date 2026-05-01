import fs from 'fs/promises';
import postcss from 'postcss';
import postcssScss from 'postcss-scss';

// ─── LOAD STATE MAP ──────────────────────────────────────────────────
let stateMapping = null;

async function loadStateMapping(configPath) {
  if (stateMapping) return stateMapping;
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    stateMapping = JSON.parse(raw).stateMapping;
  } catch {
    stateMapping = {
      Default: [''],
      Hover: [':hover'],
      Active: [':active'],
      Focus: [':focus', ':focus-visible'],
      Disabled: [':disabled', '[disabled]', '.is-disabled'],
      Error: ['.is-error', '.error', ':invalid', '[aria-invalid="true"]'],
      Selected: ['.is-selected', '.selected', '[aria-selected="true"]'],
      Expanded: ['.is-expanded', '.expanded', '[aria-expanded="true"]'],
    };
  }
  return stateMapping;
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function normalizeValue(val) {
  if (!val) return '';
  let v = String(val).trim().toLowerCase();
  v = v.replace(/^#([0-9a-f]{3})$/, (_, h) =>
    '#' + h.split('').map(c => c + c).join('')
  );
  return v;
}

// Extract hex from var(--token, #hex) or return raw hex if already hex
function extractHex(val) {
  if (!val) return null;
  const v = val.trim();
  // Direct hex
  if (/^#[0-9a-fA-F]{3,6}$/.test(v)) return v.toLowerCase();
  // Extract from var(--token, #hex)
  const match = v.match(/var\([^,]+,\s*(#[0-9a-fA-F]{3,6})\s*\)/i);
  return match ? match[1].toLowerCase() : null;
}

// Check if a value is color-related property
function isColorProperty(prop) {
  const colorProps = [
    'color', 'background-color', 'background',
    'border-color', 'border-top-color', 'border-bottom-color',
    'border-left-color', 'border-right-color',
    'border', 'border-top', 'border-bottom',
    'outline-color', 'box-shadow', 'fill', 'stroke'
  ];
  return colorProps.includes(prop.toLowerCase());
}

function generateTestSelectors(baseSelector, state, mapping) {
  const patterns = mapping[state] || mapping['Default'] || [''];
  return patterns.map(pattern => `${baseSelector}${pattern}`);
}

function selectorMatches(ruleSelector, testSelectors) {
  const normalized = ruleSelector.toLowerCase().replace(/\s+/g, ' ').trim();
  return testSelectors.some(test => {
    const t = test.toLowerCase().trim();
    if (t === '') return false;
    return normalized === t ||
      normalized.includes(t) ||
      normalized.endsWith(t);
  });
}

// ─── MAIN VALIDATOR ──────────────────────────────────────────────────

export async function validateSCSS(filePath, rules, activeSelectors = null, configPath = './state-map.json') {
  const issues = [];
  const mapping = await loadStateMapping(configPath);

  let content;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    return [{ file: filePath, type: 'error', message: `Could not read file: ${err.message}` }];
  }

  let root;
  try {
    root = postcssScss.parse(content);
  } catch (err) {
    return [{ file: filePath, type: 'error', message: `Parse error: ${err.message}` }];
  }

  const activeSet = activeSelectors
    ? new Set(activeSelectors.map(a => a.selector))
    : null;

  const selectorDeclMap = new Map();
  root.walkRules(rule => {
    const sel = rule.selector.trim();
    if (!selectorDeclMap.has(sel)) selectorDeclMap.set(sel, []);
    rule.walkDecls(decl => {
      selectorDeclMap.get(sel).push({
        prop: decl.prop.trim().toLowerCase(),
        value: decl.value.trim()
      });
    });
  });

  for (const designRule of rules) {
    const { Component, Element, Selector, State, Property, Value } = designRule;
    if (!Selector || Selector.trim() === '') continue;
    if (activeSet && !activeSet.has(Selector)) continue;

    const manifestEntry = activeSelectors
      ? activeSelectors.find(a => a.selector === Selector)
      : null;

    const elementInfo = manifestEntry
      ? ` [used ${manifestEntry.count}x in HTML${manifestEntry.elementIds.length ? ', ids: ' + manifestEntry.elementIds.join(', ') : ''}]`
      : '';

    const testSelectors = generateTestSelectors(Selector, State, mapping);
    const isDefaultState = State === 'Default' || State === 'default';

    const matchingEntries = [];
    for (const [ruleSel, decls] of selectorDeclMap) {
      if (isDefaultState) {
        if (ruleSel.toLowerCase().includes(Selector.toLowerCase()) &&
          !ruleSel.includes(':hover') &&
          !ruleSel.includes(':focus') &&
          !ruleSel.includes(':active') &&
          !ruleSel.includes(':disabled') &&
          !ruleSel.includes('.is-') &&
          !ruleSel.includes('.error')) {
          matchingEntries.push({ selector: ruleSel, decls });
        }
      } else {
        if (selectorMatches(ruleSel, testSelectors)) {
          matchingEntries.push({ selector: ruleSel, decls });
        }
      }
    }

    if (!isDefaultState && matchingEntries.length === 0) {
      issues.push({
        file: filePath,
        type: 'missing-state',
        severity: 'error',
        component: Component,
        element: Element,
        selector: Selector,
        state: State,
        property: Property,
        expected: Value,
        searchedFor: testSelectors,
        message: `[${Component} / ${Element}] State "${State}" — no CSS found for ${testSelectors.join(' or ')}${elementInfo}`
      });
      continue;
    }

    if (matchingEntries.length === 0) continue;

    let propertyFound = false;

    for (const { selector: matchedSel, decls } of matchingEntries) {
      const matchingDecl = decls.find(d => d.prop === Property.toLowerCase());

      if (matchingDecl) {
        propertyFound = true;
        const actual = normalizeValue(matchingDecl.value);
        const expected = normalizeValue(Value);

        if (actual === expected) continue;

        const fallbackHex = extractHex(Value);
        if (fallbackHex && actual === fallbackHex) continue;

        // Build the issue
        const issue = {
          file: filePath,
          type: 'design-token-mismatch',
          severity: 'error',
          component: Component,
          element: Element,
          selector: matchedSel,
          state: State,
          property: Property,
          expected: Value,
          found: matchingDecl.value,
          elementId: manifestEntry ? manifestEntry.elementIds[0] || null : null,
          message: `[${Component} / ${Element}] "${Property}" expected "${Value}", found "${matchingDecl.value}"${elementInfo}`
        };

        // Add hex color swatches if this is a color property
        if (isColorProperty(Property)) {
          const foundHex = extractHex(matchingDecl.value);
          const expectedHex = extractHex(Value);
          if (foundHex) issue.foundHex = foundHex;
          if (expectedHex) issue.expectedHex = expectedHex;
        }

        issues.push(issue);
      }
    }

    if (!propertyFound && matchingEntries.length > 0) {
      issues.push({
        file: filePath,
        type: 'missing-property',
        severity: 'error',
        component: Component,
        element: Element,
        selector: Selector,
        state: State,
        property: Property,
        expected: Value,
        found: 'missing',
        elementId: manifestEntry ? manifestEntry.elementIds[0] || null : null,
        message: `[${Component} / ${Element}] "${Property}" not found in "${Selector}" [${State}]${elementInfo}`
      });
    }
  }

  return issues;
}
