import { create } from 'zustand';

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface SocketStatusState {
  status: SocketStatus;
  setStatus: (status: SocketStatus) => void;
}

export const useSocketStatusStore = create<SocketStatusState>()((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));
