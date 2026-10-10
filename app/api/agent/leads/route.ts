import { corpoJson, rotaAgente } from '@/lib/api';
import { criarLead, listarLeads } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const GET = rotaAgente(async (req) => {
  const u = new URL(req.url);
  return listarLeads({ status: u.searchParams.get('status'), q: u.searchParams.get('q') });
});
export const POST = rotaAgente(async (req) => criarLead(await corpoJson(req)));
