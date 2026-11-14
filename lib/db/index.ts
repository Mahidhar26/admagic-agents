import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export { schema };
export const db = drizzle(neon(process.env.DATABASE_URL ?? 'postgres://missing@localhost/missing'), { schema });
