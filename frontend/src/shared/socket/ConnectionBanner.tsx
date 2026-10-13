import { useSocketStatusStore } from './socketStatusStore';

export function ConnectionBanner() {
  const status = useSocketStatusStore((s) => s.status);
  if (status !== 'reconnecting' && status !== 'error') return null;

  return (
    <div className={`banner ${status === 'error' ? 'banner--error' : 'banner--warning'}`} role="status">
      {status === 'reconnecting'
        ? '서버와 연결이 끊어졌습니다. 다시 연결하는 중…'
        : '서버에 연결할 수 없습니다. 새로고침하거나 잠시 후 다시 시도해 주세요.'}
    </div>
  );
}
