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
  redirect('/affiliates');
}

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <form action={login} className="card max-w-sm mx-auto mt-16 flex flex-col gap-3">
      <h1>Demo brand sign-in</h1>
      <label className="flex flex-col gap-1 text-sm">Admin password
        <input type="password" name="password" autoComplete="current-password" required autoFocus />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">Wrong password.</p>}
      <button type="submit">Sign in</button>
    </form>
  );
}
