import fs from 'fs/promises';
import * as cheerio from 'cheerio';

export async function validateHTML(filePath, rules) {
  const issues = [];
  const activeSelectors = [];

  let content;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    return {
      issues: [{ file: filePath, type: 'error', message: `Could not read file: ${err.message}` }],
      activeSelectors: []
    };
  }

  const $ = cheerio.load(content);

  // ─── ACCESSIBILITY CHECKS ───────────────────────────────────────────

  // CHECK 1 — Missing lang attribute
  if (!$('html').attr('lang')) {
    issues.push({
      file: filePath,
      type: 'accessibility',
      severity: 'error',
      message: '<html> element missing lang attribute'
    });
  }

  // CHECK 2 — Images missing alt
  $('img').each((i, img) => {
    if (!$(img).attr('alt')) {
      issues.push({
        file: filePath,
        type: 'accessibility',
        severity: 'error',
        message: `Missing alt attribute on <img src='${$(img).attr('src') || ''}'>`
      });
    }
  });

  // CHECK 3 — Inputs missing labels
  const inputs = $('input').toArray().filter(el => {
    const t = ($(el).attr('type') || 'text').toLowerCase();
    return t !== 'hidden' && t !== 'submit' && t !== 'button' && t !== 'reset';
  });

  inputs.forEach(input => {
    const id = $(input).attr('id');
    const hasLabel = id && $(`label[for="${id}"]`).length > 0;
    if (!$(input).attr('aria-label') && !$(input).attr('aria-labelledby') && !hasLabel) {
      issues.push({
        file: filePath,
        type: 'accessibility',
        severity: 'warning',
        message: `Input missing associated label (id='${id || 'none'}')`
      });
    }
  });

  // ─── CLASS/ID EXTRACTION & SCOUTING ────────────────────────────────

  // Build set of known selectors from rules for typo detection
  const knownSelectors = new Set(
    rules
      .map(r => r.Selector)
      .filter(s => s && s.trim() !== '')
      .map(s => s.trim())
  );

  // Track selectors we've already added to avoid duplicates
  const seenSelectors = new Map();

  // Walk every element in the HTML
  $('*').each((i, el) => {
    const classes = $(el).attr('class') || '';
    const id = $(el).attr('id') || null;
    const elementId = id ? `#${id}` : null;

    // Process each class
    classes.split(/\s+/).filter(Boolean).forEach(cls => {
      const selector = `.${cls}`;

      // CHECK — ds- prefix typo detection
      if (cls.startsWith('ds-') && !knownSelectors.has(selector)) {
        // Check if it's close to a known selector (potential typo)
        const isTypo = [...knownSelectors].some(known => {
          // Known starts with ds- and is similar length
          return known.startsWith('.ds-') &&
            Math.abs(known.length - selector.length) <= 3;
        });

        if (isTypo || !knownSelectors.has(selector)) {
          // Only flag if not already a known selector
          if (!knownSelectors.has(selector)) {
            issues.push({
              file: filePath,
              type: 'invalid-design-class',
              severity: 'warning',
              found: cls,
              selector,
              elementId,
              message: `"${cls}" starts with ds- but is not a known design system class${elementId ? ` (on element ${elementId})` : ''}`
            });
          }
        }
      }

      // Add to active selectors manifest
      if (knownSelectors.has(selector)) {
        if (seenSelectors.has(selector)) {
          seenSelectors.get(selector).count++;
          if (elementId && !seenSelectors.get(selector).elementIds.includes(elementId)) {
            seenSelectors.get(selector).elementIds.push(elementId);
          }
        } else {
          seenSelectors.set(selector, {
            selector,
            elementIds: elementId ? [elementId] : [],
            count: 1,
            file: filePath
          });
        }
      }
    });
  });

  // Convert map to array
  for (const [, val] of seenSelectors) {
    activeSelectors.push(val);
  }

  return { issues, activeSelectors };
}
