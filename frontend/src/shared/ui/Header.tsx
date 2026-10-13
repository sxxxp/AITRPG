import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { loginPath } from '@/shared/auth/redirect';
import { useLogout } from '@/shared/auth/useLogout';

export function Header() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const location = useLocation();
  const onAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand">
          AI TRPG
        </Link>
        <nav className="main-nav" aria-label="주요 메뉴">
          <NavLink to="/" end>
            홈
          </NavLink>
          <NavLink to="/sessions">방 목록</NavLink>
          {user && <NavLink to="/my/sessions">내 세션</NavLink>}
        </nav>
        <div className="user-menu">
          {status === 'unknown' ? null : user ? (
            <>
              <span className="user-menu__name">{user.nickname}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
                로그아웃
              </button>
            </>
          ) : (
            !onAuthPage && (
              <>
                <Link to={loginPath(location.pathname + location.search)} className="btn btn-ghost btn-sm">
                  로그인
                </Link>
                <Link to="/signup" className="btn btn-primary btn-sm">
                  회원가입
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
