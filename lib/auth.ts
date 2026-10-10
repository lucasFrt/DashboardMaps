import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE = 'painel_sessao';

function segredo() {
  const s = process.env.PANEL_PASSWORD;
  if (!s) throw new Error('PANEL_PASSWORD não configurada');
  return s;
}

/** Valor do cookie: HMAC fixo derivado da senha. Trocar a senha derruba todas as sessões. */
export function valorSessao() {
  return createHmac('sha256', segredo()).update('painel-sessao-v1').digest('hex');
}

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function senhaCorreta(senha: string) {
  return iguais(senha, segredo());
}

export async function logado() {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && iguais(c, valorSessao());
}

/** Usar no topo de toda página e server action do painel. */
export async function exigirLogin() {
  if (!(await logado())) redirect('/login');
}

/** Autenticação das rotas /api/agent/*: Authorization: Bearer <AGENT_TOKEN>. */
export function agenteAutorizado(req: Request) {
  const token = process.env.AGENT_TOKEN;
  if (!token) return false;
  const h = req.headers.get('authorization') ?? '';
  return iguais(h, `Bearer ${token}`);
}
