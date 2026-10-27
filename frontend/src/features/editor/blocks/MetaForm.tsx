import { useState } from 'react';

type Obj = Record<string, any>;

interface Props {
  scenario: Obj;
  /** 새 시나리오일 때만 ID 편집 가능 (저장 후 변경 불가) */
  canEditId: boolean;
  onChange: (next: Obj) => void;
}

const RATINGS = ['전체', '12세', '15세', '18세'];
const LENGTHS: [string, string][] = [
  ['short', '짧게'],
  ['medium', '보통'],
  ['long', '길게'],
];

// 블록 모드의 기본 정보 (meta, ai_guide, variables). 룰셋·프리셋·상태이상은 코드 탭에서 편집
export function MetaForm({ scenario, canEditId, onChange }: Props) {
  const meta: Obj = scenario.meta ?? {};
  const guide: Obj = scenario.ai_guide ?? {};
  const [vars, setVars] = useState<[string, number][]>(Object.entries(scenario.variables ?? {}) as [string, number][]);

  const setMeta = (patch: Obj) => onChange({ ...scenario, meta: { ...meta, ...patch } });
  const setGuide = (patch: Obj) => onChange({ ...scenario, ai_guide: { ...guide, ...patch } });
  const commitVars = (next: [string, number][]) => {
    setVars(next);
    const valid = next.filter(([k]) => /^[a-z][a-z0-9_]*$/.test(k));
    onChange({ ...scenario, variables: Object.fromEntries(valid) });
  };

  return (
    <details className="card meta-form" open={canEditId}>
      <summary>기본 정보 · AI 서술 · 변수</summary>
      <div className="meta-grid">
        {canEditId && (
          <label className="field">
            <span className="label">시나리오 ID (영문 소문자-하이픈, 저장 후 변경 불가)</span>
            <input value={meta.id ?? ''} onChange={(e) => setMeta({ id: e.target.value.toLowerCase() })} />
          </label>
        )}
        <label className="field">
          <span className="label">제목</span>
          <input value={meta.title ?? ''} onChange={(e) => setMeta({ title: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">작성자</span>
          <input value={meta.author ?? ''} onChange={(e) => setMeta({ author: e.target.value })} />
        </label>
        <label className="field meta-wide">
          <span className="label">소개</span>
          <textarea rows={2} value={meta.summary ?? ''} onChange={(e) => setMeta({ summary: e.target.value })} />
        </label>
        <div className="field">
          <span className="label">인원</span>
          <div className="row">
            <input
              type="number"
              min={1}
              aria-label="최소 인원"
              value={meta.players?.min ?? 1}
              onChange={(e) => setMeta({ players: { ...meta.players, min: Number(e.target.value) } })}
            />
            ~
            <input
              type="number"
              min={1}
              aria-label="최대 인원"
              value={meta.players?.max ?? 4}
              onChange={(e) => setMeta({ players: { ...meta.players, max: Number(e.target.value) } })}
            />
          </div>
        </div>
        <label className="field">
          <span className="label">예상 시간 (분)</span>
          <input type="number" min={1} value={meta.estimated_minutes ?? 30} onChange={(e) => setMeta({ estimated_minutes: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span className="label">등급</span>
          <select value={meta.rating ?? '전체'} onChange={(e) => setMeta({ rating: e.target.value })}>
            {RATINGS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">태그 (쉼표로 구분)</span>
          <input
            value={(meta.tags ?? []).join(', ')}
            onChange={(e) => setMeta({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          />
        </label>
        <label className="field">
          <span className="label">AI 서술 분위기</span>
          <input value={guide.tone ?? ''} onChange={(e) => setGuide({ tone: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">서술 길이</span>
          <select value={guide.narration_length ?? 'short'} onChange={(e) => setGuide({ narration_length: e.target.value })}>
            {LENGTHS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field meta-wide">
          <span className="label">세계관 (AI 에게 전달)</span>
          <textarea rows={3} value={guide.world_lore ?? ''} onChange={(e) => setGuide({ world_lore: e.target.value })} />
        </label>
        <fieldset className="field meta-wide">
          <legend className="label">변수 (영문 소문자 snake_case · 초기값)</legend>
          {vars.map(([name, value], i) => (
            <div key={i} className="row">
              <input
                aria-label="변수 이름"
                value={name}
                onChange={(e) => commitVars(vars.map((v, j) => (j === i ? [e.target.value.toLowerCase(), v[1]] : v)))}
              />
              <input
                type="number"
                aria-label="초기값"
                value={value}
                onChange={(e) => commitVars(vars.map((v, j) => (j === i ? [v[0], Number(e.target.value)] : v)))}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => commitVars(vars.filter((_, j) => j !== i))}>
                삭제
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVars([...vars, ['', 0]])}>
              변수 추가
            </button>
          </div>
        </fieldset>
        <p className="field-hint meta-wide">스탯·자원·판정 규칙, 프리셋 캐릭터, 상태이상은 코드 탭에서 편집합니다.</p>
      </div>
    </details>
  );
}
