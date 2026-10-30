import pg from 'pg';
import { env } from '../config/env.js';

// NUMERIC -> number, DATE -> 'YYYY-MM-DD' string (avoids timezone shifts), BIGINT -> number
pg.types.setTypeParser(1700, parseFloat);
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
