// Aplica db/schema.sql. Roda no build da Vercel; sem DATABASE_URL apenas avisa e segue.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[migrate] DATABASE_URL ausente, migração pulada.');
  process.exit(0);
}
// channel_binding (que o Neon põe na URL) só existe no libpq; o driver o mandaria ao servidor.
const limpa = new URL(url);
limpa.searchParams.delete('channel_binding');
const sql = postgres(limpa.toString(), { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('[migrate] schema aplicado.');
} finally {
  await sql.end();
}
