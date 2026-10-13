import type { ProgressMode, SessionStatus } from '@/shared/types/session';

export const MODE_LABEL: Record<ProgressMode, string> = {
  round: '라운드 모드',
  free: '자유 모드',
};

export const MODE_DESCRIPTION: Record<ProgressMode, string> = {
  round: '모든 플레이어의 행동을 모은 뒤 한 번에 진행합니다.',
  free: '입력하는 즉시 진행합니다. 1~2인 플레이에 적합합니다.',
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  lobby: '대기 중',
  in_progress: '진행 중',
  paused: '일시정지',
  ended: '종료',
};

export const ROUND_TIME_OPTIONS = [60, 90, 120, 180, 300];

export function formatSeconds(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
}
