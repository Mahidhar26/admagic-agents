import Link from 'next/link';
import { redirect } from 'next/navigation';
import { block, credentialsMatch, DEMO_ACCOUNT, startSession } from '@/lib/auth';

async function login(form: FormData) {
  'use server';
  if (!credentialsMatch(String(form.get('email') ?? ''), String(form.get('password') ?? ''))) {
    await block('web', 'wrong email or password');
    redirect('/login?error=1');
  }
  await startSession();
  redirect('/workspace');
}

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { error, mode } = await searchParams;
  const signup = mode === 'signup';
  return (
    <form action={login} className="card max-w-sm w-full mx-auto mt-16 flex flex-col gap-4 p-6">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="grid place-items-center w-8 h-8 rounded-lg font-bold" style={{ background: 'var(--text)', color: 'var(--bg)' }}>A</span>
        <span className="font-semibold">AdMagic Agents</span>
      </Link>
      <div>
        <h1>{signup ? 'Create your account' : 'Sign in'}</h1>
        <p className="muted small mt-1">{signup
          ? 'Self-serve accounts open soon. Explore everything now with the shared demo account below.'
          : 'Score ads, launch affiliate offers and pay for verified results.'}</p>
      </div>
      <div className="rounded-lg p-3 small" style={{ background: 'var(--surface-2)' }}>
        <div className="font-semibold mb-1">Demo account</div>
        <div className="grid grid-cols-[70px_1fr] gap-y-0.5">
          <span className="muted">Email</span><code>{DEMO_ACCOUNT.email}</code>
          <span className="muted">Password</span><code>{DEMO_ACCOUNT.password}</code>
        </div>
      </div>
      <label className="field">Email
        <input type="email" name="email" autoComplete="username" required defaultValue={DEMO_ACCOUNT.email} />
      </label>
      <label className="field">Password
        <input type="password" name="password" autoComplete="current-password" required defaultValue={DEMO_ACCOUNT.password} />
      </label>
      {error && <p role="alert" className="msg bad m-0">That email and password don’t match the demo account.</p>}
      <button type="submit" className="btn-primary min-h-10">{signup ? 'Continue with the demo account' : 'Sign in'}</button>
      <p className="small muted text-center">{signup
        ? <>Already have access? <Link href="/login" className="underline">Sign in</Link></>
        : <>New here? <Link href="/login?mode=signup" className="underline">Create an account</Link></>}</p>
    </form>
  );
}
