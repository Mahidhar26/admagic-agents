'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Sends a form to a JSON API route, shows the route's message (e.g. a secret shown once), refreshes the page.
 * Hidden inputs carry fixed values; number-looking fields are left as strings (routes coerce with zod).
 */
export function ApiForm({ action, method = 'POST', children, className, confirm }: {
  action: string; method?: string; children: React.ReactNode; className?: string; confirm?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    const body = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''));
    const res = await fetch(action, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setMsg({ text: data.message ?? data.error ?? (res.ok ? 'Done' : `Failed (${res.status})`), ok: res.ok });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <fieldset disabled={busy} className="contents">{children}</fieldset>
      {msg && <p role="status" className={`msg basis-full ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
    </form>
  );
}
