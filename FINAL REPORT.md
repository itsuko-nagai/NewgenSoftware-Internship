# design-audit — Complete Code Explanation
### For Internship Handoff & Review

---

## Project Overview

`design-audit` is a CLI (Command Line Interface) tool that acts as a **static analysis linter for design systems**. It reads a design specification from an Excel file, converts it to JSON rules, then scans a frontend codebase and reports every place where the actual CSS/HTML deviates from the design spec.

It does **not** run in a browser. It does **not** execute JavaScript. It reads source files as text and analyzes them.

---

## Final Project Structure

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

## Files Needed vs Not Needed

### ✅ Keep — Core Tool
| File | Why |
|---|---|
| `bin/cli.js` | The tool itself |
| `src/validators/htmlValidator.js` | HTML validator |
| `src/validators/scssValidator.js` | SCSS validator |
| `src/validators/rtlValidator.js` | RTL validator |
| `scripts/convert-tokens.js` | Excel converter |
| `package.json` | Dependencies |
| `state-map.json` | State mapping config |
| `rules-schema.json` | Schema validation |
| `selector-map-sample.json` | Template for users |
| `README.md` | Documentation |

### ✅ Keep — Demo
| File | Why |
|---|---|
| `src/demo/styles/*.css` | Demo CSS with intentional violations |
| `src/demo/page*.html` | Demo HTML pages |
| `rules-demo.json` | Demo rules for testing |

### ⚠️ Optional
| File | Why |
|---|---|
| `rules-generated.json` | Generated from Excel — can be regenerated anytime |
| `report.json` | Generated on each run — not needed to ship |

### ❌ Do NOT ship
| File | Why |
|---|---|
| `node_modules/` | Always excluded — recipient runs `npm install` |
| `.git/` | Internal version history |

---

## CLI Command Reference

```bash
# Full directory scan — auto-detects styles/ folder
node bin/cli.js scan ./src/demo --rules rules-demo.json --out report.json

# Single HTML file
node bin/cli.js scan ./src/demo/page1-buttons.html --rules rules-demo.json --out report.json

# Manual stylesheet override
node bin/cli.js scan ./src/demo --rules rules-demo.json --stylesheet ./src/demo/styles --out report.json

# With real rules from Excel
node bin/cli.js scan ./src --rules rules-generated.json --out report.json

# With schema validation
node bin/cli.js scan ./src/demo --rules rules-demo.json --schema rules-schema.json --out report.json
```

---

## Every File Explained In Detail

---

### `bin/cli.js` — The Entry Point

This is the brain of the tool. It is the first file that runs when you type the command.

**What it does step by step:**

1. Uses **Commander** to parse the command and arguments typed in the terminal
2. Loads `rules.json` into memory
3. Optionally validates the rules against `rules-schema.json` using AJV
4. **Auto-detects the `styles/` folder** — looks for `styles/`, `css/`, `scss/` subfolders in the target directory. If found, uses all CSS files inside as the central stylesheet. If not found, scans all CSS files in the target directory.
5. Discovers all `.html` files in the target directory
6. **Phase 1 — HTML first:** For each HTML file, calls `validateHTML()` which returns accessibility issues AND an "Active Selectors" manifest — a list of design system classes actually used in the HTML
7. **Phase 2 — CSS validation:** For each CSS file in the styles folder, calls `validateSCSS()` with the active selectors manifest. Only validates CSS for selectors that are actually used in HTML.
8. **Phase 3 — RTL validation:** For each CSS file, calls `validateRTL()`
9. Sorts all issues deterministically (file → type → property → message)
10. Writes the final JSON report
11. Exits with code `1` if any issues found (for CI/CD pipelines)

**Key design decision — HTML first:**
The tool scans HTML before CSS. This means it only validates CSS for components that are actually being used. If `.ds-modal` exists in CSS but no HTML page uses it, it won't be flagged. This avoids false positives and makes the tool context-aware.

**Auto-detection of styles folder:**
Instead of requiring `--stylesheet` every time, the CLI automatically looks for a `styles/` subfolder in the target directory. This means the command stays simple:
```bash
node bin/cli.js scan ./src/demo --rules rules-demo.json --out report.json
```

**Imports used:**
- `commander` — parses terminal arguments
- `fs/promises` — reads/writes files
- `glob` — finds files recursively
- `path` — handles file paths
- `ajv` — validates rules JSON structure

---

### `src/validators/htmlValidator.js` — HTML Validator

**Two jobs in one file:**

**Job 1 — Accessibility checks:**
- Checks if `<html>` has a `lang` attribute. Screen readers need this to know which language to speak.
- Checks if every `<img>` has an `alt` attribute. Screen readers read alt text for blind users.
- Checks if every `<input>` has an associated label via `<label for="">`, `aria-label`, or `aria-labelledby`. Without this, screen readers can't announce what the field is for.

**Job 2 — Class extraction (the "Scout"):**
- Uses Cheerio to walk every single HTML element
- Extracts every class and id attribute
- For every class starting with `ds-`:
  - If it's in `rules.json` → adds it to the **Active Selectors manifest** with count and element IDs
  - If it's NOT in `rules.json` → flags it as `invalid-design-class`

**The Active Selectors manifest** is the bridge between HTML and CSS validation. It tells the SCSS validator: "these are the design system classes actually used in the HTML today — only check these."

**Example manifest output:**
```json
[
  { "selector": ".ds-btn--primary", "count": 5, "elementIds": ["#btn-submit", "#btn-save"] },
  { "selector": ".ds-dropdown__box", "count": 2, "elementIds": ["#input-country", "#input-dept"] }
]
```

**Library used:** Cheerio — HTML parser with jQuery-like API (`$('img')`, `$('html').attr('lang')`)

**Returns:** `{ issues: [...], activeSelectors: [...] }` — both accessibility issues AND the manifest

---

### `src/validators/scssValidator.js` — SCSS Validator

This is the core engine. The most complex file.

**What it does:**

**Step 1 — Load state mapping**
Reads `state-map.json` to know how CSS states map to selector patterns:
```json
"Error": [".is-error", ".error", ":invalid", "[aria-invalid=\"true\"]"]
```

**Step 2 — Parse the CSS file**
Uses PostCSS with postcss-scss to build an AST (Abstract Syntax Tree). The file is converted from text into a structured tree of Rule nodes and Declaration nodes.

```
Root
├── Rule (.ds-btn--primary)
│   ├── Declaration (background-color: #FF0000)
│   └── Declaration (padding-left: 20px)
└── Rule (.ds-btn--primary:hover)
    └── Declaration (background-color: #CC0000)
```

**Step 3 — Filter by active selectors**
Only processes rules whose `Selector` field appears in the active selectors manifest from HTML. This is the "HTML-first" connection.

**Step 4 — Generate test selectors per state**
For each design rule, generates all possible CSS selector patterns based on the state:
- Rule: `Selector: ".ds-input", State: "Error"`
- State map says Error → `[".is-error", ":invalid"]`
- Generated: `".ds-input.is-error"` and `".ds-input:invalid"`
- Searches SCSS for ANY of these — logical OR

**Step 5 — Compare values**
Three-step comparison:
1. Direct match: `actual === expected`
2. Extract fallback hex from `var(--token, #hex)` using regex: `/var\([^,]+,\s*(#[0-9a-fA-F]{3,6})\s*\)/i`
3. Check actual against fallback hex
If all fail → `design-token-mismatch`

**Step 6 — Add hex swatches**
For color properties, extracts the raw hex from both values:
```json
"foundHex": "#ff0000",
"expectedHex": "#2563eb"
```
VS Code renders color swatches next to hex values in JSON files — this makes violations visually obvious.

**Issue types produced:**
- `design-token-mismatch` — wrong value
- `missing-property` — property not found in selector
- `missing-state` — no CSS found for hover/error/disabled state

**Libraries used:** PostCSS + postcss-scss

---

### `src/validators/rtlValidator.js` — RTL Validator

**What RTL means:** Right-to-Left. Arabic, Hebrew, Urdu read right-to-left. If CSS uses directional properties like `padding-left`, the layout breaks in RTL mode because "left" is always left regardless of text direction.

**The fix — CSS Logical Properties:**
`padding-left` → `padding-inline-start`
`padding-right` → `padding-inline-end`

`padding-inline-start` automatically means "start of text direction" — left in LTR, right in RTL. The browser handles it.

**What it checks:**

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

**How it works:** Uses `postcssScss.parse()` to build AST, then `root.walkDecls()` to visit every single CSS declaration in the file. No rules needed — RTL check runs on every CSS file regardless.

**Issue types:** `rtl-directional-property`, `rtl-text-align` with severity `warning`

---

### `scripts/convert-tokens.js` — Excel Converter

**The problem it solves:** The design spec lives in `Dev_Tokens.xlsx` — 3,379 rows, 137 components. The CLI needs JSON. Manually writing 2,083 rule objects is impossible.

**Excel structure it reads:**
```
Col 0: Component Name  (merged cells — fill-down)
Col 1: Element         (merged cells — fill-down)
Col 2: Property
Col 3: Default state value
Col 4: Hover state value
Col 5: Active state value
Col 6: Disabled state value
Col 7: Error state value
```

**Key logic — fill-down for merged cells:**
When Component Name or Element is blank, it means "same as the row above." The converter tracks `currentComponent` and `currentElement` variables and only updates them when a non-empty value appears.

**Dirty data filtering:**
Some Excel cells contain notes like "left navigation" instead of CSS values. The converter skips:
- Values that are `--` (designer's "not applicable")
- Multi-word plain English strings with no CSS characters

**Output per row per state:**
```json
{
  "Component": "Text Field",
  "Element": "Label",
  "Selector": "",
  "State": "Default",
  "Property": "Text Colour",
  "Value": "var(--Text-Primary, #001111)"
}
```

**Command:**
```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules-generated.json
```

**Library used:** `xlsx` npm package

---

### `state-map.json` — State Mapping Config

Maps human-readable state names from `rules.json` to the CSS selector patterns the validator should look for.

```json
{
  "stateMapping": {
    "Default": [""],
    "Hover": [":hover"],
    "Error": [".is-error", ".error", ":invalid", "[aria-invalid=\"true\"]"],
    "Disabled": [":disabled", "[disabled]", ".is-disabled"]
  }
}
```

**Why it's a config file and not hardcoded:**
Different projects use different naming conventions. An Angular project might use `.ng-invalid` for error state. A BEM project might use `.ds-input--error`. Users add their project-specific patterns to this file without touching the core validator code.

**How it's used:**
```
Rule: Selector = ".ds-input", State = "Error"
Lookup "Error" → [".is-error", ".error", ":invalid"]
Generate: ".ds-input.is-error", ".ds-input.error", ".ds-input:invalid"
Search SCSS for ANY of these (logical OR)
```

---

### `rules-schema.json` — AJV Schema

Defines the required structure of the rules JSON file. Used by AJV to validate `rules.json` before running any analysis.

**What it enforces:**
- Must be an array
- Each item must have: `Component`, `Element`, `State`, `Property`, `Value` (required)
- `Selector` is allowed but optional
- No unknown fields (`additionalProperties: false`)

**When it's useful:** When someone manually edits the rules file and makes a mistake — wrong field name, missing required field, wrong data type. AJV catches it before the scan starts.

**When it's not needed:** When rules come from the converter script — the script always produces correctly structured output.

---

### `rules-demo.json` — Demo Rules

10 hand-written rules used only for demonstrating the tool. Covers: Primary Button, Secondary Button, Text Field, Dropdown, Card, Navbar, Tabs.

**Not used in production.** In real usage, use `rules-generated.json`.

---

### `rules-generated.json` — Real Rules

2,083 rules generated from `Dev_Tokens.xlsx` covering all 137 components across 5 states. Generated by:
```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules-generated.json
```

The `Selector` field is empty for all rules until a `selector-map.json` is filled in and the converter is run with `--selector-map`.

---

### `selector-map-sample.json` — Selector Map Template

Maps component names from the Excel to actual CSS class names in the codebase.

```json
[
  {
    "Component": "Text Field",
    "Element": "Label",
    "Selector": ".ds-text-field__label"
  }
]
```

**Why it's not automated:** The Excel has human-readable names (`"Text Field" → "Label"`) but CSS class names (`".ds-text-field__label"`) are implementation decisions made by developers. There's no reliable way to auto-generate one from the other.

**Usage:** Copy this file, fill in the real class names from your codebase, then run:
```bash
node scripts/convert-tokens.js Dev_Tokens.xlsx rules.json --selector-map selector-map.json
```

---

### `src/demo/styles/` — Central Demo Stylesheets

Four CSS files with **intentional violations** to demonstrate the tool catching real issues.

**buttons.css violations:**
- `background-color: #FF0000` — should be `var(--Surface-Brand, #2563eb)`
- `padding-left/right` — RTL violations

**forms.css violations:**
- `color: #FF0000` on labels — should be `var(--Text-Primary, #001111)`
- `border-radius: 2px` on dropdown — should be `4px`
- `padding-left/right` throughout — RTL violations

**cards.css violations:**
- `color: #FF0000` on headings — should be `var(--Text-Primary, #111827)`
- `text-align: left` — RTL violation

**navigation.css violations:**
- `background-color: #FF0000` on navbar — should be `var(--Surface-Brand, #2563eb)`
- Active tab color wrong — should be brand blue

**Why intentional violations?** The demo is a controlled environment. The CSS was written wrong on purpose so every validator fires visibly. In real usage you point the tool at actual code and find real violations.

---

### Demo Pages

**page1-buttons.html** — Shows Primary Button, Secondary Button, Tabs with working tab switching via JavaScript.

**page2-forms.html** — Shows Text Fields with live JavaScript validation (email format, phone 10 digits, required fields) and Dropdowns with error states.

**page3-cards.html** — Shows Card components with navigation linking all three pages.

All three pages share the same Navigation Bar via `navigation.css`.

---

## The Full Data Flow

```
Dev_Tokens.xlsx (3,379 rows, 137 components)
        ↓
convert-tokens.js (fill-down, state extraction, dirty data filtering)
        ↓
rules-generated.json (2,083 structured rules)
        ↓
bin/cli.js scan ./src/demo --rules rules-generated.json
        ↓
Phase 1: htmlValidator.js
  → Reads page1.html, page2.html, page3.html
  → Extracts ds- classes
  → Builds Active Selectors manifest
  → Flags invalid ds- classes
  → Checks accessibility
        ↓
Phase 2: scssValidator.js
  → Reads styles/buttons.css, forms.css, cards.css, navigation.css
  → For each active selector:
      → Finds matching CSS rule in stylesheet
      → Generates state-specific test selectors from state-map.json
      → Compares actual value vs expected value
      → Handles var(--token, #fallback)
      → Extracts hex swatches for color violations
        ↓
Phase 3: rtlValidator.js
  → Reads all CSS files
  → Flags every padding-left, margin-right, text-align: left etc.
        ↓
report.json
  → meta: { totalFiles, totalIssues, summary }
  → activeSelectors: [{ selector, count, elementIds }]
  → issues: [{ file, type, severity, component, element, selector,
               state, property, expected, found, foundHex, expectedHex,
               elementId, message }]
```

---


## Dependencies Explained

| Package | Version | Purpose |
|---|---|---|
| `commander` | ^12 | Parses terminal arguments and defines CLI commands |
| `cheerio` | ^1 | Parses HTML files with jQuery-like API |
| `glob` | ^10 | Recursively finds files matching patterns |
| `ajv` | ^8 | Validates JSON against a schema |
| `postcss` | ^8 | Core CSS parser — builds AST from CSS files |
| `postcss-scss` | ^4 | Adds SCSS syntax support to PostCSS |
| `xlsx` | ^0.18 | Reads Excel files (.xlsx) in Node.js |

**Node.js version required:** 20+ (for ESM support)

---

## Common Issues & Fixes

| Error | Cause | Fix |
|---|---|---|
| `ERR_UNSUPPORTED_DIR_IMPORT` | Importing a folder path in ESM | Use explicit `.js` extension in imports |
| `does not provide export named 'default'` for glob | glob v10 has no default export | `import { glob } from 'glob'` |
| `does not provide export named 'default'` for cheerio | cheerio v1 ESM | `import * as cheerio from 'cheerio'` |
| `XLSX.readFile is not a function` | Wrong XLSX import style | `import XLSX from 'xlsx'` (default import) |
| `value.trim is not a function` | Excel numeric cells | `String(value).trim()` |
| Bash `!` causes event not found | Bash history expansion | Use `cat > file << 'EOF'` heredoc instead |
| Browser can't read `.scss` file | Browser only reads plain CSS | Rename to `.css` or compile with sass |