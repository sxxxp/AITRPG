import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { getErrorMessage } from '@/shared/api/errors';
import type { Character, CharacterInput, CharacterPreset, CharacterRules, StatBlock } from '@/shared/types/character';
import type { SessionDetail } from '@/shared/types/session';
import { ErrorView } from '@/shared/ui/Feedback';
import { Spinner } from '@/shared/ui/Spinner';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi, sessionKeys } from '../api';

// FE-SES-05: 프리셋 선택 또는 포인트 배분으로 직접 생성
export function CharacterPanel({ session, meId }: { session: SessionDetail; meId: string }) {
  const scenarioId = session.scenario.id;
  const me = session.players.find((p) => p.userId === meId);
  const characterId = me?.character?.id ?? null;
  const [editing, setEditing] = useState(false);

  const rules = useQuery({
    queryKey: sessionKeys.characterRules(scenarioId),
    queryFn: () => sessionApi.characterRules(scenarioId),
  });
  const presets = useQuery({ queryKey: sessionKeys.presets(scenarioId), queryFn: () => sessionApi.presets(scenarioId) });
  const character = useQuery({
    queryKey: sessionKeys.character(session.id, characterId ?? ''),
    queryFn: () => sessionApi.getCharacter(session.id, characterId!),
    enabled: !!characterId,
  });

  if (rules.isPending || presets.isPending || (characterId && character.isPending)) return <Spinner />;
  if (rules.isError || presets.isError || character.isError) {
    return (
      <ErrorView
        message="캐릭터 정보를 불러오지 못했습니다."
        onRetry={() => {
          void rules.refetch();
          void presets.refetch();
          if (characterId) void character.refetch();
        }}
      />
    );
  }

  if (characterId && character.data && !editing) {
    const preset = presets.data.find((p) => p.id === character.data.presetId);
    return (
      <div className="stack">
        <div>
          <h3>{character.data.name}</h3>
          {preset && <p className="muted small">프리셋: {preset.name}</p>}
        </div>
        <StatGrid stats={character.data.stats} />
        {character.data.background && <p className="muted">{character.data.background}</p>}
        <div className="row-end">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            수정
          </button>
        </div>
        {me?.ready && <p className="field-hint">수정하면 준비 상태가 해제됩니다.</p>}
      </div>
    );
  }

  return (
    <CharacterForm
      sessionId={session.id}
      rules={rules.data}
      presets={presets.data}
      initial={character.data ?? null}
      onCancel={characterId ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

function StatGrid({ stats }: { stats: StatBlock }) {
  return (
    <dl className="stat-grid">
      {Object.entries(stats).map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface FormProps {
  sessionId: string;
  rules: CharacterRules;
  presets: CharacterPreset[];
  initial: Character | null;
  onCancel?: () => void;
  onSaved: () => void;
}

function CharacterForm({ sessionId, rules, presets, initial, onCancel, onSaved }: FormProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const custom = initial && !initial.presetId ? initial : null;
  const [tab, setTab] = useState<'preset' | 'custom'>(custom && rules.allowCustom ? 'custom' : 'preset');
  const [presetId, setPresetId] = useState<string | null>(initial?.presetId ?? presets[0]?.id ?? null);
  const [name, setName] = useState(custom?.name ?? '');
  const [background, setBackground] = useState(custom?.background ?? '');
  const [stats, setStats] = useState<StatBlock>(() =>
    custom ? { ...custom.stats } : Object.fromEntries(rules.stats.map((s) => [s, rules.minPerStat])),
  );
  const [error, setError] = useState<string | null>(null);

  const remaining = rules.totalPoints - rules.stats.reduce((sum, s) => sum + (stats[s] ?? 0), 0);

  const mutation = useMutation({
    mutationFn: (input: CharacterInput) =>
      initial ? sessionApi.updateCharacter(sessionId, initial.id, input) : sessionApi.createCharacter(sessionId, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(sessionKeys.character(sessionId, saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId), exact: true });
      toast.success(initial ? '캐릭터를 수정했습니다.' : '캐릭터를 만들었습니다.');
      onSaved();
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const submit = () => {
    if (tab === 'preset') {
      if (!presetId) return setError('프리셋을 선택하세요.');
      setError(null);
      return mutation.mutate({ presetId });
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) return setError('캐릭터 이름은 1~20자여야 합니다.');
    if (remaining !== 0) return setError(`스탯 포인트를 모두 배분하세요. (남은 포인트 ${remaining})`);
    setError(null);
    mutation.mutate({ name: trimmed, background: background.trim(), stats });
  };

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {rules.allowCustom && (
        <div className="tabs" role="tablist" aria-label="캐릭터 생성 방식">
          {(['preset', 'custom'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
              {t === 'preset' ? '프리셋 선택' : '직접 만들기'}
            </button>
          ))}
        </div>
      )}

      {tab === 'preset' ? (
        <fieldset className="preset-list">
          <legend className="sr-only">프리셋 캐릭터</legend>
          {presets.map((p) => (
            <label key={p.id} className="preset-option" data-selected={presetId === p.id}>
              <input
                type="radio"
                name={`${id}-preset`}
                className="sr-only"
                checked={presetId === p.id}
                onChange={() => setPresetId(p.id)}
              />
              <strong>{p.name}</strong>
              <span className="muted small">{p.description}</span>
              <StatGrid stats={p.stats} />
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`${id}-name`}>이름</label>
            <input id={`${id}-name`} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">
              스탯 배분 · 남은 포인트{' '}
              <strong className={remaining === 0 ? 'text-success' : undefined}>{remaining}</strong> / {rules.totalPoints}
            </span>
            <div className="stat-editor">
              {rules.stats.map((stat) => {
                const value = stats[stat] ?? rules.minPerStat;
                const set = (v: number) => setStats((s) => ({ ...s, [stat]: v }));
                return (
                  <div key={stat} className="stat-editor__row">
                    <span id={`${id}-${stat}`}>{stat}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`${stat} 감소`}
                      disabled={value <= rules.minPerStat}
                      onClick={() => set(value - 1)}
                    >
                      −
                    </button>
                    <output aria-labelledby={`${id}-${stat}`}>{value}</output>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`${stat} 증가`}
                      disabled={value >= rules.maxPerStat || remaining <= 0}
                      onClick={() => set(value + 1)}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="field-hint">
              각 스탯 {rules.minPerStat}~{rules.maxPerStat}
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-bg`}>배경 (선택)</label>
            <textarea id={`${id}-bg`} rows={3} maxLength={500} value={background} onChange={(e) => setBackground(e.target.value)} />
          </div>
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row-end">
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
          {initial ? '저장' : '캐릭터 확정'}
        </button>
      </div>
    </form>
  );
}
