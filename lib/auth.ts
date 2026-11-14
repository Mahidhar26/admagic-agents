import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { checkToken, sha256 } from './rules';

export const SCOPES = {
  extension: ['buy', 'read_own'],
  agent: ['offers:read', 'links:create', 'earnings:read_own'],
} as const;

export function newToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export async function block(caller: string, reason: string, detail?: unknown) {
  await db.insert(schema.blockedEvents).values({ caller, reason, detail: detail ?? null });
}

/** Looks up a bearer token and checks one scope. Returns the token row, or a 401/403 Response (logged to Blocked). */
export async function requireToken(bearer: string | null | undefined, scope: string) {
  const raw = bearer?.replace(/^Bearer\s+/i, '').trim();
  const row = raw ? await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.tokenHash, sha256(raw)) }) : undefined;
  const result = checkToken(row, scope);
  if (result !== 'ok') {
    await block(row?.name ?? 'unknown caller', result === 'missing_scope' ? 'missing scope' : `${result} token`, { scope });
    const status = result === 'missing_scope' ? 403 : 401;
    return Response.json({ error: result === 'revoked' ? 'Access revoked' : result }, { status });
  }
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row!.id));
  return row!;
}

export const requireBearer = (req: Request, scope: string) => requireToken(req.headers.get('authorization'), scope);

// ---- admin session for the one seeded demo brand ----
const COOKIE = 'admin_session';
const sign = (v: string) => createHmac('sha256', process.env.SESSION_SECRET ?? 'dev-only-secret').update(v).digest('hex');

export function passwordMatches(input: string) {
  const want = Buffer.from(sha256(process.env.ADMIN_PASSWORD ?? ''));
  return !!process.env.ADMIN_PASSWORD && timingSafeEqual(Buffer.from(sha256(input)), want);
}

export async function startSession() {
  const exp = String(Date.now() + 12 * 3600_000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 12 * 3600 });
}

export async function isAdmin() {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split('.');
  const a = Buffer.from(sign(exp));
  const b = Buffer.from(sig ?? '');
  return a.length === b.length && timingSafeEqual(a, b) && Number(exp) > Date.now();
}

/** For pages. */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect('/login');
}

/** For brand API routes: null when allowed, else a 401 Response. */
export async function adminOnly() {
  if (await isAdmin()) return null;
  await block('web', 'not signed in');
  return Response.json({ error: 'Sign in as the brand first' }, { status: 401 });
}
