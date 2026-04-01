import fs from 'fs/promises';
import * as cheerio from 'cheerio';
export async function validateHTML(filePath, rules) {
const content = await fs.readFile(filePath, 'utf8');
const $ = cheerio.load(content);
const issues = [];
if (!$('html').attr('lang')) {
  issues.push({ file: filePath, type: "accessibility", severity: "error", message: "<html> element missing lang attribute" });
}
$('img').each((i, img) => {
  if (!$(img).attr('alt')) {
    issues.push({ file: filePath, type: "accessibility", severity: "error", message: `Missing alt attribute on <img src='${$(img).attr('src')}'>` });
  }
});
const inputs = $('input').toArray().filter(el => {
  const t = ($(el).attr('type') || 'text').toLowerCase();
  return t !== 'hidden' && t !== 'submit' && t !== 'button' && t !== 'reset';
});
inputs.forEach((input) => {
  const id = $(input).attr('id');
  const hasLabel = id && $('label[for="' + id + '"]').length > 0;
  if (!$(input).attr('aria-label') && !$(input).attr('aria-labelledby') && !hasLabel) {
    issues.push({ file: filePath, type: "accessibility", severity: "warning", message: `Input missing associated label (id='${id || 'none'}')` });
  }
});
return issues;
}
