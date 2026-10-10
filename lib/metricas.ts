import { db } from './db';
import { enviadosHoje, frioNaFila, lerConfig, saldo } from './regras';

export type LinhaFunil = {
  grupo: string; leads: number; abordados: number; responderam: number; pagos: number; receita: number;
  taxa_resposta: number | null; taxa_fechamento: number | null; ticket_medio: number | null;
};

/** Funil por categoria ou bairro: taxa de resposta, fechamento e ticket médio. */
export async function funilPor(campo: 'categoria' | 'bairro'): Promise<LinhaFunil[]> {
  const sql = db();
  const linhas = await sql<{ grupo: string; leads: number; abordados: number; responderam: number; pagos: number; receita: string }[]>`
    select coalesce(nullif(${sql(campo)}, ''), '(sem)') as grupo,
           count(*)::int as leads,
           count(*) filter (where exists (select 1 from mensagens m where m.lead_id = l.id and m.tipo = 'abordagem' and m.status = 'enviada'))::int as abordados,
           count(*) filter (where exists (select 1 from mensagens m where m.lead_id = l.id and m.direcao = 'entrada'))::int as responderam,
           count(*) filter (where l.pago)::int as pagos,
           coalesce(sum(l.valor) filter (where l.pago), 0) as receita
    from leads l group by 1 order by abordados desc, leads desc`;
  return linhas.map((l) => {
    const receita = Number(l.receita);
    return {
      ...l,
      receita,
      taxa_resposta: l.abordados ? l.responderam / l.abordados : null,
      taxa_fechamento: l.abordados ? l.pagos / l.abordados : null,
      ticket_medio: l.pagos ? receita / l.pagos : null,
    };
  });
}

export async function resumo() {
  const sql = db();
  const cfg = await lerConfig();
  const caixa = await saldo();
  const porStatus = await sql<{ status: string; n: number }[]>`select status, count(*)::int as n from leads group by status`;
  const [m] = await sql<{ aguardando: number; abordagens_enviadas: number; abordagens_aprovadas: number; respostas: number; criadas_hoje: number }[]>`
    select count(*) filter (where status = 'aguardando_aprovacao')::int as aguardando,
           count(*) filter (where tipo = 'abordagem' and status <> 'rejeitada'
             and criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))::int as criadas_hoje,
           count(*) filter (where tipo = 'abordagem' and status = 'enviada')::int as abordagens_enviadas,
           count(*) filter (where tipo = 'abordagem' and status in ('aprovada', 'enviada'))::int as abordagens_aprovadas,
           count(*) filter (where direcao = 'entrada')::int as respostas
    from mensagens`;
  const [g] = await sql<{ n: number }[]>`select count(*)::int as n from gastos where status = 'pendente'`;
  const hoje = await enviadosHoje();
  const fila = await frioNaFila();
  const dias = Math.floor((new Date(`${cfg.prazo}T23:59:59-03:00`).getTime() - Date.now()) / 864e5);
  return {
    config: cfg,
    caixa,
    falta_para_meta: Math.max(0, cfg.meta - caixa.saldo),
    dias_restantes: dias,
    leads_por_status: Object.fromEntries(porStatus.map((s) => [s.status, s.n])),
    mensagens_aguardando_aprovacao: m.aguardando,
    abordagens_enviadas: m.abordagens_enviadas,
    abordagens_aprovadas: m.abordagens_aprovadas,
    respostas_recebidas: m.respostas,
    abordagens_criadas_hoje: m.criadas_hoje,
    gastos_pendentes: g.n,
    frios_enviados_hoje: hoje,
    frios_aprovados_na_fila: fila,
    limite_restante_hoje: Math.max(0, cfg.limite_diario - hoje),
  };
}

/** Tudo o que uma rodada do agente precisa saber, numa chamada só. */
export async function estadoParaAgente() {
  const sql = db();
  const base = await resumo();
  const conversas = await sql`
    select l.id, l.nome, l.status, l.email, l.valor, l.observacoes,
           (select json_agg(json_build_object('id', m.id, 'direcao', m.direcao, 'tipo', m.tipo, 'status', m.status,
                    'assunto', m.assunto, 'corpo', m.corpo, 'em', coalesce(m.recebida_em, m.enviada_em, m.criado_em))
                    order by coalesce(m.recebida_em, m.enviada_em, m.criado_em))
              from mensagens m where m.lead_id = l.id) as mensagens
    from leads l
    where l.status in ('respondeu', 'negociando') and not l.nao_contatar
      and not exists (select 1 from mensagens p where p.lead_id = l.id and p.direcao = 'saida'
                      and p.status in ('aguardando_aprovacao', 'aprovada')
                      and p.criado_em > (select max(recebida_em) from mensagens r where r.lead_id = l.id and r.direcao = 'entrada'))
    order by l.atualizado_em`;
  const paraEntregar = await sql`
    select id, nome, categoria, bairro, valor, (entrega is not null and entrega <> '') as entrega_gravada
    from leads l where status = 'pago'
      and not exists (select 1 from mensagens m where m.lead_id = l.id and m.tipo = 'entrega' and m.status <> 'rejeitada')`;
  const paraFollowUp = await sql`
    select l.id, l.nome, l.email, a.enviada_em as abordado_em
    from leads l join mensagens a on a.lead_id = l.id and a.tipo = 'abordagem' and a.status = 'enviada'
    where l.status = 'abordado' and not l.nao_contatar
      and a.enviada_em < now() - interval '3 days'
      and not exists (select 1 from mensagens f where f.lead_id = l.id and f.tipo = 'follow_up' and f.status <> 'rejeitada')
      and not exists (select 1 from mensagens r where r.lead_id = l.id and r.direcao = 'entrada')`;
  const semRespostaFinal = await sql`
    select l.id, l.nome from leads l join mensagens f on f.lead_id = l.id and f.tipo = 'follow_up' and f.status = 'enviada'
    where l.status = 'abordado' and f.enviada_em < now() - interval '4 days'
      and not exists (select 1 from mensagens r where r.lead_id = l.id and r.direcao = 'entrada')`;
  const rejeitadas = await sql`
    select m.id as mensagem_id, m.lead_id, l.nome, m.tipo, m.motivo, m.assunto, m.corpo
    from mensagens m join leads l on l.id = m.lead_id
    where m.status = 'rejeitada' and m.motivo is distinct from 'lista de não contatar'
      and m.motivo is distinct from 'pediu para não ser contatado'
      and not l.nao_contatar
      and not exists (select 1 from mensagens n where n.lead_id = m.lead_id and n.tipo = m.tipo and n.id > m.id)
    order by m.id desc limit 30`;
  const semAbordagem = await sql`
    select id, nome, status, categoria, bairro, (amostra is not null and amostra <> '') as tem_amostra, (email is not null) as tem_email
    from leads l where status in ('encontrado', 'amostra_pronta') and not nao_contatar
      and not exists (select 1 from mensagens m where m.lead_id = l.id and m.tipo = 'abordagem' and m.status <> 'rejeitada')
    order by criado_em`;
  const erros = await sql`
    select m.id, m.lead_id, m.tipo, m.motivo from mensagens m where m.status = 'erro' order by m.id desc limit 20`;
  const gastos = await sql`select id, descricao, valor, status, pedido_em, decidido_em from gastos order by id desc limit 10`;
  const [ultimaRevisao] = await sql`select semana, em from revisoes order by em desc limit 1`;
  const ultimasRodadas = await sql`select resumo, em from rodadas order by em desc limit 3`;
  return {
    agora: new Date().toISOString(),
    ...base,
    conversas_para_responder: conversas,
    pagos_para_entregar: paraEntregar,
    follow_up_pendente: paraFollowUp,
    marcar_sem_resposta: semRespostaFinal,
    mensagens_rejeitadas_para_refazer: rejeitadas,
    leads_sem_abordagem: semAbordagem,
    mensagens_com_erro: erros,
    gastos,
    ultima_revisao: ultimaRevisao ?? null,
    ultimas_rodadas: ultimasRodadas,
  };
}
