import { corpoJson, idNumerico, rotaAgente } from '@/lib/api';
import { criarMensagem, type TipoSaida } from '@/lib/regras';

export const dynamic = 'force-dynamic';
export const POST = rotaAgente<{ id: string }>(async (req, p) => {
  const b = await corpoJson<{ tipo: TipoSaida; assunto?: string; corpo: string; canal?: 'email' | 'manual' }>(req);
  return criarMensagem(idNumerico(p.id), b);
});
