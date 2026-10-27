import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner } from '@/shared/ui/Spinner';
import { toast } from '@/shared/ui/toastStore';
import { playApi, playKeys } from '../api';
import { ActionPanel } from '../components/ActionPanel';
import { AiStatusBadge } from '../components/AiStatusBadge';
import { CharacterSheet } from '../components/CharacterSheet';
import { DebugPanel } from '../components/DebugPanel';
import { Feed, type FeedItem } from '../components/Feed';
import type { ActInput, DebugPatch, FeedEntry, GameView, StreamEvent } from '../types';

// 1인 플레이 화면 (FE-PLY-01/02/04/05 의 1인용 축소판)
export function PlayPage() {
  const { gameId = '' } = useParams();
  const aiStatus = useQuery({ queryKey: playKeys.aiStatus, queryFn: playApi.aiStatus });
  const [view, setView] = useState<GameView | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [streaming, setStreaming] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 스트리밍 중인 서술은 최종본과 같은 id 로 이어 붙여, 최종본이 와도 타자 효과가 처음부터 다시 시작되지 않게 한다
  const items = useMemo<FeedItem[]>(
    () => (streaming ? [...feed, { id: streaming.id, type: 'narration', text: streaming.text, fallback: false, streaming: true }] : feed),
    [feed, streaming],
  );

  useEffect(() => {
    let cancelled = false;
    playApi
      .get(gameId)
      .then((snap) => {
        if (cancelled) return;
        setView(snap.view);
        setFeed(snap.feed);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const onEvent = useCallback((ev: StreamEvent) => {
    switch (ev.type) {
      case 'feed':
        setFeed((f) => [...f, ev.entry]);
        break;
      case 'view':
        setView(ev.view);
        break;
      case 'narration_start':
        setStreaming({ id: ev.id, text: '' });
        break;
      case 'narration_delta':
        setStreaming((s) => (s && s.id === ev.id ? { ...s, text: s.text + ev.delta } : s));
        break;
      case 'narration_end':
        setStreaming(null);
        setFeed((f) => [...f, ev.entry]);
        break;
      case 'error':
        toast.error(ev.message);
        break;
    }
  }, []);

  const send = async (input: ActInput) => {
    if (busy) return;
    setBusy(true);
    try {
      await playApi.act(gameId, input, onEvent);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  };

  const applyDebug = async (patch: DebugPatch) => {
    try {
      const { view: next, entry } = await playApi.debug(gameId, patch);
      setView(next);
      if (entry) setFeed((f) => [...f, entry]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="page narrow stack">
        <ErrorView message={loadError} />
        <Link to="/play" className="btn btn-secondary">
          새로 시작
        </Link>
      </div>
    );
  }
  if (!view) return <PageSpinner />;

  return (
    <div className="page play">
      <div className="page-header">
        <div>
          <p className="muted small">
            {view.scenario.title} · {view.turn}턴
          </p>
          <h1>{view.scene.name}</h1>
          {view.scene.npcs.length > 0 && <p className="muted small">여기 있는 사람: {view.scene.npcs.join(', ')}</p>}
        </div>
        <AiStatusBadge />
      </div>

      <div className="play-grid">
        <div className="play-main card">
          <Feed items={items} onTypingChange={setTyping} />
          {view.ending && !typing ? (
            <div className="row">
              <Link to="/play" className="btn btn-primary">
                새로 시작
              </Link>
            </div>
          ) : (
            <ActionPanel
              actions={view.ending ? [] : view.actions}
              busy={busy || typing}
              aiAvailable={!!aiStatus.data?.available}
              onAction={(actionId) => void send({ actionId })}
              onText={(text) => void send({ text })}
            />
          )}
        </div>

        <aside className="play-side">
          <CharacterSheet view={view} />
          <DebugPanel view={view} disabled={busy} onPatch={(patch) => void applyDebug(patch)} />
        </aside>
      </div>
    </div>
  );
}
