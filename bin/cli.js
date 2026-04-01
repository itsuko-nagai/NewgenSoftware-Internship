import { program } from 'commander';
import fs from 'fs/promises';
import { glob } from 'glob';
import Ajv from 'ajv';
import { validateHTML } from '../src/validators/htmlValidator.js'
import { validateSCSS } from '../src/validators/scssValidator.js'
import { validateRTL } from '../src/validators/rtlValidator.js'

program
.command('scan <targetDir>')
.description('Scan directory for validation issues.')
.requiredOption('--rules <rulesPath>', 'Path to rules JSON file.')
.option('--schema <schemaPath>', 'Path to schema JSON file (for AJV validation).')
.option('--out <outputPath>', 'Output path for results', './results.json')
.action(async (targetDir, { rules, schema, out }) => {

  const rulesContent = await fs.readFile(rules, 'utf8');

  if (schema) {
    const schemaContent = await fs.readFile(schema, 'utf8');
    const ajvInstance = new Ajv();
    const validateSchema = ajvInstance.compile(JSON.parse(schemaContent));
    if (!validateSchema(JSON.parse(rulesContent))) {
      console.error('Validation errors:', ajvInstance.errorsText(validateSchema.errors));
      process.exit(1);
    }
  }

  const filesToScan = glob.sync(`${targetDir}/**/*.{html,scss,css}`, { ignore: `${targetDir}/node_modules/**,${targetDir}/dist/**` });
  const issues = [];

  for (const file of filesToScan) {
    if (file.endsWith('.html')) {
      issues.push(...await validateHTML(file, JSON.parse(rulesContent)));
    } else if (file.endsWith('.scss') || file.endsWith('.css')) {
      issues.push(...await validateSCSS(file, JSON.parse(rulesContent)));
      issues.push(...await validateRTL(file));
    }
  }

  const summary = {};
  for (const issue of issues) {
    if (!summary[issue.type]) summary[issue.type] = 0;
    summary[issue.type]++;
  }

  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalFiles: filesToScan.length,
      totalIssues: issues.length,
      summary
    },
    issues: issues.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.property !== b.property) return (a.property||'').localeCompare(b.property||'');
      return (a.message||'').localeCompare(b.message||'');
    })
  };

  await fs.writeFile(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Results written to ${out}`);

  if (issues.length > 0) process.exit(1);
});

program.parse(process.argv);
