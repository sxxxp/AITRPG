import { useRef } from 'react';
import { toast } from '@/shared/ui/toastStore';

export function InviteLink({ inviteCode }: { inviteCode: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = `${window.location.origin}/join/${inviteCode}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('초대 링크를 복사했습니다.');
    } catch {
      // 클립보드 권한이 없으면 직접 복사할 수 있도록 선택
      inputRef.current?.select();
      toast.info('링크를 선택했습니다. Ctrl+C로 복사하세요.');
    }
  };

  return (
    <div className="invite-link">
      <label htmlFor="invite-url" className="label">
        초대 링크 · 코드 <strong>{inviteCode}</strong>
      </label>
      <div className="row">
        <input id="invite-url" ref={inputRef} readOnly value={url} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
          복사
        </button>
      </div>
    </div>
  );
}
