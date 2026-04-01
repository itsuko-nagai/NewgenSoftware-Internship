# design-audit

A CLI-based static analysis tool that validates frontend code against a centralized design system. It checks HTML accessibility, SCSS design token compliance, and RTL (Right-to-Left) readiness.

---

## Requirements

- Node.js 20+
- WSL or Linux/macOS terminal
- npm

---

## Installation

```bash
npm install
```

To use the `design-audit` command globally:

```bash
npm link
```

---

## Project Structure

```
design-audit/
├── bin/
│   └── cli.js                  # CLI entry point
├── src/
│   └── validators/
│       ├── htmlValidator.js    # Accessibility checks
│       ├── scssValidator.js    # Design token compliance
│       └── rtlValidator.js     # RTL property checks
├── scripts/
│   └── convert-tokens.js      # Excel → JSON rule converter
├── rules-schema.json           # AJV validation schema for rules
├── selector-map-sample.json    # Sample selector mapping config
└── README.md
```

---

## Workflow

### Step 1 — Convert Design Tokens from Excel

The design source of truth is an Excel file with this column structure:

| Component Name | Element | Property | Default | Hover | Active | Disabled | Error |
|---|---|---|---|---|---|---|---|

Run the converter:

```bash
node scripts/convert-tokens.js <path-to-excel> rules-generated.json
```

Example:

```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules-generated.json
```

This outputs a `rules-generated.json` file with one rule object per component/element/state/property combination.

### Step 2 — Define Selector Mapping

The Excel does not contain CSS selectors. You must provide a `selector-map.json` that maps each Component + Element to its actual CSS selector in your codebase.

Use `selector-map-sample.json` as a reference:

```json
[
  {
    "Component": "Text Field",
    "Element": "Label",
    "Selector": ".ds-text-field__label"
  }
]
```

The converter will automatically merge selectors into the rules if you pass the map:

```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules.json --selector-map selector-map.json
```

Rules without a matching selector entry will have `"Selector": ""` and will be skipped by the SCSS validator.

### Step 3 — Run the Audit

```bash
node bin/cli.js scan <targetDir> --rules <rulesPath> --schema <schemaPath> --out <outputPath>
```

Example:

```bash
node bin/cli.js scan ./src --rules rules.json --schema rules-schema.json --out report.json
```

---

## CLI Options

| Option | Required | Default | Description |
|---|---|---|---|
| `<targetDir>` | ✅ | — | Directory to scan recursively |
| `--rules` | ✅ | — | Path to rules JSON array |
| `--schema` | ✅ | — | Path to rules-schema.json for AJV validation |
| `--out` | ❌ | `./results.json` | Output path for the report |

---

## Validators

### HTML Validator
Checks every `.html` file for:
- Missing `lang` attribute on `<html>`
- Missing `alt` attribute on `<img>` elements
- Inputs with no associated label, `aria-label`, or `aria-labelledby`

### SCSS Validator
For each rule with a non-empty `Selector`:
- Finds matching CSS rules in `.scss` and `.css` files
- Compares the actual property value against the expected value from the design tokens
- Supports `var(--token-name, #fallback)` — accepts both the token and the fallback hex
- Reports `design-token-mismatch` when values differ
- Reports `missing-property` when the property is not found in the selector

### RTL Validator
Checks every `.scss` and `.css` file for:
- Directional properties that should use logical equivalents

| Found | Suggestion |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |

---

## Output Format

The report is a deterministic JSON file:

```json
{
  "meta": {
    "generatedAt": "2026-03-03T22:23:16.863Z",
    "totalFiles": 12,
    "totalIssues": 4,
    "summary": {
      "accessibility": 2,
      "design-token-mismatch": 1,
      "rtl-directional-property": 1
    }
  },
  "issues": [
    {
      "file": "src/components/form.html",
      "type": "accessibility",
      "severity": "error",
      "message": "<html> element missing lang attribute"
    },
    {
      "file": "src/components/text-field.scss",
      "type": "design-token-mismatch",
      "severity": "error",
      "component": "Text Field",
      "element": "Label",
      "selector": ".ds-text-field__label",
      "state": "Default",
      "property": "color",
      "expected": "var(--Text-Primary, #001111)",
      "found": "#FF0000",
      "message": "[Text Field / Label] \"color\" expected \"var(--Text-Primary, #001111)\", found \"#FF0000\""
    }
  ]
}
```

### Issue Types

| Type | Severity | Description |
|---|---|---|
| `accessibility` | error / warning | HTML accessibility violation |
| `design-token-mismatch` | error | CSS value differs from design token |
| `missing-property` | error | Expected CSS property not found in selector |
| `rtl-directional-property` | warning | Directional CSS property should use logical equivalent |
| `rtl-text-align` | warning | `text-align: left/right` should use `start/end` |

---

## CI Integration

The CLI exits with code `1` if any issues are found, making it suitable for CI pipelines:

```yaml
# Example GitHub Actions step
- name: Run design audit
  run: node bin/cli.js scan ./src --rules rules.json --schema rules-schema.json --out report.json
```

---

## Rules Schema

Rules are validated against `rules-schema.json` using AJV. Each rule object must have:

```json
{
  "Component": "Text Field",
  "Element": "Label",
  "Selector": ".ds-text-field__label",
  "State": "Default",
  "Property": "color",
  "Value": "var(--Text-Primary, #001111)"
}
```

| Field | Type | Description |
|---|---|---|
| `Component` | string | Component name from the design system |
| `Element` | string | Sub-element within the component |
| `Selector` | string | CSS selector in the codebase (empty = skip SCSS check) |
| `State` | string | One of: Default, Hover, Active, Disabled, Error |
| `Property` | string | CSS property name |
| `Value` | string | Expected value from design tokens |

---

## Ignored Paths

The scanner automatically ignores:
- `node_modules/`
- `dist/`