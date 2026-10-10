// Envio por SMTP (Gmail com senha de app, por padrão). Roda na Vercel.
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { bloqueado, enviadosHoje, lerConfig, transicionar, type Status } from './regras';

export function urlBase() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return u.replace(/\/$/, '');
}

function transporte() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP_USER/SMTP_PASS não configurados');
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/** Troca os marcadores e acrescenta o rodapé de descadastro (LGPD) em toda mensagem fria. */
export function montarCorpo(corpo: string, token: string, tipo: string) {
  const base = urlBase();
  let texto = corpo
    .replaceAll('{{amostra}}', `${base}/a/${token}`)
    .replaceAll('{{entrega}}', `${base}/e/${token}`);
  if (tipo === 'abordagem' || tipo === 'follow_up') {
    texto += `\n\n--\nSe não quiser receber mais mensagens, responda "não" ou acesse ${base}/sair/${token}`;
  }
  return texto;
}

type Fila = {
  id: number; lead_id: number; tipo: string; assunto: string | null; corpo: string; para: string;
  token: string; nao_contatar: boolean; email: string | null; telefone: string | null; place_id: string | null;
  lead_status: Status;
};

/**
 * Envia as mensagens aprovadas (canal e-mail), respeitando o limite diário de e-mails frios
 * e a lista de não contatar. Respostas e entregas não contam no limite.
 */
export async function enviarAprovadas() {
  const sql = db();
  const cfg = await lerConfig();
  let restante = cfg.limite_diario - (await enviadosHoje());
  const fila = await sql<Fila[]>`
    select m.id, m.lead_id, m.tipo, m.assunto, m.corpo, m.para, l.token, l.nao_contatar, l.email, l.telefone,
           l.place_id, l.status as lead_status
    from mensagens m join leads l on l.id = m.lead_id
    where m.status = 'aprovada' and m.canal = 'email'
    order by case when m.tipo in ('resposta', 'entrega') then 0 else 1 end, m.aprovada_em`;

  const resultado = { enviadas: [] as number[], adiadas: [] as number[], bloqueadas: [] as number[], erros: [] as { id: number; erro: string }[] };
  if (fila.length === 0) return { ...resultado, limite_restante: restante };

  const smtp = transporte();
  const remetente = process.env.SMTP_FROM_NAME ? `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>` : process.env.SMTP_USER!;
  const dominio = process.env.SMTP_USER!.split('@')[1] ?? 'localhost';

  for (const m of fila) {
    const fria = m.tipo === 'abordagem' || m.tipo === 'follow_up';
    if (m.nao_contatar || (await bloqueado(sql, m))) {
      await sql`update mensagens set status = 'rejeitada', motivo = 'lista de não contatar' where id = ${m.id}`;
      resultado.bloqueadas.push(m.id);
      continue;
    }
    if (fria && restante <= 0) {
      resultado.adiadas.push(m.id);
      continue;
    }

    // Encadeia com a última mensagem da conversa (de qualquer lado).
    const [anterior] = await sql<{ message_id: string; assunto: string | null }[]>`
      select message_id, assunto from mensagens
      where lead_id = ${m.lead_id} and message_id is not null and id <> ${m.id}
      order by coalesce(recebida_em, enviada_em) desc nulls last limit 1`;
    const [primeira] = await sql<{ assunto: string | null }[]>`
      select assunto from mensagens where lead_id = ${m.lead_id} and tipo = 'abordagem' and status = 'enviada' limit 1`;
    const assunto = m.assunto?.trim() || (primeira?.assunto ? `Re: ${primeira.assunto.replace(/^re:\s*/i, '')}` : 'Contato');
    const messageId = `<${randomUUID()}@${dominio}>`;
    const base = urlBase();

    // Reserva a mensagem antes de enviar: se outra execução (rodada x botão do painel) chegar
    // junto, só uma consegue e o e-mail não sai duas vezes.
    const [reservada] = await sql`
      update mensagens set status = 'enviada', enviada_em = now(), message_id = ${messageId},
             in_reply_to = ${anterior?.message_id ?? null}, assunto = ${assunto}, de = ${process.env.SMTP_USER!}
      where id = ${m.id} and status = 'aprovada' returning id`;
    if (!reservada) continue;

    try {
      await smtp.sendMail({
        from: remetente,
        to: m.para,
        subject: assunto,
        text: montarCorpo(m.corpo, m.token, m.tipo),
        messageId,
        inReplyTo: anterior?.message_id,
        references: anterior?.message_id ? [anterior.message_id] : undefined,
        headers: fria ? {
          'List-Unsubscribe': `<mailto:${process.env.SMTP_USER}?subject=nao>, <${base}/sair/${m.token}>`,
        } : undefined,
      });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await sql`update mensagens set status = 'erro', motivo = ${erro.slice(0, 500)}, enviada_em = null, message_id = null
                where id = ${m.id}`;
      if (m.tipo === 'abordagem' && m.lead_status === 'aguardando_aprovacao') {
        // Libera o lead para uma nova abordagem (ex.: após corrigir o e-mail).
        await sql.begin((tx) => transicionar(tx, m.lead_id, 'amostra_pronta', 'sistema', 'falha no envio'));
      }
      resultado.erros.push({ id: m.id, erro });
      continue;
    }

    await sql.begin(async (tx) => {
      if (m.tipo === 'abordagem' && ['encontrado', 'amostra_pronta', 'aguardando_aprovacao'].includes(m.lead_status)) {
        await transicionar(tx, m.lead_id, 'abordado', 'sistema');
      }
      if (m.tipo === 'entrega') await transicionar(tx, m.lead_id, 'entregue', 'sistema');
    });
    if (fria) restante--;
    resultado.enviadas.push(m.id);
  }
  return { ...resultado, limite_restante: restante };
}
