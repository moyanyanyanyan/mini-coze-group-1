import type { ComponentType } from 'react';
import { getWorkspaceFeature } from './app/feature-registry';
import { LoginPage, RegisterPage } from './features/auth';
import { LandingPage } from './features/landing/LandingPage';
import { WorkspaceLayout } from './shared/layout/WorkspaceLayout';
import { usePathname } from './shared/routing/navigation';

const authRoutes: Record<string, ComponentType> = {
  '/login': LoginPage,
  '/register': RegisterPage,
};

export function App() {
  const pathname = usePathname();

  if (pathname === '/') {
    return <LandingPage />;
  }

  const AuthPage = authRoutes[pathname];

  if (AuthPage) {
    return <AuthPage />;
  }

  const feature = getWorkspaceFeature(pathname);

  if (feature) {
    const Page = feature.Component;
    return <WorkspaceLayout pathname={pathname}><Page /></WorkspaceLayout>;
  }

  return <LandingPage />;
}
