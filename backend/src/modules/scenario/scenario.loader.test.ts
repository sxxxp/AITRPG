import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { ScenarioCatalog } from './scenario.loader.js';

const NEO = new URL('../../../../scenarios/neo-dimigo/scenario.yaml', import.meta.url);

describe('ScenarioCatalog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wtg-scenarios-'));
  const file = join(dir, 'neo', 'scenario.yaml');
  mkdirSync(join(dir, 'neo'));
  const original = readFileSync(NEO, 'utf8');
  let clock = Date.now() / 1000;
  /** 같은 초에 여러 번 써도 수정 시각이 바뀌도록 */
  const write = (content: string) => {
    writeFileSync(file, content);
    clock += 10;
    utimesSync(file, clock, clock);
  };

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('서버 재시작 없이 파일 수정을 반영하고, 깨진 파일은 마지막 정상본을 유지한다', () => {
    write(original);
    const catalog = new ScenarioCatalog(dir);
    assert.equal(catalog.all().get('neo-dimigo')?.meta.title, '네오 디미고');

    write(original.replace('title: 네오 디미고', 'title: 네오 디미고 개정판'));
    assert.equal(catalog.all().get('neo-dimigo')?.meta.title, '네오 디미고 개정판');

    write(original.replace('to: stairs_2', 'to: stairs_99')); // 참조 오류
    assert.equal(catalog.all().get('neo-dimigo')?.meta.title, '네오 디미고 개정판', '이전 정상본 유지');
    assert.match(catalog.errors()[0].message, /stairs_99/);

    write(original);
    assert.equal(catalog.all().get('neo-dimigo')?.meta.title, '네오 디미고');
    assert.deepEqual(catalog.errors(), []);
  });
});
