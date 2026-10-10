// Aplica db/schema.sql. Roda no build da Vercel; sem DATABASE_URL apenas avisa e segue.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[migrate] DATABASE_URL ausente, migração pulada.');
  process.exit(0);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('[migrate] schema aplicado.');
} finally {
  await sql.end();
}
