import { useState } from 'react';
import type { GameView } from '../types';

const GROUP_ORDER = ['전투', '행동', '조사', '대화', '아이템', '이동'];

interface Props {
  actions: GameView['actions'];
  busy: boolean;
  aiAvailable: boolean;
  onAction: (actionId: string) => void;
  onText: (text: string) => void;
}

export function ActionPanel({ actions, busy, aiAvailable, onAction, onText }: Props) {
  const [text, setText] = useState('');
  const groups = GROUP_ORDER.map((g) => ({ group: g, items: actions.filter((a) => a.group === g) })).filter((g) => g.items.length > 0);

  return (
    <div className="action-panel">
      <form
        className="action-panel__input"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value || busy) return;
          onText(value);
          setText('');
        }}
      >
        <label htmlFor="play-input" className="sr-only">
          행동 입력
        </label>
        <input
          id="play-input"
          value={text}
          maxLength={300}
          placeholder={aiAvailable ? '무엇을 할까요? 예: 교탁 앞에서 박수 두 번 치고 공중제비를 돈다' : 'AI가 꺼져 있어 아래 버튼으로만 진행할 수 있습니다'}
          disabled={busy || !aiAvailable}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !aiAvailable || !text.trim()}>
          {busy ? '진행 중…' : '행동'}
        </button>
      </form>
      {busy && <p className="muted small">출력 중에는 기록 영역을 클릭하면 바로 표시됩니다.</p>}

      {groups.map(({ group, items }) => (
        <div key={group} className="action-group">
          <span className="action-group__label">{group}</span>
          <div className="action-group__buttons">
            {items.map((a) => (
              <button key={a.id} type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
