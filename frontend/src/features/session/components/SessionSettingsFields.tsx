import { useId } from 'react';
import type { PlayerRange } from '@/shared/types/scenario';
import type { ProgressMode } from '@/shared/types/session';
import { formatSeconds, MODE_DESCRIPTION, MODE_LABEL, ROUND_TIME_OPTIONS } from '../labels';

export interface SessionSettingsValue {
  maxPlayers: number;
  isPublic: boolean;
  mode: ProgressMode;
  roundTimeLimitSec: number;
}

interface Props {
  value: SessionSettingsValue;
  onChange: (patch: Partial<SessionSettingsValue>) => void;
  playerRange: PlayerRange;
  /** 현재 참가자 수보다 적게 줄일 수 없음 */
  minMaxPlayers?: number;
}

// 방 만들기(FE-SES-02)와 호스트 설정(FE-SES-06)이 공유하는 입력 필드
export function SessionSettingsFields({ value, onChange, playerRange, minMaxPlayers = 1 }: Props) {
  const id = useId();
  const lower = Math.max(playerRange.min, minMaxPlayers);
  const playerOptions = Array.from({ length: playerRange.max - lower + 1 }, (_, i) => lower + i);

  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-max`}>최대 인원</label>
        <select id={`${id}-max`} value={value.maxPlayers} onChange={(e) => onChange({ maxPlayers: Number(e.target.value) })}>
          {playerOptions.map((n) => (
            <option key={n} value={n}>
              {n}명
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={value.isPublic} onChange={(e) => onChange({ isPublic: e.target.checked })} />
        공개 방 (방 목록에 표시)
      </label>

      <fieldset className="field">
        <legend>진행 모드</legend>
        {(Object.keys(MODE_LABEL) as ProgressMode[]).map((mode) => (
          <label key={mode} className="radio">
            <input type="radio" name={`${id}-mode`} checked={value.mode === mode} onChange={() => onChange({ mode })} />
            <span>
              {MODE_LABEL[mode]}
              <span className="field-hint">{MODE_DESCRIPTION[mode]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {value.mode === 'round' && (
        <div className="field">
          <label htmlFor={`${id}-time`}>라운드 제한 시간</label>
          <select
            id={`${id}-time`}
            value={value.roundTimeLimitSec}
            onChange={(e) => onChange({ roundTimeLimitSec: Number(e.target.value) })}
          >
            {ROUND_TIME_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {formatSeconds(sec)}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
