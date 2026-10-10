import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, senhaCorreta, valorSessao } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function entrar(f: FormData) {
  'use server';
  if (!senhaCorreta(String(f.get('senha') ?? ''))) redirect('/login?erro=1');
  (await cookies()).set(COOKIE, valorSessao(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 60,
  });
  redirect('/');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main style={{ maxWidth: 360, paddingTop: '18vh' }}>
      <h1>Painel</h1>
      <p className="muted">R$300 → R$600</p>
      {erro && <div className="card erro">Senha incorreta.</div>}
      <form action={entrar} className="card">
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required autoFocus />
        <div className="acoes"><button className="primario" type="submit">Entrar</button></div>
      </form>
    </main>
  );
}
