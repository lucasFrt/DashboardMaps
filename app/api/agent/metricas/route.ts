import { rotaAgente } from '@/lib/api';
import { funilPor, resumo } from '@/lib/metricas';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente(async () => ({
  resumo: await resumo(),
  por_categoria: await funilPor('categoria'),
  por_bairro: await funilPor('bairro'),
}));
