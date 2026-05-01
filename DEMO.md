# Design Audit Demo Guide

This project includes a built-in demo to showcase the capabilities of the static analysis tool. The demo consists of sample HTML and SCSS files designed to trigger various validation issues.

## Demo Files

Located in `src/demo/`:

- **`page1-buttons.html`**: Contains button components with some accessibility violations (e.g., missing labels).
- **`page2-forms.html`**: Contains form elements to test accessibility and design token compliance.
- **`page3-cards.html`**: Showcases card components with RTL issues.
- **`buttons.scss`**: Styles for buttons using a mix of hardcoded values and design tokens.
- **`cards.css` / `forms.css` / `navigation.css`**: CSS files containing various directional properties to test the RTL validator.

## Running the Demo Audit

To run the audit against the demo files, use the following command:

```bash
node bin/cli.js scan ./src/demo --rules rules-demo.json --schema rules-schema.json --out report-demo.json
```

### What happens?
1. **Target Directory**: The tool scans `./src/demo`.
2. **Rules**: It uses `rules-demo.json`, which contains a set of expected design tokens and their corresponding CSS selectors (e.g., `.ds-btn--primary`).
3. **Validation**:
   - **HTML**: Checks for missing `lang` tags, missing `alt` text on images, and unlabeled inputs.
   - **SCSS/CSS**: Matches selectors defined in `rules-demo.json` against the styles in the demo folder to check for property mismatches or missing properties.
   - **RTL**: Scans for directional properties like `margin-left` and suggests logical equivalents like `margin-inline-start`.

## Understanding the Demo Rules (`rules-demo.json`)

The demo rules map specific components to selectors used in the demo SCSS/CSS files. For example:

```json
{
  "Component": "Primary Button",
  "Element": "Button",
  "Selector": ".ds-btn--primary",
  "State": "Default",
  "Property": "background-color",
  "Value": "var(--Surface-Brand, #2563eb)"
}
```

If `buttons.scss` defines `.ds-btn--primary` with `background-color: #ff0000`, the tool will report a `design-token-mismatch`.

## Expected Results

After running the demo, the `report-demo.json` (or your specified output path) will contain a list of issues. You can expect to see:

- **`accessibility`**: Errors for missing `lang` in HTML and warnings for inputs without labels.
- **`design-token-mismatch`**: Errors where the demo styles use colors or spacing that don't match the design tokens in `rules-demo.json`.
- **`rtl-directional-property`**: Warnings for properties like `padding-right` or `left` which should be converted for RTL support.
- **`missing-property`**: Errors if a rule expects a property (like `border-radius`) that isn't defined in the matched CSS selector.
