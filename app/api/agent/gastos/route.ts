import { corpoJson, rotaAgente } from '@/lib/api';
import { pedirGasto } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const POST = rotaAgente(async (req) => {
  const b = await corpoJson<{ descricao: string; valor: number; justificativa: string }>(req);
  return pedirGasto({ ...b, valor: Number(b.valor) });
});
