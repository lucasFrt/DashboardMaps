import { rotaAgente } from '@/lib/api';
import { buscarLugares } from '@/lib/places';
import { RegraVioladaError } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente(async (req) => {
  const u = new URL(req.url);
  const q = u.searchParams.get('q');
  if (!q) throw new RegraVioladaError('informe ?q=categoria bairro');
  return buscarLugares(q, u.searchParams.get('pagina') ?? undefined);
});
