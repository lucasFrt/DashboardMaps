import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

/**
 * Remove parâmetros que só o libpq entende (ex.: channel_binding, que o Neon põe na URL):
 * o driver repassaria ao servidor como parâmetro de sessão e a conexão falharia.
 */
export function limparUrl(url: string) {
  const u = new URL(url);
  u.searchParams.delete('channel_binding');
  return u.toString();
}

/** Conexão única por instância. prepare: false para funcionar com o pooler do Neon/Supabase. */
export function db(): postgres.Sql {
  if (!globalThis.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada');
    globalThis.__sql = postgres(limparUrl(url), { max: 3, prepare: false, idle_timeout: 20, onnotice: () => {} });
  }
  return globalThis.__sql;
}

export type Tx = postgres.TransactionSql | postgres.Sql;
