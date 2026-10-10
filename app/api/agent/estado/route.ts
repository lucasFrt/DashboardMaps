import { rotaAgente } from '@/lib/api';
import { estadoParaAgente } from '@/lib/metricas';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente(() => estadoParaAgente());
