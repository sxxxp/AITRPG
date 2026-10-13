import { useEffect, useRef } from 'react';
import type { FeedEntry } from '../types';

interface Props {
  entries: FeedEntry[];
  streaming: { id: string; text: string } | null;
}

function Entry({ entry }: { entry: FeedEntry }) {
  switch (entry.type) {
    case 'player':
      return <p className="feed__player">▶ {entry.text}</p>;
    case 'system':
      return <p className="feed__system">{entry.text}</p>;
    case 'fixed':
      return <blockquote className="feed__fixed">{entry.text}</blockquote>;
    case 'check': {
      const result = entry.critical === 'success' ? '대성공' : entry.critical === 'failure' ? '대실패' : entry.success ? '성공' : '실패';
      return (
        <p className={`feed__check ${entry.success ? 'is-success' : 'is-failure'}`}>
          🎲 {entry.text} — {entry.roll} {entry.bonus >= 0 ? '+' : '−'} {Math.abs(entry.bonus)} = <strong>{entry.total}</strong> (목표 {entry.dc}){' '}
          <strong>{result}</strong>
        </p>
      );
    }
    case 'narration':
      return <p className="feed__narration">{entry.text}</p>;
    case 'ending':
      return (
        <div className="feed__ending">
          <p className="muted small">엔딩</p>
          <h2>{entry.title}</h2>
          <p>{entry.text}</p>
        </div>
      );
  }
}

export function Feed({ entries, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length, streaming?.text]);

  return (
    <div className="feed" aria-live="polite">
      {entries.map((e) => (
        <Entry key={e.id} entry={e} />
      ))}
      {streaming && (
        <p className="feed__narration is-streaming">
          {streaming.text || '…'}
          <span className="cursor" aria-hidden="true" />
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}
