import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { MyScenariosPage } from '@/features/editor/pages/MyScenariosPage';
import { ScenarioEditorPage } from '@/features/editor/pages/ScenarioEditorPage';
import { HomePage } from '@/features/home/pages/HomePage';
import { JoinPage } from '@/features/session/pages/JoinPage';
import { LobbyPage } from '@/features/session/pages/LobbyPage';
import { PlayPage } from '@/features/play/pages/PlayPage';
import { PlaySetupPage } from '@/features/play/pages/PlaySetupPage';
import { MySessionsPage } from '@/features/session/pages/MySessionsPage';
import { SessionListPage } from '@/features/session/pages/SessionListPage';
import { RequireAuth } from '@/shared/auth/RequireAuth';
import { Layout } from '@/shared/ui/Layout';
import { ComingSoonPage, NotFoundPage, RouteErrorPage } from '@/shared/ui/StatusPages';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      // 홈
      { index: true, element: <HomePage /> },

      // 계정
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },

      // 세션
      { path: 'sessions', element: <SessionListPage /> },
      { path: 'join/:inviteCode', element: <JoinPage /> },
      {
        path: 'sessions/:sessionId/lobby',
        element: (
          <RequireAuth>
            <LobbyPage />
          </RequireAuth>
        ),
      },
      {
        path: 'my/sessions',
        element: (
          <RequireAuth>
            <MySessionsPage />
          </RequireAuth>
        ),
      },

      // 시나리오 제작 (FE-EDT)
      {
        path: 'my/scenarios',
        element: (
          <RequireAuth>
            <MyScenariosPage />
          </RequireAuth>
        ),
      },
      {
        path: 'scenarios/new',
        element: (
          <RequireAuth>
            <ScenarioEditorPage />
          </RequireAuth>
        ),
      },
      {
        path: 'scenarios/:scenarioId/edit',
        element: (
          <RequireAuth>
            <ScenarioEditorPage />
          </RequireAuth>
        ),
      },

      // 1인 플레이 (로컬 시나리오 + 로컬 LLM)
      { path: 'play', element: <PlaySetupPage /> },
      { path: 'play/:gameId', element: <PlayPage /> },

      // 미구현 영역: 구현된 화면에서 이동하는 경로만 자리 표시
      { path: 'sessions/:sessionId/play', element: <ComingSoonPage area="플레이" /> },
      { path: 'sessions/:sessionId/log', element: <ComingSoonPage area="세션 기록" /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
