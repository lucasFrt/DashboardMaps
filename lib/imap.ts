// Leitura de respostas por IMAP. Só guarda e-mails de leads conhecidos (LGPD: nada de terceiros).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db } from './db';
import { gravarConfig, transicionar, type Status } from './regras';

type Estado = { uidValidity: string; ultimoUid: number };

export async function lerRespostas() {
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('IMAP_USER/IMAP_PASS (ou SMTP_*) não configurados');
  const sql = db();
  const [linha] = await sql<{ valor: Estado }[]>`select valor from config where chave = 'imap_estado'`;
  const estado = linha?.valor;

  const cliente = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  await cliente.connect();
  const novas: { lead_id: number; nome: string; mensagem_id: number; de: string; assunto: string | null }[] = [];
  const ignoradas = { desconhecidas: 0, bounces: 0 };
  let novoEstado: Estado | undefined;

  try {
    const caixa = await cliente.mailboxOpen('INBOX', { readOnly: true });
    const validade = String(caixa.uidValidity);
    let desde = estado && estado.uidValidity === validade ? estado.ultimoUid + 1 : 0;
    if (!desde) {
      // Primeira leitura: só os últimos 14 dias, para não importar a caixa inteira.
      const uids = (await cliente.search({ since: new Date(Date.now() - 14 * 864e5) }, { uid: true })) || [];
      desde = uids.length ? Math.min(...uids) : (caixa.uidNext ?? 1);
    }
    let maior = desde - 1;

    for await (const msg of cliente.fetch(`${desde}:*`, { uid: true, source: true }, { uid: true })) {
      if (msg.uid < desde) continue; // "N:*" sempre devolve ao menos a última mensagem
      maior = Math.max(maior, msg.uid);
      if (!msg.source) continue;
      const email = await simpleParser(msg.source);
      const de = email.from?.value[0]?.address?.toLowerCase() ?? '';
      const refs = [email.inReplyTo, ...(Array.isArray(email.references) ? email.references : email.references ? [email.references] : [])]
        .filter((r): r is string => !!r);
      const messageId = email.messageId ?? null;
      if (messageId) {
        const [ja] = await sql`select 1 from mensagens where message_id = ${messageId}`;
        if (ja) continue;
      }

      if (/mailer-daemon|postmaster/i.test(de)) {
        // Bounce: tenta achar qual mensagem nossa voltou.
        const texto = `${email.text ?? ''}`;
        const ids = [...texto.matchAll(/<[^<>\s]+@[^<>\s]+>/g)].map((x) => x[0]);
        if (ids.length) {
          await sql`update mensagens set status = 'erro', motivo = 'e-mail voltou (bounce)'
                    where message_id in ${sql(ids)} and status = 'enviada'`;
        }
        ignoradas.bounces++;
        continue;
      }

      const [lead] = await sql<{ id: number; nome: string; status: Status }[]>`
        select l.id, l.nome, l.status from leads l
        where lower(l.email) = ${de}
           or exists (select 1 from mensagens m where m.lead_id = l.id and m.message_id in ${sql(refs.length ? refs : ['-'])})
        order by l.atualizado_em desc limit 1`;
      if (!lead) {
        ignoradas.desconhecidas++;
        continue;
      }

      const corpo = (email.text || '').slice(0, 20000) || '(sem texto)';
      await sql.begin(async (tx) => {
        const [m] = await tx<{ id: number }[]>`
          insert into mensagens (lead_id, direcao, tipo, canal, assunto, corpo, status, message_id, in_reply_to, de, para, recebida_em)
          values (${lead.id}, 'entrada', 'recebida', 'email', ${email.subject ?? null}, ${corpo}, 'recebida',
                  ${messageId}, ${email.inReplyTo ?? null}, ${de}, ${user}, ${email.date ?? new Date()})
          returning id`;
        if (['abordado', 'sem_resposta', 'aguardando_aprovacao', 'amostra_pronta'].includes(lead.status)) {
          await transicionar(tx, lead.id, 'respondeu', 'sistema', 'e-mail recebido');
        }
        novas.push({ lead_id: lead.id, nome: lead.nome, mensagem_id: m.id, de, assunto: email.subject ?? null });
      });
    }
    novoEstado = { uidValidity: validade, ultimoUid: Math.max(maior, estado?.uidValidity === validade ? estado.ultimoUid : 0) };
  } finally {
    await cliente.logout().catch(() => {});
  }
  if (novoEstado) await gravarConfig('imap_estado', novoEstado);
  return { novas, ignoradas };
}
