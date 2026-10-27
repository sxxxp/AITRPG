import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorView } from '@/shared/ui/Feedback';
import { PageSpinner } from '@/shared/ui/Spinner';
import { playApi, playKeys } from '../api';
import { AiStatusBadge } from '../components/AiStatusBadge';

// 1인 플레이 시작: 시나리오와 프리셋 캐릭터 선택
export function PlaySetupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // 에디터에서 방금 저장한 시나리오도 보이도록 항상 새로 조회
  const scenarios = useQuery({ queryKey: playKeys.scenarios, queryFn: playApi.scenarios, staleTime: 0 });
  // 에디터의 '테스트 플레이'는 ?scenario=<id> 로 들어온다
  const [scenarioId, setScenarioId] = useState<string | null>(params.get('scenario'));
  const [presetId, setPresetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: (body: { scenarioId: string; presetId: string; name: string }) =>
      playApi.start(body.scenarioId, { name: body.name, presetId: body.presetId }),
    onSuccess: ({ view }) => navigate(`/play/${view.gameId}`),
    onError: (e) => setError((e as Error).message),
  });

  if (scenarios.isPending) return <PageSpinner />;
  if (scenarios.isError) {
    return (
      <div className="page narrow">
        <ErrorView message={(scenarios.error as Error).message} onRetry={() => void scenarios.refetch()} />
      </div>
    );
  }

  const scenario = scenarios.data.find((s) => s.id === scenarioId) ?? scenarios.data[0];
  const preset = scenario?.presets.find((p) => p.id === presetId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>1인 플레이</h1>
          <p className="muted">로컬 시나리오를 혼자 플레이합니다. 판정은 엔진이, 서술은 AI가 맡습니다.</p>
        </div>
        <AiStatusBadge />
      </div>

      {!scenario ? (
        <ErrorView message="scenarios 폴더에 플레이할 시나리오가 없습니다." />
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError('캐릭터 이름을 입력하세요.');
            if (!preset) return setError('캐릭터를 선택하세요.');
            setError(null);
            // 기본 선택(첫 시나리오)은 state 가 null 이므로 화면에 표시된 값을 그대로 보낸다
            start.mutate({ scenarioId: scenario.id, presetId: preset.id, name: name.trim() });
          }}
        >
          <fieldset className="field">
            <legend>시나리오</legend>
            <div className="grid">
              {scenarios.data.map((s) => (
                <label key={s.id} className="card preset-option" data-selected={s.id === scenario.id}>
                  <input
                    type="radio"
                    name="scenario"
                    className="sr-only"
                    checked={s.id === scenario.id}
                    onChange={() => {
                      setScenarioId(s.id);
                      setPresetId(null);
                    }}
                  />
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.summary}</span>
                  <span className="small">
                    {s.tags.join(' · ')} · 약 {s.estimatedMinutes}분
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>캐릭터</legend>
            <div className="grid">
              {scenario.presets.map((p) => (
                <label key={p.id} className="card preset-option" data-selected={p.id === presetId}>
                  <input
                    type="radio"
                    name="preset"
                    className="sr-only"
                    checked={p.id === presetId}
                    onChange={() => setPresetId(p.id)}
                  />
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.description}</span>
                  <dl className="stat-grid">
                    {Object.entries(p.stats).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field narrow-field">
            <label htmlFor="play-name">캐릭터 이름</label>
            <input id="play-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={start.isPending}>
              {start.isPending ? '준비 중…' : '시작하기'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
