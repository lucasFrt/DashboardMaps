import { corpoJson, rotaAgente } from '@/lib/api';
import { db } from '@/lib/db';
import { RegraVioladaError } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const POST = rotaAgente(async (req) => {
  const b = await corpoJson<{ resumo: string }>(req);
  if (!b.resumo?.trim()) throw new RegraVioladaError('resumo obrigatório');
  const [r] = await db()`insert into rodadas (resumo) values (${b.resumo}) returning id`;
  return r;
});
