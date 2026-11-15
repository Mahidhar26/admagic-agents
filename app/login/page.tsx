import { redirect } from 'next/navigation';
import { passwordMatches, startSession } from '@/lib/auth';
import { block } from '@/lib/auth';

async function login(form: FormData) {
  'use server';
  if (!passwordMatches(String(form.get('password') ?? ''))) {
    await block('web', 'wrong admin password');
    redirect('/login?error=1');
  }
  await startSession();
  redirect('/');
}

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <form action={login} className="card max-w-sm w-full mx-auto mt-16 flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-lg font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>A</span>
        <span className="font-semibold">AdMagic Platform</span>
      </div>
      <div><h1>Sign in</h1><p className="muted small mt-1">Demo brand · validate ads and pay affiliates for verified results.</p></div>
      <label className="field">Admin password
        <input type="password" name="password" autoComplete="current-password" required autoFocus />
      </label>
      {error && <p role="alert" className="msg bad m-0">Wrong password.</p>}
      <button type="submit" className="btn-primary">Sign in</button>
    </form>
  );
}
