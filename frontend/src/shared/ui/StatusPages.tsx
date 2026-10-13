import { isRouteErrorResponse, Link, useLocation, useRouteError } from 'react-router-dom';

/** 아직 구현하지 않은 영역의 라우트 자리 */
export function ComingSoonPage({ area }: { area: string }) {
  const location = useLocation();
  return (
    <div className="page page-center-text">
      <h1>{area}</h1>
      <p className="muted">이 화면은 아직 구현되지 않았습니다.</p>
      <p className="muted small">
        <code>{location.pathname}</code>
      </p>
      <Link to="/" className="btn btn-secondary">
        홈으로
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="page page-center-text">
      <h1>페이지를 찾을 수 없습니다</h1>
      <Link to="/" className="btn btn-secondary">
        홈으로
      </Link>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : '예상하지 못한 오류가 발생했습니다.';
  return (
    <div className="container page page-center-text">
      <h1>문제가 발생했습니다</h1>
      <p className="muted">{message}</p>
      <a href="/" className="btn btn-secondary">
        홈으로
      </a>
    </div>
  );
}
