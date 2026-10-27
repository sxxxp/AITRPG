import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { parse } from 'yaml';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { validateScenarioSource, type ValidationIssue } from './scenario.validator.js';

// 시나리오 저장소 (BE-SCN-01~09, 17). DB 도입 전까지 파일로 저장한다.
//   <dir>/<id>/scenario.yaml      현재 버전 (1인 플레이의 ScenarioCatalog 가 같은 파일을 읽음)
//   <dir>/<id>/meta.json          버전, 공개 범위, 저장 기록
//   <dir>/<id>/.versions/<n>.yaml 이전 버전
//   <dir>/.trash/<id>-<시각>/      삭제된 시나리오 (소프트 삭제)
// TODO: 인증 도입 후 제작자 확인 및 사용자별 목록

export type Visibility = 'public' | 'unlisted' | 'private';

interface MetaFile {
  version: number;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  history: { version: number; savedAt: string; note: string }[];
}

export interface ScenarioRecord {
  id: string;
  title: string;
  author: string;
  version: number;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  valid: boolean;
  errorCount: number;
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_YAML_BYTES = 1024 * 1024;
const MAX_ZIP_ENTRIES = 50;

export class ScenarioStore {
  constructor(private readonly dir: string) {}

  private folder(id: string) {
    // 경로 조작 방지: ID 형식이 아니면 바로 404
    if (!ID_RE.test(id)) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
    return join(this.dir, id);
  }

  private yamlPath(id: string) {
    return join(this.folder(id), 'scenario.yaml');
  }

  private exists(id: string) {
    return existsSync(this.yamlPath(id));
  }

  private requireExists(id: string) {
    if (!this.exists(id)) throw new HttpError(404, 'SCENARIO_NOT_FOUND', '시나리오를 찾을 수 없습니다.');
  }

  private readMeta(id: string): MetaFile {
    const file = join(this.folder(id), 'meta.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as MetaFile;
    // meta.json 없이 직접 넣은 시나리오 (예: 저장소에 포함된 예제)
    const mtime = statSync(this.yamlPath(id)).mtime.toISOString();
    return { version: 1, visibility: 'public', createdAt: mtime, updatedAt: mtime, history: [] };
  }

  private writeAtomic(file: string, content: string) {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  }

  private writeMeta(id: string, meta: MetaFile) {
    this.writeAtomic(join(this.folder(id), 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }

  /** 검증 실패 시 422 + 오류 목록. 통과하면 meta.id 반환 */
  private validateOrThrow(source: string): string {
    if (Buffer.byteLength(source) > MAX_YAML_BYTES) throw new HttpError(413, 'TOO_LARGE', '시나리오는 1MB 이하여야 합니다.');
    const { valid, issues } = validateScenarioSource(source);
    if (!valid) {
      throw new HttpError(422, 'INVALID_SCENARIO', '시나리오 검증에 실패했습니다.', {
        issues: issues.filter((i) => i.severity === 'error'),
      });
    }
    return (parse(source) as { meta: { id: string } }).meta.id;
  }

  private summarize(id: string): ScenarioRecord {
    const source = readFileSync(this.yamlPath(id), 'utf8');
    const meta = this.readMeta(id);
    const { valid, issues } = validateScenarioSource(source);
    let title = id;
    let author = '';
    try {
      const doc = parse(source) as { meta?: { title?: unknown; author?: unknown } };
      if (typeof doc?.meta?.title === 'string') title = doc.meta.title;
      if (typeof doc?.meta?.author === 'string') author = doc.meta.author;
    } catch {
      // 깨진 YAML 이면 폴더 이름을 제목으로
    }
    return {
      id,
      title,
      author,
      version: meta.version,
      visibility: meta.visibility,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      valid,
      errorCount: issues.filter((i: ValidationIssue) => i.severity === 'error').length,
    };
  }

  list(): ScenarioRecord[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID_RE.test(e.name) && existsSync(join(this.dir, e.name, 'scenario.yaml')))
      .map((e) => this.summarize(e.name))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): ScenarioRecord {
    this.requireExists(id);
    return this.summarize(id);
  }

  getSource(id: string): { record: ScenarioRecord; source: string } {
    this.requireExists(id);
    return { record: this.summarize(id), source: readFileSync(this.yamlPath(id), 'utf8') };
  }

  create(source: string): ScenarioRecord {
    const id = this.validateOrThrow(source);
    if (this.exists(id)) {
      throw new HttpError(409, 'SCENARIO_ID_TAKEN', `이미 있는 시나리오 ID입니다: ${id}. meta.id 를 바꿔 주세요.`);
    }
    mkdirSync(this.folder(id), { recursive: true });
    const now = new Date().toISOString();
    this.writeAtomic(this.yamlPath(id), source);
    this.writeMeta(id, { version: 1, visibility: 'private', createdAt: now, updatedAt: now, history: [{ version: 1, savedAt: now, note: '생성' }] });
    return this.summarize(id);
  }

  /** 검증 통과 시 이전 버전을 보관하고 새 버전으로 저장 */
  update(id: string, source: string, note: string): ScenarioRecord {
    this.requireExists(id);
    const newId = this.validateOrThrow(source);
    if (newId !== id) {
      throw new HttpError(422, 'ID_CHANGED', `meta.id 는 바꿀 수 없습니다 (현재 ${id}). 새 ID로 만들려면 새 시나리오로 가져오세요.`);
    }
    const meta = this.readMeta(id);
    const versionsDir = join(this.folder(id), '.versions');
    mkdirSync(versionsDir, { recursive: true });
    writeFileSync(join(versionsDir, `${meta.version}.yaml`), readFileSync(this.yamlPath(id)));

    const now = new Date().toISOString();
    const version = meta.version + 1;
    this.writeAtomic(this.yamlPath(id), source);
    this.writeMeta(id, {
      ...meta,
      version,
      updatedAt: now,
      history: [...meta.history, { version, savedAt: now, note: note.trim().slice(0, 200) }],
    });
    return this.summarize(id);
  }

  remove(id: string) {
    this.requireExists(id);
    const trash = join(this.dir, '.trash');
    mkdirSync(trash, { recursive: true });
    renameSync(this.folder(id), join(trash, `${id}-${Date.now()}`));
  }

  setVisibility(id: string, visibility: Visibility): ScenarioRecord {
    this.requireExists(id);
    const meta = this.readMeta(id);
    this.writeMeta(id, { ...meta, visibility, updatedAt: new Date().toISOString() });
    return this.summarize(id);
  }

  /** .trpg = scenario.yaml 을 담은 zip */
  exportZip(id: string): Uint8Array {
    this.requireExists(id);
    return zipSync({ 'scenario.yaml': strToU8(readFileSync(this.yamlPath(id), 'utf8')) }, { level: 6 });
  }

  importZip(data: Uint8Array): ScenarioRecord {
    let entries = 0;
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(data, {
        // zip bomb 방지: 압축 해제 전 선언된 크기로 거른다
        filter: (f) => {
          entries++;
          if (entries > MAX_ZIP_ENTRIES) throw new HttpError(422, 'INVALID_PACKAGE', '파일이 너무 많은 패키지입니다.');
          if (f.name !== 'scenario.yaml') return false;
          if (f.originalSize > MAX_YAML_BYTES) throw new HttpError(413, 'TOO_LARGE', 'scenario.yaml 은 1MB 이하여야 합니다.');
          return true;
        },
      });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(422, 'INVALID_PACKAGE', '.trpg(zip) 파일을 읽을 수 없습니다.');
    }
    const yaml = files['scenario.yaml'];
    if (!yaml) throw new HttpError(422, 'INVALID_PACKAGE', '패키지 최상위에 scenario.yaml 이 없습니다.');
    if (yaml.length > MAX_YAML_BYTES) throw new HttpError(413, 'TOO_LARGE', 'scenario.yaml 은 1MB 이하여야 합니다.');
    return this.create(strFromU8(yaml));
  }
}
