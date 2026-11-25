import { useEffect, useState } from 'react';

// Hash routes keep the app working from any static host and offline,
// without server rewrite rules.
export function useRoute(): string[] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function go(path: string) {
  const h = '#/' + path.replace(/^\/+/, '');
  if (location.hash !== h) location.hash = h;
  window.scrollTo(0, 0);
}

export function queryParam(name: string) {
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
}
