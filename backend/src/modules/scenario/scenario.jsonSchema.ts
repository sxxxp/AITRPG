import { zodToJsonSchema } from 'zod-to-json-schema';
import { scenarioSchema } from './scenario.schema.js';

// BE-SCN-11: 에디터 자동완성/툴팁용 JSON Schema. Zod 스키마에서 생성하므로 항상 같은 규칙을 따른다.
let cached: object | null = null;

export function scenarioJsonSchema(): object {
  cached ??= zodToJsonSchema(scenarioSchema, { name: 'Scenario', target: 'jsonSchema7' });
  return cached;
}
