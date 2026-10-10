import { corpoJson, idNumerico, rotaAgente } from '@/lib/api';
import { atualizarLead, lerLead } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente<{ id: string }>(async (_req, p) => lerLead(idNumerico(p.id)));
export const PATCH = rotaAgente<{ id: string }>(async (req, p) =>
  atualizarLead(idNumerico(p.id), await corpoJson(req), 'agente'));
