import { useEffect, useState } from 'react';

const routeChangeEvent = 'minicoze:route-change';

export function navigate(to: string) {
  if (window.location.pathname === to) {
    return;
  }

  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(routeChangeEvent));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);

    window.addEventListener('popstate', updatePathname);
    window.addEventListener(routeChangeEvent, updatePathname);

    return () => {
      window.removeEventListener('popstate', updatePathname);
      window.removeEventListener(routeChangeEvent, updatePathname);
    };
  }, []);

  return pathname;
}
