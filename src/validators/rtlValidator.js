import fs from 'fs/promises';
import postcss from 'postcss';
import postcssScss from 'postcss-scss';

export async function validateRTL(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const issues = [];

  const suggestions = {
    'margin-left': 'margin-inline-start',
    'margin-right': 'margin-inline-end',
    'padding-left': 'padding-inline-start',
    'padding-right': 'padding-inline-end',
    'border-left': 'border-inline-start',
    'border-right': 'border-inline-end',
    'border-left-width': 'border-inline-start-width',
    'border-right-width': 'border-inline-end-width',
    'border-left-color': 'border-inline-start-color',
    'border-right-color': 'border-inline-end-color',
    'left': 'inset-inline-start',
    'right': 'inset-inline-end'
  };

  const root = postcssScss.parse(content);

  root.walkDecls((decl) => {
    if (suggestions[decl.prop]) {
      issues.push({
        file: filePath,
        type: "rtl-directional-property",
        severity: "warning",
        property: decl.prop,
        value: decl.value,
        line: decl.source?.start?.line,
        suggestion: suggestions[decl.prop],
        message: `"${decl.prop}" should be "${suggestions[decl.prop]}" for RTL support (line ${decl.source?.start?.line})`
      });
    }

    if (decl.prop === 'text-align' && ['left', 'right'].includes(decl.value)) {
      const suggestion = decl.value === 'left' ? 'start' : 'end';
      issues.push({
        file: filePath,
        type: "rtl-text-align",
        severity: "warning",
        property: decl.prop,
        value: decl.value,
        line: decl.source?.start?.line,
        suggestion,
        message: `"text-align: ${decl.value}" should be "text-align: ${suggestion}" for RTL support (line ${decl.source?.start?.line})`
      });
    }
  });

  return issues;
}
