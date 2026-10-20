import { getWorkspaceFeature } from './app/feature-registry';
import { LandingPage } from './features/landing/LandingPage';
import { WorkspaceLayout } from './shared/layout/WorkspaceLayout';
import { usePathname } from './shared/routing/navigation';

export function App() {
  const pathname = usePathname();

  if (pathname === '/') {
    return <LandingPage />;
  }

  const feature = getWorkspaceFeature(pathname);

  if (feature) {
    const Page = feature.Component;
    return <WorkspaceLayout pathname={pathname}><Page /></WorkspaceLayout>;
  }

  return <LandingPage />;
}
