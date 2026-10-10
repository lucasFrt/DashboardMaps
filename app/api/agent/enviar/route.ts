import { rotaAgente } from '@/lib/api';
import { enviarAprovadas } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const POST = rotaAgente(() => enviarAprovadas());
