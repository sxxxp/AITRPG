import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/shared/styles/global.css';

async function bootstrap() {
  // 목 모드일 때만 동적 로드 → 운영 번들에는 포함되지 않음
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { installMocks } = await import('@/mocks');
    installMocks();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
