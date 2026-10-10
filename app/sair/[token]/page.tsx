import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { marcarNaoContatar } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Não receber mais mensagens', robots: { index: false, follow: false } };

async function confirmar(f: FormData) {
  'use server';
  const token = String(f.get('token') ?? '');
  const [l] = await db()<{ id: number; nao_contatar: boolean }[]>`select id, nao_contatar from leads where token = ${token}`;
  if (!l) notFound();
  if (!l.nao_contatar) await db().begin((tx) => marcarNaoContatar(tx, l.id, 'descadastro pelo link', 'sistema'));
  redirect(`/sair/${token}?feito=1`);
}

// A confirmação é um botão (POST) para que robôs de antivírus que abrem links não descadastrem ninguém.
export default async function Sair({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ feito?: string }>;
}) {
  const { token } = await params;
  const { feito } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const [l] = await db()<{ nome: string; nao_contatar: boolean }[]>`select nome, nao_contatar from leads where token = ${token}`;
  if (!l) notFound();
  return (
    <main className="publica" style={{ maxWidth: 480, paddingTop: '12vh' }}>
      {feito || l.nao_contatar ? (
        <div className="card ok">Pronto. {l.nome} não vai receber mais nenhuma mensagem nossa.</div>
      ) : (
        <form action={confirmar} className="card">
          <h1>Não receber mais mensagens</h1>
          <p>Confirme e {l.nome} não será mais contatado.</p>
          <input type="hidden" name="token" value={token} />
          <button className="primario" type="submit">Confirmar</button>
        </form>
      )}
    </main>
  );
}
