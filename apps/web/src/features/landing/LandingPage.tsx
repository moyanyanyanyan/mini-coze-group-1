import { LandingView } from '@minicoze/ui/landing';
import { landingModules } from '../../app/feature-registry';
import { AppLink } from '../../shared/routing/AppLink';
import { LandingMotion } from './LandingMotion';

export function LandingPage() {
  return (
    <>
      <LandingMotion />
      <LandingView
        modules={landingModules.map((item) => ({
          id: item.id,
          route: item.route,
          title: item.title,
          description: item.description,
          icon: item.id === 'publish-sdk' ? 'api' : item.icon,
        }))}
        routes={{
          home: '/',
          login: '/login',
          register: '/register',
          workspace: '/workspace',
          chat: '/workspace/chat',
        }}
        LinkComponent={AppLink}
      />
    </>
  );
}
