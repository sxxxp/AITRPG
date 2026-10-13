import { Outlet } from 'react-router-dom';
import { ConnectionBanner } from '@/shared/socket/ConnectionBanner';
import { Header } from './Header';
import { Toaster } from './Toaster';

// FE-COM-04
export function Layout() {
  return (
    <>
      <Header />
      <ConnectionBanner />
      <main className="container">
        <Outlet />
      </main>
      <Toaster />
    </>
  );
}
