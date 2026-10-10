import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

/** Conexão única por instância. prepare: false para funcionar com o pooler do Neon/Supabase. */
export function db(): postgres.Sql {
  if (!globalThis.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada');
    globalThis.__sql = postgres(url, { max: 3, prepare: false, idle_timeout: 20, onnotice: () => {} });
  }
  return globalThis.__sql;
}

export type Tx = postgres.TransactionSql | postgres.Sql;
