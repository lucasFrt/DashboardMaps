import { corpoJson, rotaAgente } from '@/lib/api';
import { db } from '@/lib/db';
import { RegraVioladaError } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente(() => db()`select * from revisoes order by em desc limit 10`);
export const POST = rotaAgente(async (req) => {
  const b = await corpoJson<{ semana: string; texto: string }>(req);
  if (!b.semana || !b.texto?.trim()) throw new RegraVioladaError('semana (AAAA-MM-DD) e texto são obrigatórios');
  const [r] = await db()`insert into revisoes (semana, texto) values (${b.semana}, ${b.texto}) returning id`;
  return r;
});
