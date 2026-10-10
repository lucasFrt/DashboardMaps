import { db } from './db';
import { bloqueado, RegraVioladaError, STATUS, transicionar, type Status } from './regras';

/** Campos que o agente pode gravar. pago, nao_contatar e token ficam de fora de propósito. */
export const CAMPOS_EDITAVEIS = [
  'place_id', 'nome', 'bairro', 'categoria', 'maps_url', 'endereco', 'email', 'telefone', 'instagram', 'site',
  'nota', 'num_avaliacoes', 'diagnostico', 'amostra', 'entrega', 'valor', 'observacoes',
] as const;

function filtrar(dados: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const c of CAMPOS_EDITAVEIS) {
    if (c in dados) {
      const v = dados[c];
      out[c] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null;
    }
  }
  if (typeof out.email === 'string') out.email = out.email.toLowerCase();
  return out;
}

export async function criarLead(dados: Record<string, unknown>) {
  const campos = filtrar(dados);
  if (!campos.nome) throw new RegraVioladaError('nome é obrigatório');
  return db().begin(async (tx) => {
    if (await bloqueado(tx, campos as never)) throw new RegraVioladaError('negócio está na lista de não contatar');
    if (campos.place_id) {
      const [ja] = await tx`select id, status from leads where place_id = ${campos.place_id as string}`;
      if (ja) throw new RegraVioladaError(`já existe no painel: lead ${ja.id} (${ja.status})`);
    }
    if (campos.email) {
      const [ja] = await tx`select id, status from leads where lower(email) = ${campos.email as string}`;
      if (ja) throw new RegraVioladaError(`e-mail já usado pelo lead ${ja.id} (${ja.status})`);
    }
    const [lead] = await tx<{ id: number; token: string }[]>`
      insert into leads ${tx(campos as Record<string, never>)} returning id, token`;
    await tx`insert into transicoes (lead_id, de, para, por) values (${lead.id}, null, 'encontrado', 'agente')`;
    const status = dados.status as Status | undefined;
    if (status && status !== 'encontrado') await transicionar(tx, lead.id, status, 'agente', dados.motivo as string);
    return lead;
  });
}

export async function atualizarLead(id: number, dados: Record<string, unknown>, por: 'agente' | 'investidor') {
  const campos = filtrar(dados);
  return db().begin(async (tx) => {
    const [l] = await tx`select id from leads where id = ${id} for update`;
    if (!l) throw new RegraVioladaError(`lead ${id} não existe`);
    if (Object.keys(campos).length) {
      await tx`update leads set ${tx(campos as Record<string, never>)}, atualizado_em = now() where id = ${id}`;
    }
    if (dados.status) {
      const s = dados.status as Status;
      if (!STATUS.includes(s)) throw new RegraVioladaError(`status inválido: ${s}`);
      await transicionar(tx, id, s, por, (dados.motivo as string) ?? null);
    }
    return { id };
  });
}

export async function lerLead(id: number) {
  const sql = db();
  const [lead] = await sql`select * from leads where id = ${id}`;
  if (!lead) throw new RegraVioladaError(`lead ${id} não existe`);
  const mensagens = await sql`select * from mensagens where lead_id = ${id} order by coalesce(recebida_em, enviada_em, criado_em), id`;
  const transicoes = await sql`select de, para, por, motivo, em from transicoes where lead_id = ${id} order by em, id`;
  return { ...lead, mensagens, transicoes };
}

export async function listarLeads(f: { status?: string | null; q?: string | null; limite?: number }) {
  const sql = db();
  const q = f.q ? `%${f.q}%` : null;
  return sql`
    select id, nome, bairro, categoria, status, email, telefone, nota, num_avaliacoes, valor, pago, nao_contatar, atualizado_em
    from leads
    where (${f.status ?? null}::text is null or status = ${f.status ?? null})
      and (${q}::text is null or nome ilike ${q} or bairro ilike ${q} or categoria ilike ${q})
    order by atualizado_em desc limit ${f.limite ?? 200}`;
}
