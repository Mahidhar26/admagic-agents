'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Hold countdown; refreshes the page when it reaches zero so the release shows up. */
export function Countdown({ to }: { to: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => new Date(to).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const ms = new Date(to).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) { clearInterval(t); setTimeout(() => router.refresh(), 500); }
    }, 1000);
    return () => clearInterval(t);
  }, [to, router]);
  if (left <= 0) return <span>releasing…</span>;
  const s = Math.ceil(left / 1000);
  return <span>releases in {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}
