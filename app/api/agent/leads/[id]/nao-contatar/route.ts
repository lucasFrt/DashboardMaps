import { corpoJson, idNumerico, rotaAgente } from '@/lib/api';
import { db } from '@/lib/db';
import { marcarNaoContatar } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const POST = rotaAgente<{ id: string }>(async (req, p) => {
  const b = await corpoJson<{ motivo?: string }>(req);
  await db().begin((tx) => marcarNaoContatar(tx, idNumerico(p.id), b.motivo || 'pediu para não ser contatado', 'agente'));
  return { ok: true };
});
