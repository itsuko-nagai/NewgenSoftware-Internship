import { program } from 'commander';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import Ajv from 'ajv';
import { validateHTML } from '../src/validators/htmlValidator.js'
import { validateSCSS } from '../src/validators/scssValidator.js'
import { validateRTL } from '../src/validators/rtlValidator.js'

// ─── AUTO-DETECT CENTRAL STYLES FOLDER ──────────────────────────────
async function resolveCSSFiles(target, targetIsFile) {
  const scanBase = targetIsFile ? path.dirname(path.resolve(target)) : path.resolve(target);

  // Look for styles/ subfolder in target dir or parent dirs
  const stylesDirCandidates = [
    path.join(scanBase, 'styles'),
    path.join(scanBase, 'css'),
    path.join(scanBase, 'scss'),
    path.join(path.dirname(scanBase), 'styles'),
  ];

  for (const candidate of stylesDirCandidates) {
    try {
      await fs.stat(candidate);
      const cssFiles = glob.sync('**/*.{css,scss}', {
        cwd: candidate,
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      if (cssFiles.length > 0) {
        console.log(`\n Auto-detected styles folder: ${candidate}`);
        console.log(`   Found ${cssFiles.length} CSS file(s):`);
        cssFiles.forEach(f => console.log(`   → ${path.basename(f)}`));
        return cssFiles;
      }
    } catch {
      // folder doesn't exist, try next
    }
  }

  // Fallback — scan all CSS in target dir
  const fallback = glob.sync('**/*.{css,scss}', {
    cwd: scanBase,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**']
  });
  console.log(`\n No styles/ folder found — scanning ${fallback.length} CSS file(s) in target`);
  return fallback;
}

// ─── DETECT IF TARGET IS FILE OR DIR ────────────────────────────────
async function isFile(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
}

program
  .command('scan <target>')
  .description('Scan a directory or single HTML file. CSS is auto-detected from styles/ folder.')
  .requiredOption('--rules <rulesPath>', 'Path to rules JSON file.')
  .option('--stylesheet <path>', 'Manually specify central stylesheet or folder (overrides auto-detection).')
  .option('--schema <schemaPath>', 'Path to schema JSON file (for AJV validation).')
  .option('--state-map <stateMapPath>', 'Path to state mapping config.', './state-map.json')
  .option('--out <outputPath>', 'Output path for results.', './results.json')
  .action(async (target, { rules, stylesheet, schema, stateMap, out }) => {

    const absTarget = path.resolve(target);
    const targetIsFile = await isFile(absTarget);

    console.log(`\n design-audit`);
    console.log(`Target: ${absTarget} (${targetIsFile ? 'single file' : 'directory'})`);

    // 1. Load rules
    const rulesContent = await fs.readFile(rules, 'utf8');
    const parsedRules = JSON.parse(rulesContent);
    console.log(`Rules loaded: ${parsedRules.length} rule(s)`);

    // 2. Optional schema validation
    if (schema) {
      const schemaContent = await fs.readFile(schema, 'utf8');
      const ajvInstance = new Ajv();
      const validateSchema = ajvInstance.compile(JSON.parse(schemaContent));
      if (!validateSchema(parsedRules)) {
        console.error('Validation errors:', ajvInstance.errorsText(validateSchema.errors));
        process.exit(1);
      }
    }

    // 3. Resolve CSS files
    let cssFiles = [];
    if (stylesheet) {
      // Manual override
      const absStylesheet = path.resolve(stylesheet);
      try {
        const stat = await fs.stat(absStylesheet);
        if (stat.isDirectory()) {
          cssFiles = glob.sync('**/*.{css,scss}', { cwd: absStylesheet, absolute: true });
          console.log(`\n Manual stylesheet folder: ${absStylesheet} (${cssFiles.length} file(s))`);
        } else {
          cssFiles = [absStylesheet];
          console.log(`\n Manual stylesheet: ${absStylesheet}`);
        }
      } catch {
        console.error(` Stylesheet not found: ${absStylesheet}`);
        process.exit(1);
      }
    } else {
      cssFiles = await resolveCSSFiles(absTarget, targetIsFile);
    }

    // 4. Discover HTML files to scan
    let htmlFiles = [];
    if (targetIsFile) {
      if (absTarget.endsWith('.html')) {
        htmlFiles = [absTarget];
        console.log(`\n Single-file mode: ${path.basename(absTarget)}`);
      } else {
        console.error(` Single file must be .html`);
        process.exit(1);
      }
    } else {
      htmlFiles = glob.sync('**/*.html', {
        cwd: absTarget,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/styles/**']
      });
      console.log(`\n Found ${htmlFiles.length} HTML file(s)`);
    }

    const issues = [];
    const allActiveSelectors = [];

    // 5. PHASE 1 — HTML first
    console.log('\n--- Phase 1: Scanning HTML files ---');
    for (const file of htmlFiles) {
      console.log(` HTML: ${path.relative(process.cwd(), file)}`);
      const result = await validateHTML(file, parsedRules);
      issues.push(...result.issues);
      allActiveSelectors.push(...result.activeSelectors);
    }

    // Deduplicate active selectors
    const mergedSelectors = new Map();
    for (const entry of allActiveSelectors) {
      if (mergedSelectors.has(entry.selector)) {
        const existing = mergedSelectors.get(entry.selector);
        existing.count += entry.count;
        entry.elementIds.forEach(id => {
          if (!existing.elementIds.includes(id)) existing.elementIds.push(id);
        });
      } else {
        mergedSelectors.set(entry.selector, { ...entry });
      }
    }
    const activeSelectorsManifest = [...mergedSelectors.values()];

    console.log(`\n Active selectors found: ${activeSelectorsManifest.length}`);
    activeSelectorsManifest.forEach(s => {
      console.log(`   ${s.selector} — used ${s.count}x${s.elementIds.length ? ' [' + s.elementIds.join(', ') + ']' : ''}`);
    });

    // 6. PHASE 2 — CSS validation against central styles
    console.log('\n--- Phase 2: Validating CSS ---');
    for (const file of cssFiles) {
      console.log(` CSS: ${path.relative(process.cwd(), file)}`);
      const scssIssues = await validateSCSS(file, parsedRules, activeSelectorsManifest, stateMap);
      const rtlIssues = await validateRTL(file);
      issues.push(...scssIssues, ...rtlIssues);
    }

    // 7. Sort deterministically
    const sorted = issues.sort((a, b) => {
      if ((a.file || '') !== (b.file || '')) return (a.file || '').localeCompare(b.file || '');
      if ((a.type || '') !== (b.type || '')) return (a.type || '').localeCompare(b.type || '');
      if ((a.property || '') !== (b.property || '')) return (a.property || '').localeCompare(b.property || '');
      return (a.message || '').localeCompare(b.message || '');
    });

    // 8. Build summary
    const summary = {};
    for (const issue of sorted) {
      summary[issue.type] = (summary[issue.type] || 0) + 1;
    }

    // 9. Build report
    const result = {
      meta: {
        generatedAt: new Date().toISOString(),
        target: absTarget,
        mode: targetIsFile ? 'single-file' : 'directory',
        stylesFolder: cssFiles.map(f => path.relative(process.cwd(), f)).join(', '),
        totalHTMLFiles: htmlFiles.length,
        totalCSSFiles: cssFiles.length,
        totalIssues: sorted.length,
        activeSelectorsFound: activeSelectorsManifest.length,
        summary
      },
      activeSelectors: activeSelectorsManifest,
      issues: sorted
    };

    // 10. Write output
    await fs.writeFile(out, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n Report written to ${out}`);
    console.log(` Total issues: ${sorted.length}`);
    if (Object.keys(summary).length) {
      console.log('   ' + Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(', '));
    }

    if (sorted.length > 0) process.exit(1);
  });

program.parse(process.argv);
