import fs from 'fs/promises';
import XLSX from 'xlsx';

const STATES = [
  { col: 3, name: 'Default' },
  { col: 4, name: 'Hover' },
  { col: 5, name: 'Active' },
  { col: 6, name: 'Disabled' },
  { col: 7, name: 'Error' },
];

function clean(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\xa0/g, ' ').trim();
}

function isSkippable(val) {
  const v = clean(val);
  if (v === '' || v === '--') return true;
  // Skip plain English notes (multi-word, no CSS characters)
  if (v.includes(' ') && /^[a-zA-Z ]+$/.test(v)) return true;
  return false;
}

async function convertTokens(excelPath, outputPath) {
  if (!excelPath || !outputPath) {
    console.error('Usage: node scripts/convert-tokens.js <excelPath> <outputPath>');
    process.exit(1);
  }

  const workbook = XLSX.readFile(excelPath);
  const worksheet = workbook.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const rules = [];
  let currentComponent = '';
  let currentElement = '';

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    if (row[0] && clean(row[0]) !== '') currentComponent = clean(row[0]);
    if (row[1] && clean(row[1]) !== '') currentElement = clean(row[1]);

    const property = clean(row[2]);
    if (isSkippable(property)) continue;

    for (const state of STATES) {
      const value = row[state.col];
      if (isSkippable(value)) continue;

      const cleanedValue = clean(value);
      rules.push({
        Component: currentComponent,
        Element: currentElement,
        Selector: '',
        State: state.name,
        Property: property,
        Value: cleanedValue,
      });
    }
  }

  await fs.writeFile(outputPath, JSON.stringify(rules, null, 2), 'utf8');
  console.log(`Exported ${rules.length} rules to ${outputPath}`);
}

convertTokens(process.argv[2], process.argv[3]);
