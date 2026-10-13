import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/errors';
import type { ScenarioRef } from '@/shared/types/scenario';
import { Modal } from '@/shared/ui/Modal';
import { sessionApi, sessionKeys } from '../api';
import { SessionSettingsFields, type SessionSettingsValue } from './SessionSettingsFields';

// FE-SES-02
export function CreateSessionModal({ scenario, onClose }: { scenario: ScenarioRef | null; onClose: () => void }) {
  const formId = useId();
  return (
    <Modal
      open={!!scenario}
      title="방 만들기"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            만들기
          </button>
        </>
      }
    >
      {scenario && <CreateSessionForm key={scenario.id} formId={formId} scenario={scenario} onDone={onClose} />}
    </Modal>
  );
}

function CreateSessionForm({ formId, scenario, onDone }: { formId: string; scenario: ScenarioRef; onDone: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SessionSettingsValue>({
    maxPlayers: scenario.players.max,
    isPublic: true,
    mode: scenario.players.max === 1 ? 'free' : 'round',
    roundTimeLimitSec: 120,
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => sessionApi.create({ scenarioId: scenario.id, ...settings, password: password.trim() || undefined }),
    onSuccess: (detail) => {
      queryClient.setQueryData(sessionKeys.detail(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      onDone();
      navigate(`/sessions/${detail.id}/lobby`);
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <form
      id={formId}
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const pw = password.trim();
        if (pw && (pw.length < 4 || pw.length > 20)) {
          setError('비밀번호는 4~20자여야 합니다.');
          return;
        }
        setError(null);
        if (!mutation.isPending) mutation.mutate();
      }}
    >
      <p className="muted">
        시나리오: <strong>{scenario.title}</strong>
      </p>
      <SessionSettingsFields
        value={settings}
        onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        playerRange={scenario.players}
      />
      <div className="field">
        <label htmlFor={`${formId}-password`}>비밀번호 (선택)</label>
        <input
          id={`${formId}-password`}
          type="password"
          autoComplete="new-password"
          value={password}
          maxLength={20}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="field-hint">설정하면 초대 링크로 들어와도 비밀번호를 입력해야 합니다.</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
