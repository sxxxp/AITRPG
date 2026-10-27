import { useState } from 'react';
import type { DebugPatch, GameView } from '../types';

interface Props {
  view: GameView;
  disabled: boolean;
  onPatch: (patch: DebugPatch) => void;
}

// FE-EDT-12: 테스트 플레이 디버그 패널 (주사위 고정, 순간이동, 아이템, HP, 플래그, 변수)
export function DebugPanel({ view, disabled, onPatch }: Props) {
  const d = view.debug;
  const [sceneId, setSceneId] = useState(view.scene.id);
  const [itemId, setItemId] = useState(d.items[0]?.id ?? '');
  const [hp, setHp] = useState(String(view.character.hp));
  const varNames = Object.keys(d.vars);

  return (
    <details className="card debug-panel">
      <summary>테스트 도구</summary>
      <div className="stack-sm debug-panel__body">
        <label className="field">
          <span className="label">주사위 고정 (d20)</span>
          <select
            value={d.fixedRoll ?? ''}
            disabled={disabled}
            onChange={(e) => onPatch({ fixedRoll: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">무작위</option>
            <option value="20">20 (대성공)</option>
            <option value="15">15</option>
            <option value="10">10</option>
            <option value="5">5</option>
            <option value="1">1 (대실패)</option>
          </select>
        </label>

        <div className="field">
          <span className="label">순간이동</span>
          <div className="row debug-row">
            <select value={sceneId} aria-label="이동할 장면" onChange={(e) => setSceneId(e.target.value)}>
              {d.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => onPatch({ sceneId })}>
              이동
            </button>
          </div>
          <span className="field-hint">진입 시 효과(전투 등)는 실행하지 않습니다.</span>
        </div>

        <div className="field">
          <span className="label">아이템 지급</span>
          <div className="row debug-row">
            <select value={itemId} aria-label="지급할 아이템" onChange={(e) => setItemId(e.target.value)}>
              {d.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || !itemId} onClick={() => onPatch({ giveItem: itemId })}>
              지급
            </button>
          </div>
        </div>

        <div className="field">
          <span className="label">HP</span>
          <div className="row debug-row">
            <input type="number" value={hp} aria-label="HP 값" onChange={(e) => setHp(e.target.value)} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled || hp === '' || !Number.isInteger(Number(hp))}
              onClick={() => onPatch({ hp: Number(hp) })}
            >
              적용
            </button>
          </div>
        </div>

        {varNames.length > 0 && (
          <fieldset className="field">
            <legend className="label">변수</legend>
            {varNames.map((name) => (
              <label key={name} className="row debug-row">
                <code className="debug-key">{name}</code>
                <input
                  type="number"
                  defaultValue={d.vars[name]}
                  key={`${name}-${d.vars[name]}`}
                  disabled={disabled}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isInteger(v) && v !== d.vars[name]) onPatch({ vars: { [name]: v } });
                  }}
                />
              </label>
            ))}
          </fieldset>
        )}

        {d.knownFlags.length > 0 && (
          <fieldset className="field">
            <legend className="label">플래그</legend>
            <div className="flag-list">
              {d.knownFlags.map((flag) => (
                <label key={flag} className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!d.flags[flag]}
                    disabled={disabled}
                    onChange={(e) => onPatch({ flags: { [flag]: e.target.checked } })}
                  />
                  <code>{flag}</code>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </details>
  );
}
