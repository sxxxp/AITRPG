import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { getErrorMessage } from '@/shared/api/errors';
import type { SessionDetail } from '@/shared/types/session';
import { toast } from '@/shared/ui/toastStore';
import { sessionApi, sessionKeys, type UpdateSettingsBody } from '../api';
import { SessionSettingsFields, type SessionSettingsValue } from './SessionSettingsFields';

type PasswordAction = 'keep' | 'set' | 'remove';

function startBlockers(session: SessionDetail): string[] {
  const reasons: string[] = [];
  const { players, scenario } = session;
  if (players.length < scenario.players.min) reasons.push(`최소 ${scenario.players.min}명이 필요합니다.`);
  if (players.some((p) => !p.character)) reasons.push('캐릭터를 정하지 않은 참가자가 있습니다.');
  if (players.some((p) => !p.ready)) reasons.push('준비하지 않은 참가자가 있습니다.');
  return reasons;
}

// FE-SES-06 (초대 코드 재발급은 P1이라 제외)
export function HostSettingsPanel({ session }: { session: SessionDetail }) {
  const id = useId();
  const queryClient = useQueryClient();
  const { settings } = session;

  const [form, setForm] = useState<SessionSettingsValue>({
    maxPlayers: settings.maxPlayers,
    isPublic: settings.isPublic,
    mode: settings.mode,
    roundTimeLimitSec: settings.roundTimeLimitSec,
  });
  const [passwordAction, setPasswordAction] = useState<PasswordAction>('keep');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const dirty =
    form.maxPlayers !== settings.maxPlayers ||
    form.isPublic !== settings.isPublic ||
    form.mode !== settings.mode ||
    form.roundTimeLimitSec !== settings.roundTimeLimitSec ||
    passwordAction !== 'keep';

  const save = useMutation({
    mutationFn: (body: UpdateSettingsBody) => sessionApi.updateSettings(session.id, body),
    onSuccess: (next) => {
      queryClient.setQueryData<SessionDetail>(sessionKeys.detail(session.id), (prev) =>
        prev ? { ...prev, settings: next } : prev,
      );
      setPasswordAction('keep');
      setPassword('');
      toast.success('방 설정을 저장했습니다.');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const start = useMutation({
    mutationFn: () => sessionApi.start(session.id),
    // 화면 이동은 session:started 이벤트에서 처리
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const blockers = startBlockers(session);

  return (
    <div className="stack">
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (passwordAction === 'set' && (password.length < 4 || password.length > 20)) {
            setError('비밀번호는 4~20자여야 합니다.');
            return;
          }
          save.mutate({
            ...form,
            password: passwordAction === 'set' ? password : passwordAction === 'remove' ? null : undefined,
          });
        }}
      >
        <SessionSettingsFields
          value={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          playerRange={session.scenario.players}
          minMaxPlayers={session.players.length}
        />

        <fieldset className="field">
          <legend>비밀번호 {settings.hasPassword ? '(설정됨)' : '(없음)'}</legend>
          <label className="radio">
            <input type="radio" name={`${id}-pw`} checked={passwordAction === 'keep'} onChange={() => setPasswordAction('keep')} />
            유지
          </label>
          <label className="radio">
            <input type="radio" name={`${id}-pw`} checked={passwordAction === 'set'} onChange={() => setPasswordAction('set')} />
            {settings.hasPassword ? '변경' : '설정'}
          </label>
          {settings.hasPassword && (
            <label className="radio">
              <input
                type="radio"
                name={`${id}-pw`}
                checked={passwordAction === 'remove'}
                onChange={() => setPasswordAction('remove')}
              />
              해제
            </label>
          )}
          {passwordAction === 'set' && (
            <input
              type="password"
              aria-label="새 비밀번호"
              autoComplete="new-password"
              maxLength={20}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row-end">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!dirty || save.isPending}>
            설정 저장
          </button>
        </div>
      </form>

      <hr />

      <div className="stack-sm">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={blockers.length > 0 || start.isPending}
          aria-describedby={blockers.length > 0 ? `${id}-blockers` : undefined}
          onClick={() => start.mutate()}
        >
          게임 시작
        </button>
        {blockers.length > 0 && (
          <ul id={`${id}-blockers`} className="field-hint">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
