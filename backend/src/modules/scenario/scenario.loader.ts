import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { scenarioSchema, type Scenario } from './scenario.schema.js';
import { validateScenarioSource } from './scenario.validator.js';

/** YAML 원문 → 검증된 Scenario. 오류가 있으면 첫 오류 메시지로 예외 */
export function parseScenario(source: string): Scenario {
  const { valid, issues } = validateScenarioSource(source);
  if (!valid) {
    const first = issues.find((i) => i.severity === 'error')!;
    throw new Error(`시나리오 검증 실패 (${first.line ?? '?'}행 ${first.path}): ${first.message}`);
  }
  return scenarioSchema.parse(parse(source));
}

export function loadScenarioFile(path: string): Scenario {
  return parseScenario(readFileSync(path, 'utf8'));
}

/** <dir>/<폴더>/scenario.yaml 을 모두 읽는다 */
export function loadScenarioDir(dir: string): Map<string, Scenario> {
  const result = new Map<string, Scenario>();
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name, 'scenario.yaml');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const scenario = loadScenarioFile(file);
    result.set(scenario.meta.id, scenario);
  }
  return result;
}
