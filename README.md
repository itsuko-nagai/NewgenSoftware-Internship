# design-audit

A CLI-based static analysis tool that acts as a **static analysis linter for design systems**. It validates frontend code against a centralized design system by checking HTML accessibility, SCSS design token compliance, and RTL (Right-to-Left) readiness.

It does **not** run in a browser or execute JavaScript. It reads source files as text and analyzes them.

### Key Design Philosophy: HTML-First
The tool scans HTML before CSS. This allows it to build an **Active Selectors manifest**—a list of design system classes actually used in the HTML. The SCSS validator then only checks CSS for components that are actually being used. This avoids false positives and makes the tool context-aware.

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
│   └── cli.js                        ← Entry point. The main CLI command.
├── src/
│   ├── demo/
│   │   ├── styles/                   ← Central CSS folder (auto-detected)
│   │   │   ├── buttons.css           ← Button component styles (intentional violations)
│   │   │   ├── cards.css             ← Card component styles
│   │   │   ├── forms.css             ← Form/input/dropdown styles
│   │   │   └── navigation.css        ← Navbar and tabs styles
│   │   ├── page1-buttons.html        ← Demo page 1: Buttons + Tabs
│   │   ├── page2-forms.html          ← Demo page 2: Forms + Validation
│   │   └── page3-cards.html          ← Demo page 3: Cards
│   └── validators/
│       ├── htmlValidator.js          ← Validates HTML files
│       ├── scssValidator.js          ← Validates CSS/SCSS against rules
│       └── rtlValidator.js           ← Checks RTL compliance
├── scripts/
│   └── convert-tokens.js             ← Converts Excel → JSON rules
├── package.json                      ← Project config + dependencies
├── rules-schema.json                 ← AJV schema for validating rules format
├── rules-demo.json                   ← 10 hand-written rules for demo
├── rules-generated.json              ← 2,083 rules generated from Excel
├── selector-map-sample.json          ← Template for mapping components to CSS selectors
├── state-map.json                    ← Maps rule states to CSS selector patterns
├── report.json                       ← Output report (generated on each run)
└── README.md                         ← Documentation
```

---

## Workflow

### Step 1 — Convert Design Tokens from Excel

The design source of truth is an Excel file. The converter script handles merged cells (fill-down logic) and filters out non-CSS data.

```bash
node scripts/convert-tokens.js <path-to-excel> rules-generated.json
```

Example:

```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules-generated.json
```

### Step 2 — Define Selector Mapping

The SCSS validator requires CSS selectors to find matching rules in your codebase. You can use `selector-map-sample.json` as a reference for mapping Component + Element to CSS selectors.

Apply the mapping by running the converter with the `--selector-map` flag:

```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules.json --selector-map selector-map.json
```

Rules with an empty `"Selector": ""` will be skipped by the SCSS validator.

### Step 3 — Run the Audit

```bash
node bin/cli.js scan <targetDir> --rules <rulesPath> --schema <schemaPath> --out <outputPath>
```

Example:

```bash
node bin/cli.js scan ./src/demo --rules rules-demo.json --schema rules-schema.json --out report.json
```

#### Style Auto-Detection
The CLI automatically looks for `styles/`, `css/`, or `scss/` subfolders in the target directory. If found, it uses all CSS/SCSS files inside as the central stylesheet. If not found, it scans all styles in the target directory recursively.

---

## CLI Options

| Option | Required | Default | Description |
|---|---|---|---|
| `<targetDir>` | ✅ | — | Directory to scan recursively |
| `--rules` | ✅ | — | Path to rules JSON array |
| `--stylesheet` | ❌ | — | Manual path to a CSS/SCSS file or folder (overrides auto-detection) |
| `--schema` | ❌ | — | Path to rules-schema.json for AJV validation |
| `--state-map` | ❌ | `./state-map.json` | Path to state suffix mapping config |
| `--out` | ❌ | `./results.json` | Output path for the report |

---

## Validators

### HTML Validator
**The Scout:**
- Scans HTML first to extract every class starting with `ds-`.
- Builds the **Active Selectors manifest** for the SCSS validator.
- Flags classes used in HTML that are not defined in the design tokens (`invalid-design-class`).
- Performs accessibility checks:
  - Missing `lang` attribute on `<html>`.
  - Missing `alt` attribute on `<img>`.
  - Inputs without associated labels (`aria-label`, `aria-labelledby`, or `<label for="">`).

### SCSS Validator
**The Engine:**
- Uses PostCSS to build an Abstract Syntax Tree (AST) of your stylesheets.
- Only validates selectors found in the Active Selectors manifest.
- Maps human-readable states (Hover, Error, etc.) to CSS patterns using `state-map.json`.
- Compares actual values against expected tokens, supporting `var(--token, #fallback)` syntax.
- **Hex Swatches:** Adds `foundHex` and `expectedHex` fields to the report, allowing VS Code to render visual color swatches for violations.

### RTL Validator
**Logical Property Checker:**
Checks every stylesheet for directional properties and suggests modern CSS Logical Properties.

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
      "foundHex": "#FF0000",
      "expectedHex": "#001111",
      "message": "[Text Field / Label] \"color\" expected \"var(--Text-Primary, #001111)\", found \"#FF0000\""
    }
  ]
}
```

### Issue Types

| Type | Severity | Description |
|---|---|---|
| `accessibility` | error / warning | HTML accessibility violation |
| `invalid-design-class` | warning | Class starting with `ds-` used in HTML but not in tokens |
| `design-token-mismatch` | error | CSS value differs from design token |
| `missing-property` | error | Expected CSS property not found in selector |
| `missing-state` | error | No CSS found for a required state (e.g., hover, error) |
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

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ERR_UNSUPPORTED_DIR_IMPORT` | Importing a folder path in ESM | Use explicit `.js` extension in imports |
| `does not provide export named 'default'` for glob | glob v10 has no default export | `import { glob } from 'glob'` |
| `does not provide export named 'default'` for cheerio | cheerio v1 ESM | `import * as cheerio from 'cheerio'` |
| `XLSX.readFile is not a function` | Wrong XLSX import style | `import XLSX from 'xlsx'` (default import) |
| `value.trim is not a function` | Excel numeric cells | `String(value).trim()` |

---

## Ignored Paths

The scanner automatically ignores:
- `node_modules/`
- `dist/`
