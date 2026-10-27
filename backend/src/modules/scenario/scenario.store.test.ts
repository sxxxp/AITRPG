import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { HttpError } from '../../common/middlewares/errorHandler.js';
import { scenarioJsonSchema } from './scenario.jsonSchema.js';
import { ScenarioStore } from './scenario.store.js';

const NEO = readFileSync(new URL('../../../../scenarios/neo-dimigo/scenario.yaml', import.meta.url), 'utf8');

const httpError = (status: number, code?: string) => (e: unknown) =>
  e instanceof HttpError && e.status === status && (code === undefined || e.code === code);

describe('ScenarioStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wtg-store-'));
  const store = new ScenarioStore(dir);
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('생성 → 목록 → 원문 조회', () => {
    const created = store.create(NEO);
    assert.equal(created.id, 'neo-dimigo');
    assert.equal(created.version, 1);
    assert.equal(created.visibility, 'private');
    assert.equal(created.valid, true);
    assert.deepEqual(store.list().map((r) => r.id), ['neo-dimigo']);
    assert.equal(store.getSource('neo-dimigo').source, NEO);
  });

  it('같은 ID 로 다시 만들면 409', () => {
    assert.throws(() => store.create(NEO), httpError(409, 'SCENARIO_ID_TAKEN'));
  });

  it('수정하면 이전 버전을 보관하고 버전을 올린다', () => {
    const next = NEO.replace('title: 네오 디미고', 'title: 네오 디미고 v2');
    const updated = store.update('neo-dimigo', next, '제목 변경');
    assert.equal(updated.version, 2);
    assert.equal(updated.title, '네오 디미고 v2');
    assert.equal(readFileSync(join(dir, 'neo-dimigo', '.versions', '1.yaml'), 'utf8'), NEO);
    const meta = JSON.parse(readFileSync(join(dir, 'neo-dimigo', 'meta.json'), 'utf8'));
    assert.deepEqual(meta.history.map((h: { note: string }) => h.note), ['생성', '제목 변경']);
  });

  it('검증 실패와 meta.id 변경은 저장하지 않는다', () => {
    const before = store.getSource('neo-dimigo').source;
    assert.throws(
      () => store.update('neo-dimigo', NEO.replace('to: stairs_2', 'to: nowhere'), ''),
      (e: unknown) => httpError(422, 'INVALID_SCENARIO')(e) && Array.isArray((e as HttpError).details && (e as { details: { issues: unknown[] } }).details.issues),
    );
    assert.throws(() => store.update('neo-dimigo', NEO.replace('id: neo-dimigo', 'id: neo-other'), ''), httpError(422, 'ID_CHANGED'));
    assert.equal(store.getSource('neo-dimigo').source, before);
  });

  it('공개 범위를 바꾼다', () => {
    assert.equal(store.setVisibility('neo-dimigo', 'public').visibility, 'public');
  });

  it('내보낸 .trpg 를 다른 ID 로 가져올 수 있고, 같은 ID 면 409', () => {
    const zip = store.exportZip('neo-dimigo');
    assert.throws(() => store.importZip(zip), httpError(409));
    const other = NEO.replace('id: neo-dimigo', 'id: neo-copy');
    const imported = store.importZip(zipSync({ 'scenario.yaml': strToU8(other) }));
    assert.equal(imported.id, 'neo-copy');
  });

  it('잘못된 패키지는 거부한다', () => {
    assert.throws(() => store.importZip(strToU8('zip 아님')), httpError(422, 'INVALID_PACKAGE'));
    assert.throws(() => store.importZip(zipSync({ 'readme.txt': strToU8('x') })), httpError(422, 'INVALID_PACKAGE'));
  });

  it('삭제는 .trash 로 옮긴다', () => {
    store.remove('neo-copy');
    assert.ok(!existsSync(join(dir, 'neo-copy')));
    assert.ok(readdirSync(join(dir, '.trash')).some((n) => n.startsWith('neo-copy-')));
    assert.deepEqual(store.list().map((r) => r.id), ['neo-dimigo']);
  });

  it('경로 조작 ID 는 404', () => {
    assert.throws(() => store.getSource('../secret'), httpError(404));
    assert.throws(() => store.remove('..'), httpError(404));
  });
});

describe('시나리오 JSON Schema', () => {
  it('Zod 스키마에서 생성되며 새 필드도 포함한다', () => {
    const json = JSON.stringify(scenarioJsonSchema());
    for (const key of ['format_version', 'start_scene', 'critical_failure', 'add_stat', 'combat']) {
      assert.ok(json.includes(key), `${key} 누락`);
    }
  });
});
