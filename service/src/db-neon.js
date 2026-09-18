// The one file that knows the database is Neon. Everything else sees
// `query(sql, params) -> rows`.

import { neon } from '@neondatabase/serverless';

let sql = null;

/**
 * The Neon integration from the Vercel Marketplace sets DATABASE_URL on the
 * project. Read lazily so that importing this file never throws: a missing
 * variable becomes a failed query, which the router turns into a plain 503.
 */
export async function query(text, params = []) {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    sql = neon(url);
  }
  return sql.query(text, params);
}
