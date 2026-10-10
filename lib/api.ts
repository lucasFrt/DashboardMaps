import { NextResponse } from 'next/server';
import { agenteAutorizado } from './auth';
import { RegraVioladaError } from './regras';

type Ctx<P> = { params: Promise<P> };

/** Envolve uma rota /api/agent/*: exige o token do agente e devolve erros como JSON. */
export function rotaAgente<P = Record<string, string>>(
  fn: (req: Request, params: P) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    if (!agenteAutorizado(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
    try {
      const r = await fn(req, await ctx.params);
      return NextResponse.json(r ?? { ok: true });
    } catch (e) {
      if (e instanceof RegraVioladaError) return NextResponse.json({ erro: e.message, regra: true }, { status: 422 });
      console.error(e);
      return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  };
}

export async function corpoJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new RegraVioladaError('corpo JSON inválido');
  }
}

export function idNumerico(v: string) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new RegraVioladaError(`id inválido: ${v}`);
  return n;
}
