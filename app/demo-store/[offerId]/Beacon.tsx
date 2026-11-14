'use client';
import { useEffect } from 'react';

/** Reports dwell time after 5 s on page; the server also checks the time against the logged click. */
export function Beacon({ code }: { code: string }) {
  useEffect(() => {
    const start = Date.now();
    const t = setTimeout(() => {
      fetch('/api/affiliates/beacon', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, dwellMs: Date.now() - start }), keepalive: true,
      }).catch(() => {});
    }, 5500);
    return () => clearTimeout(t);
  }, [code]);
  return null;
}
