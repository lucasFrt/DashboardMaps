// Regras de operação aplicadas no servidor. O agente não consegue contorná-las pela API.
import { db, type Tx } from './db';

export const STATUS = [
  'encontrado', 'amostra_pronta', 'aguardando_aprovacao', 'abordado',
  'respondeu', 'negociando', 'pago', 'entregue',
  'sem_resposta', 'recusou', 'descartado',
] as const;
export type Status = (typeof STATUS)[number];

export const ROTULO_STATUS: Record<Status, string> = {
  encontrado: 'Encontrado',
  amostra_pronta: 'Amostra pronta',
  aguardando_aprovacao: 'Aguardando aprovação',
  abordado: 'Abordado',
  respondeu: 'Respondeu',
  negociando: 'Negociando',
  pago: 'Pago',
  entregue: 'Entregue',
  sem_resposta: 'Sem resposta',
  recusou: 'Recusou',
  descartado: 'Descartado',
};

/**
 * Transições que o agente pode pedir via PATCH. As automáticas (aguardando_aprovacao,
 * abordado, entregue, respondeu ao receber e-mail) são feitas pelo próprio sistema.
 * 'pago' só o investidor marca. O investidor pode forçar qualquer status pelo painel.
 */
const TRANSICOES_AGENTE: Partial<Record<Status, Status[]>> = {
  encontrado: ['amostra_pronta', 'descartado'],
  amostra_pronta: ['descartado'],
  abordado: ['respondeu', 'sem_resposta', 'recusou'],
  sem_resposta: ['respondeu', 'recusou'],
  respondeu: ['negociando', 'recusou'],
  negociando: ['recusou', 'sem_resposta'],
  recusou: ['negociando'],
};

export class RegraVioladaError extends Error {
  status = 422;
}

function falha(msg: string): never {
  throw new RegraVioladaError(msg);
}

export async function lerConfig(tx: Tx = db()) {
  const linhas = await tx<{ chave: string; valor: unknown }[]>`select chave, valor from config`;
  const c = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    gate_ativo: c.gate_ativo !== false,
    limite_diario: Number(c.limite_diario ?? 25),
    capital_inicial: Number(c.capital_inicial ?? 300),
    meta: Number(c.meta ?? 600),
    prazo: String(c.prazo ?? '2026-11-10'),
    inicio: String(c.inicio ?? '2026-10-10'),
    pix: c.pix ? String(c.pix) : null,
    assinatura: c.assinatura ? String(c.assinatura) : null,
  };
}
export type Config = Awaited<ReturnType<typeof lerConfig>>;

export async function gravarConfig(chave: string, valor: unknown) {
  const json = JSON.stringify(valor ?? null);
  await db()`insert into config (chave, valor) values (${chave}, ${json}::jsonb)
             on conflict (chave) do update set valor = excluded.valor`;
}

export async function transicionar(
  tx: Tx, leadId: number, para: Status, por: 'agente' | 'investidor' | 'sistema', motivo?: string | null,
) {
  const [lead] = await tx<{ status: Status }[]>`select status from leads where id = ${leadId} for update`;
  if (!lead) falha(`lead ${leadId} não existe`);
  if (lead.status === para) return;
  if (por === 'agente') {
    if (para === 'pago') falha('só o investidor marca um lead como pago');
    if (!TRANSICOES_AGENTE[lead.status]?.includes(para)) {
      falha(`transição ${lead.status} → ${para} não permitida ao agente`);
    }
  }
  await tx`update leads set status = ${para}, atualizado_em = now() where id = ${leadId}`;
  await tx`insert into transicoes (lead_id, de, para, por, motivo)
           values (${leadId}, ${lead.status}, ${para}, ${por}, ${motivo ?? null})`;
}

/** Bloqueado se o lead tem a flag ou se e-mail/telefone/place_id estão na lista permanente. */
export async function bloqueado(
  tx: Tx, dados: { email?: string | null; telefone?: string | null; place_id?: string | null },
) {
  const email = dados.email?.trim().toLowerCase() || null;
  const tel = soDigitos(dados.telefone);
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from nao_contatar
    where (${email}::text is not null and lower(email) = ${email})
       or (${tel}::text is not null and regexp_replace(coalesce(telefone,''), '\\D', '', 'g') = ${tel})
       or (${dados.place_id ?? null}::text is not null and place_id = ${dados.place_id ?? null})`;
  return r.n > 0;
}

export function soDigitos(t?: string | null) {
  const d = (t ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

export async function marcarNaoContatar(tx: Tx, leadId: number, motivo: string, por: 'agente' | 'investidor' | 'sistema') {
  const [lead] = await tx<{ email: string | null; telefone: string | null; place_id: string | null; status: Status }[]>`
    update leads set nao_contatar = true, atualizado_em = now() where id = ${leadId}
    returning email, telefone, place_id, status`;
  if (!lead) falha(`lead ${leadId} não existe`);
  await tx`insert into nao_contatar (email, telefone, place_id, motivo)
           values (${lead.email}, ${lead.telefone}, ${lead.place_id}, ${motivo})`;
  // Cancela tudo que ainda não saiu.
  await tx`update mensagens set status = 'rejeitada', motivo = 'pediu para não ser contatado'
           where lead_id = ${leadId} and status in ('aguardando_aprovacao', 'aprovada')`;
  if (!['pago', 'entregue', 'recusou'].includes(lead.status)) {
    await transicionar(tx, leadId, 'recusou', 'sistema', `não contatar: ${motivo}`);
  }
}

/** Abordagens + follow-ups (e-mails "frios") enviados hoje no horário de Brasília. */
export async function enviadosHoje(tx: Tx = db()) {
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from mensagens
    where direcao = 'saida' and status = 'enviada' and tipo in ('abordagem', 'follow_up')
      and enviada_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`;
  return r.n;
}

/** Quantos e-mails frios já estão aprovados e na fila (contam contra o limite do dia). */
export async function frioNaFila(tx: Tx = db()) {
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from mensagens
    where status = 'aprovada' and tipo in ('abordagem', 'follow_up')`;
  return r.n;
}

export const TIPOS_SAIDA = ['abordagem', 'follow_up', 'resposta', 'entrega'] as const;
export type TipoSaida = (typeof TIPOS_SAIDA)[number];

/**
 * Cria uma mensagem de saída. Com o portão ativo ela fica aguardando aprovação; sem ele já
 * entra aprovada e sai no próximo envio. Valida as regras de não-spam antes de gravar.
 */
export async function criarMensagem(
  leadId: number,
  dados: { tipo: TipoSaida; assunto?: string | null; corpo: string; canal?: 'email' | 'manual' },
) {
  return db().begin(async (tx) => {
    const [lead] = await tx<{
      id: number; status: Status; email: string | null; telefone: string | null; place_id: string | null;
      nao_contatar: boolean; amostra: string | null; entrega: string | null; pago: boolean;
    }[]>`select * from leads where id = ${leadId} for update`;
    if (!lead) falha(`lead ${leadId} não existe`);
    if (!TIPOS_SAIDA.includes(dados.tipo)) falha(`tipo inválido: ${dados.tipo}`);
    if (!dados.corpo?.trim()) falha('corpo vazio');
    const canal = dados.canal ?? 'email';
    if (canal === 'email' && !lead.email) falha('lead sem e-mail; use canal "manual" (só rascunho, envio manual)');
    if (lead.nao_contatar || (await bloqueado(tx, lead))) falha('lead está na lista de não contatar');

    const [cont] = await tx<{ abordagens: number; follow_ups: number; entradas: number }[]>`
      select count(*) filter (where tipo = 'abordagem' and status not in ('rejeitada', 'erro'))::int as abordagens,
             count(*) filter (where tipo = 'follow_up' and status not in ('rejeitada', 'erro'))::int as follow_ups,
             count(*) filter (where direcao = 'entrada')::int as entradas
      from mensagens where lead_id = ${leadId}`;

    if (dados.tipo === 'abordagem') {
      if (cont.abordagens > 0) falha('este lead já tem uma abordagem (regra: uma abordagem por negócio)');
      if (!lead.amostra?.trim()) falha('abordagem exige amostra pronta no lead');
      if (!dados.corpo.includes('{{amostra}}')) falha('abordagem precisa conter {{amostra}} (link da amostra)');
      if (!dados.assunto?.trim()) falha('abordagem precisa de assunto');
      if (!['encontrado', 'amostra_pronta'].includes(lead.status)) falha(`lead em ${lead.status} não pode ser abordado`);
    }
    if (dados.tipo === 'follow_up') {
      if (cont.abordagens === 0) falha('follow-up sem abordagem anterior');
      if (cont.follow_ups > 0) falha('este lead já recebeu o follow-up (regra: no máximo um)');
      if (cont.entradas > 0) falha('o lead já respondeu; use tipo "resposta"');
      if (lead.status !== 'abordado') falha(`follow-up só para leads abordados (está em ${lead.status})`);
    }
    if (dados.tipo === 'resposta' && cont.entradas === 0) falha('resposta só para quem já escreveu de volta');
    if (dados.tipo === 'entrega') {
      if (!lead.pago) falha('entrega só depois que o investidor marcar pago');
      if (!lead.entrega?.trim()) falha('grave o conteúdo da entrega no lead antes');
      if (!dados.corpo.includes('{{entrega}}')) falha('mensagem de entrega precisa conter {{entrega}} (link)');
    }

    const cfg = await lerConfig(tx);
    const status = cfg.gate_ativo || canal === 'manual' ? 'aguardando_aprovacao' : 'aprovada';
    const [msg] = await tx<{ id: number }[]>`
      insert into mensagens (lead_id, direcao, tipo, canal, assunto, corpo, status, para, aprovada_em)
      values (${leadId}, 'saida', ${dados.tipo}, ${canal}, ${dados.assunto ?? null}, ${dados.corpo}, ${status},
              ${canal === 'email' ? lead.email : lead.telefone}, ${status === 'aprovada' ? new Date() : null})
      returning id`;

    if (dados.tipo === 'abordagem') {
      if (lead.status === 'encontrado') await transicionar(tx, leadId, 'amostra_pronta', 'sistema');
      if (status === 'aguardando_aprovacao') await transicionar(tx, leadId, 'aguardando_aprovacao', 'sistema');
    }
    return { id: msg.id, status };
  });
}

export async function aprovarMensagem(id: number, edicao?: { assunto?: string | null; corpo?: string }) {
  return db().begin(async (tx) => {
    const [m] = await tx<{ status: string; tipo: string; corpo: string }[]>`select status, tipo, corpo from mensagens where id = ${id} for update`;
    if (!m) falha('mensagem não existe');
    if (m.status !== 'aguardando_aprovacao') falha(`mensagem está ${m.status}`);
    const corpo = edicao?.corpo?.trim() ? edicao.corpo : m.corpo;
    if (m.tipo === 'abordagem' && !corpo.includes('{{amostra}}')) falha('o texto precisa manter {{amostra}}');
    if (m.tipo === 'entrega' && !corpo.includes('{{entrega}}')) falha('o texto precisa manter {{entrega}}');
    await tx`update mensagens set status = 'aprovada', aprovada_em = now(), corpo = ${corpo},
               assunto = coalesce(${edicao?.assunto ?? null}, assunto)
             where id = ${id}`;
  });
}

/** Rejeita; a abordagem volta para amostra_pronta e o agente reescreve na próxima rodada. */
export async function rejeitarMensagem(id: number, motivo: string) {
  return db().begin(async (tx) => {
    const [m] = await tx<{ lead_id: number; tipo: string; status: string }[]>`
      update mensagens set status = 'rejeitada', motivo = ${motivo || 'sem motivo informado'}
      where id = ${id} and status in ('aguardando_aprovacao', 'aprovada') returning lead_id, tipo, status`;
    if (!m) falha('mensagem não está pendente');
    if (m.tipo === 'abordagem') {
      const [l] = await tx<{ status: Status }[]>`select status from leads where id = ${m.lead_id}`;
      if (l.status === 'aguardando_aprovacao') {
        await transicionar(tx, m.lead_id, 'amostra_pronta', 'investidor', `abordagem rejeitada: ${motivo}`);
      }
    }
  });
}

/** O investidor confirma que o pagamento caiu: marca pago e lança a receita no caixa. */
export async function marcarPago(leadId: number, valor: number) {
  if (!(valor > 0)) falha('valor inválido');
  return db().begin(async (tx) => {
    const [l] = await tx<{ pago: boolean; nome: string }[]>`select pago, nome from leads where id = ${leadId} for update`;
    if (!l) falha('lead não existe');
    if (l.pago) falha('já está marcado como pago');
    await tx`update leads set pago = true, pago_em = now(), valor = ${valor}, atualizado_em = now() where id = ${leadId}`;
    await transicionar(tx, leadId, 'pago', 'investidor');
    await tx`insert into caixa (tipo, valor, descricao, lead_id) values ('receita', ${valor}, ${'Venda: ' + l.nome}, ${leadId})`;
  });
}

export async function desfazerPago(leadId: number) {
  return db().begin(async (tx) => {
    await tx`update leads set pago = false, pago_em = null, atualizado_em = now() where id = ${leadId}`;
    await tx`delete from caixa where lead_id = ${leadId} and tipo = 'receita'`;
    await transicionar(tx, leadId, 'negociando', 'investidor', 'pagamento desmarcado');
  });
}

/** Regra: nenhum gasto antes da primeira venda. */
export async function pedirGasto(dados: { descricao: string; valor: number; justificativa: string }) {
  if (!dados.descricao?.trim() || !dados.justificativa?.trim()) falha('descrição e justificativa são obrigatórias');
  if (!(Number(dados.valor) > 0)) falha('valor inválido');
  const sql = db();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from caixa where tipo = 'receita'`;
  if (r.n === 0) falha('nenhum gasto antes da primeira venda');
  const [g] = await sql<{ id: number }[]>`
    insert into gastos (descricao, valor, justificativa) values (${dados.descricao}, ${dados.valor}, ${dados.justificativa})
    returning id`;
  return g;
}

export async function decidirGasto(id: number, aprovar: boolean) {
  return db().begin(async (tx) => {
    const [g] = await tx<{ descricao: string; valor: string }[]>`
      update gastos set status = ${aprovar ? 'aprovado' : 'negado'}, decidido_em = now()
      where id = ${id} and status = 'pendente' returning descricao, valor`;
    if (!g) falha('pedido não está pendente');
    if (aprovar) {
      await tx`insert into caixa (tipo, valor, descricao, gasto_id) values ('gasto', ${g.valor}, ${g.descricao}, ${id})`;
    }
  });
}

export async function saldo(tx: Tx = db()) {
  const [r] = await tx<{ capital: string; receita: string; gasto: string }[]>`
    select coalesce(sum(valor) filter (where tipo = 'capital'), 0) as capital,
           coalesce(sum(valor) filter (where tipo = 'receita'), 0) as receita,
           coalesce(sum(valor) filter (where tipo = 'gasto'), 0) as gasto
    from caixa`;
  const capital = Number(r.capital), receita = Number(r.receita), gasto = Number(r.gasto);
  return { capital, receita, gasto, saldo: capital + receita - gasto };
}

/** Canal manual (WhatsApp/Instagram): o investidor envia do próprio aparelho e confirma aqui. */
export async function confirmarEnvioManual(id: number, edicao?: { assunto?: string | null; corpo?: string }) {
  await aprovarMensagem(id, edicao);
  return db().begin(async (tx) => {
    const [m] = await tx<{ lead_id: number; tipo: string; canal: string }[]>`
      update mensagens set status = 'enviada', enviada_em = now()
      where id = ${id} and status = 'aprovada' and canal = 'manual' returning lead_id, tipo, canal`;
    if (!m) falha('mensagem não é de canal manual');
    const [l] = await tx<{ status: Status }[]>`select status from leads where id = ${m.lead_id}`;
    if (m.tipo === 'abordagem' && ['encontrado', 'amostra_pronta', 'aguardando_aprovacao'].includes(l.status)) {
      await transicionar(tx, m.lead_id, 'abordado', 'sistema', 'enviado manualmente');
    }
    if (m.tipo === 'entrega') await transicionar(tx, m.lead_id, 'entregue', 'sistema', 'enviado manualmente');
  });
}
