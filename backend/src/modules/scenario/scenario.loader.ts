import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

interface CatalogEntry {
  mtimeMs: number;
  /** 마지막으로 검증을 통과한 내용 (수정 중 깨진 파일이면 이전 정상본 유지) */
  scenario: Scenario | null;
  error: string | null;
}

/**
 * <dir>/<폴더>/scenario.yaml 목록. 조회할 때마다 파일 수정 시각을 비교해 바뀐 파일만 다시 읽으므로
 * 서버를 재시작하지 않아도 시나리오 수정이 반영된다. (이미 시작한 게임은 시작 시점 내용을 유지)
 */
export class ScenarioCatalog {
  private readonly entries = new Map<string, CatalogEntry>();

  constructor(private readonly dir: string) {}

  private files(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(this.dir, e.name, 'scenario.yaml'))
      .filter((f) => existsSync(f));
  }

  private refresh() {
    const files = this.files();
    for (const file of files) {
      const mtimeMs = statSync(file).mtimeMs;
      const cached = this.entries.get(file);
      if (cached && cached.mtimeMs === mtimeMs) continue;
      try {
        const scenario = loadScenarioFile(file);
        this.entries.set(file, { mtimeMs, scenario, error: null });
        if (cached) console.info(`[scenario] 변경 반영: ${file}`);
      } catch (e) {
        const error = (e as Error).message;
        this.entries.set(file, { mtimeMs, scenario: cached?.scenario ?? null, error });
        console.warn(`[scenario] ${file}: ${error}${cached?.scenario ? ' — 마지막 정상 버전을 계속 사용' : ''}`);
      }
    }
    for (const file of this.entries.keys()) if (!files.includes(file)) this.entries.delete(file);
  }

  all(): Map<string, Scenario> {
    this.refresh();
    const result = new Map<string, Scenario>();
    for (const { scenario } of this.entries.values()) if (scenario) result.set(scenario.meta.id, scenario);
    return result;
  }

  /** 검증에 실패한 파일 (수정 중 오류 확인용) */
  errors(): { file: string; message: string }[] {
    return [...this.entries.entries()].filter(([, e]) => e.error).map(([file, e]) => ({ file, message: e.error! }));
  }
}
