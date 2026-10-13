import { apiClient } from '@/shared/api/client';
import { setSocketFactory, type GameSocket } from '@/shared/socket/socket';
import { resetMockDb } from './db';
import './handlers';
import { mockAdapter } from './http';
import { MockGameSocket } from './mockSocket';

/** VITE_USE_MOCK=true 일 때 main.tsx에서 호출 */
export function installMocks() {
  apiClient.defaults.adapter = mockAdapter;
  setSocketFactory(() => new MockGameSocket() as unknown as GameSocket);
  (window as unknown as { __wtgMockReset: () => void }).__wtgMockReset = resetMockDb;
  console.info('[mock] 목 API 사용 중 — 데모 계정 demo@wtg.dev / demo1234, 초기화: __wtgMockReset()');
}
