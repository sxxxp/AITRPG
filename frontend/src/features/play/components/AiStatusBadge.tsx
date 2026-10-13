import { useQuery } from '@tanstack/react-query';
import { playApi, playKeys } from '../api';

export function AiStatusBadge() {
  const query = useQuery({ queryKey: playKeys.aiStatus, queryFn: playApi.aiStatus, refetchInterval: 30_000 });

  if (query.isPending) return <span className="badge">AI 확인 중…</span>;
  if (query.isError) return <span className="badge badge--danger">서버 연결 안 됨</span>;
  const s = query.data;
  return (
    <span className={`badge ${s.available ? 'badge--success' : 'badge--warning'}`} title={s.message}>
      {s.available ? `AI 서술 · ${s.model}` : 'AI 없음 · 고정 서술'}
    </span>
  );
}
