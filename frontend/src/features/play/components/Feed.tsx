import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedEntry } from '../types';

/** 서술 한 글자당 지연(ms). 도착 속도와 무관하게 일정한 속도로 출력 */
const CHAR_MS = 32;
/** 판정·시스템 줄 사이 간격(ms) */
const LINE_MS = 150;

/** streaming: 서버에서 아직 서술 조각이 오는 중 (narration_end 전) */
export type FeedItem = FeedEntry & { streaming?: boolean };

const TYPED_TYPES = new Set<FeedEntry['type']>(['narration', 'fixed', 'ending']);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Typing {
  animate: boolean;
  /** 텍스트가 더 늘어나지 않음 (스트리밍 종료) */
  complete: boolean;
  onDone: () => void;
  onTick: () => void;
}

function TypedText({ text, typing }: { text: string; typing?: Typing }) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [count, setCount] = useState(0);
  const animate = typing?.animate ?? false;
  const shown = typing && animate ? Math.min(count, chars.length) : chars.length;
  const finished = !typing || (shown >= chars.length && typing.complete);

  // 콜백이 바뀌어도 타이머가 다시 시작되지 않도록 ref 로 보관
  const typingRef = useRef(typing);
  typingRef.current = typing;

  useEffect(() => {
    if (!animate || count >= chars.length) return;
    const id = window.setTimeout(() => {
      setCount((c) => c + 1);
      typingRef.current?.onTick();
    }, CHAR_MS);
    return () => window.clearTimeout(id);
  }, [animate, count, chars.length]);

  // typing 객체는 매 렌더 새로 만들어지므로 finished 변화만 본다
  useEffect(() => {
    if (finished) typingRef.current?.onDone();
  }, [finished]);

  return (
    <>
      {chars.slice(0, shown).join('')}
      {!finished && <span className="cursor" aria-hidden="true" />}
    </>
  );
}

function Entry({ entry, typing }: { entry: FeedItem; typing?: Typing }) {
  switch (entry.type) {
    case 'player':
      return <p className="feed__player">▶ {entry.text}</p>;
    case 'system':
      return <p className="feed__system">{entry.text}</p>;
    case 'fixed':
      return (
        <blockquote className="feed__fixed">
          <TypedText text={entry.text} typing={typing} />
        </blockquote>
      );
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
      return (
        <p className="feed__narration">
          <TypedText text={entry.text} typing={typing} />
        </p>
      );
    case 'ending':
      return (
        <div className="feed__ending">
          <p className="muted small">엔딩</p>
          <h2>{entry.title}</h2>
          <p>
            <TypedText text={entry.text} typing={typing} />
          </p>
        </div>
      );
  }
}

interface Props {
  items: FeedItem[];
  /** 아직 출력 중인 항목이 있는지 (행동 버튼 잠금용) */
  onTypingChange?: (typing: boolean) => void;
}

/**
 * 진행 기록. 새 항목은 순서대로 하나씩 드러나고, 서술은 한 글자씩 출력된다.
 * 처음 불러온 기록은 바로 표시. 클릭하면 남은 출력을 건너뛴다.
 */
export function Feed({ items, onTypingChange }: Props) {
  const [revealed, setRevealed] = useState(() => items.filter((i) => !i.streaming).length);
  const [instant, setInstant] = useState(prefersReducedMotion);
  const boxRef = useRef<HTMLDivElement>(null);

  const current = items[revealed] as FeedItem | undefined;
  const typing = revealed < items.length;
  const lastPlayerId = [...items].reverse().find((i) => i.type === 'player')?.id;

  // 새 행동을 보내면 다시 타자 효과
  useEffect(() => {
    if (!prefersReducedMotion()) setInstant(false);
  }, [lastPlayerId]);

  useEffect(() => {
    onTypingChange?.(typing);
  }, [typing, onTypingChange]);

  const scrollToEnd = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    // 사용자가 위로 올려 읽는 중이면 끌어내리지 않는다
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 120) box.scrollTop = box.scrollHeight;
  }, []);

  useEffect(scrollToEnd, [revealed, items.length, scrollToEnd]);

  // 타자 효과가 없는 줄은 짧은 간격으로 하나씩
  const currentId = current?.id;
  const currentTyped = current ? TYPED_TYPES.has(current.type) : false;
  useEffect(() => {
    if (!currentId || currentTyped) return;
    const id = window.setTimeout(() => setRevealed((r) => r + 1), instant ? 0 : LINE_MS);
    return () => window.clearTimeout(id);
  }, [currentId, currentTyped, instant]);

  const lastNarration = [...items.slice(0, revealed)].reverse().find((i) => i.type === 'narration');

  return (
    <>
      <div
        ref={boxRef}
        className={`feed ${typing ? 'is-typing' : ''}`}
        onClick={() => typing && setInstant(true)}
        title={typing ? '클릭하면 바로 표시' : undefined}
      >
        {items.slice(0, revealed + 1).map((item, idx) =>
          idx < revealed ? (
            <Entry key={item.id} entry={item} />
          ) : (
            <Entry
              key={item.id}
              entry={item}
              typing={{
                animate: !instant,
                complete: !item.streaming,
                onDone: () => setRevealed((r) => r + 1),
                onTick: scrollToEnd,
              }}
            />
          ),
        )}
      </div>
      {/* 스크린리더에는 글자 단위가 아니라 완성된 서술만 알린다 */}
      <div className="sr-only" aria-live="polite">
        {lastNarration?.type === 'narration' ? lastNarration.text : ''}
      </div>
    </>
  );
}
