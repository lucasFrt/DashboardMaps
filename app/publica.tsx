import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import { db } from '@/lib/db';

/** Página pública (sem login) acessada pelo token do lead: amostra ou entrega. */
export async function PaginaPublica({ token, campo }: { token: string; campo: 'amostra' | 'entrega' }) {
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const [l] = await db()<{ nome: string; conteudo: string | null; pago: boolean }[]>`
    select nome, ${db()(campo)} as conteudo, pago from leads where token = ${token}`;
  if (!l?.conteudo || (campo === 'entrega' && !l.pago)) notFound();
  return (
    <main className="publica">
      <header>
        <p className="small muted">{campo === 'amostra' ? 'Amostra preparada para' : 'Entrega para'}</p>
        <h1>{l.nome}</h1>
      </header>
      <article className="card md"><Markdown>{l.conteudo}</Markdown></article>
    </main>
  );
}

export const metadataPublica = { robots: { index: false, follow: false } };
