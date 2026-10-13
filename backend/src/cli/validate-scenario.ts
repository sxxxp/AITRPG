import { readFileSync } from 'node:fs';
import { validateScenarioSource } from '../modules/scenario/scenario.validator.js';

// 사용법: npm run validate:scenario -- <scenario.yaml> [...]
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('사용법: npm run validate:scenario -- <scenario.yaml> [...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const { valid, issues } = validateScenarioSource(readFileSync(file, 'utf8'));
  for (const issue of issues) {
    const location = issue.line ? `${file}:${issue.line}` : file;
    const label = issue.severity === 'error' ? '오류' : '경고';
    console.log(`${location}  [${label}] ${issue.path ? `${issue.path} — ` : ''}${issue.message}`);
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  console.log(`${file}: ${valid ? '통과' : '실패'} (오류 ${errors}, 경고 ${issues.length - errors})`);
  if (!valid) failed = true;
}
process.exit(failed ? 1 : 0);
