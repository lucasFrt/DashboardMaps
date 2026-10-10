import { rotaAgente } from '@/lib/api';
import { lerRespostas } from '@/lib/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const POST = rotaAgente(() => lerRespostas());
