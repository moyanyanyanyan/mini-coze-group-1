import { useEffect, useState } from 'react';

const routeChangeEvent = 'minicoze:route-change';

export function navigate(to: string) {
  if (window.location.pathname + window.location.search === to) {
    return;
  }

  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(routeChangeEvent));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useRouteLocation() {
  const [pathname, setPathname] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname + window.location.search);

    window.addEventListener('popstate', updatePathname);
    window.addEventListener(routeChangeEvent, updatePathname);

    return () => {
      window.removeEventListener('popstate', updatePathname);
      window.removeEventListener(routeChangeEvent, updatePathname);
    };
  }, []);

  return pathname;
}

export function usePathname() {
  return useRouteLocation().split('?')[0];
}
