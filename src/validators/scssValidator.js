import fs from 'fs/promises';
import postcss from 'postcss';
import postcssScss from 'postcss-scss';

export async function validateSCSS(filePath, rules) {
  const content = await fs.readFile(filePath, 'utf8');
  const issues = [];

  const root = postcssScss.parse(content);

  root.walkRules((rule) => {
    rules.forEach((r) => {
      if (!r.Selector || !rule.selector.includes(r.Selector)) return;

      let propertyFound = false;

      rule.walkDecls((decl) => {
        if (decl.prop.toLowerCase() !== r.Property.toLowerCase()) return;
        propertyFound = true;

        const actual = decl.value.trim().toLowerCase();
        const expected = r.Value.trim().toLowerCase();

        if (actual === expected) return;
        const fallbackMatch = expected.match(/var\([^,]+,\s*(#[0-9a-f]{3,6})\s*\)/i);
        const fallback = fallbackMatch ? fallbackMatch[1].toLowerCase() : null;

        if (fallback && actual === fallback) return;

        issues.push({
          file: filePath,
          type: "design-token-mismatch",
          severity: "error",
          component: r.Component,
          element: r.Element,
          selector: r.Selector,
          state: r.State,
          property: r.Property,
          expected: r.Value,
          found: decl.value.trim(),
          message: `[${r.Component} / ${r.Element}] "${r.Property}" expected "${r.Value}", found "${decl.value.trim()}"`
        });
      });

      if (!propertyFound) {
        issues.push({
          file: filePath,
          type: "missing-property",
          severity: "error",
          component: r.Component,
          element: r.Element,
          selector: r.Selector,
          state: r.State,
          property: r.Property,
          expected: r.Value,
          found: "missing",
          message: `[${r.Component} / ${r.Element}] "${r.Property}" not found in selector "${r.Selector}"`
        });
      }
    });
  });

  return issues;
}
