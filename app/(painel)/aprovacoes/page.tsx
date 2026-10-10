import Link from 'next/link';
import { db } from '@/lib/db';
import { montarCorpo } from '@/lib/email';
import { aprovar, rejeitar } from '../acoes';
import { Aviso } from '../aviso';

export const dynamic = 'force-dynamic';

type Pendente = {
  id: number; lead_id: number; tipo: string; canal: string; assunto: string | null; corpo: string; para: string | null;
  criado_em: Date; nome: string; bairro: string | null; categoria: string | null; token: string; diagnostico: string | null;
  nota: string | null; num_avaliacoes: number | null; maps_url: string | null;
};

const ROTULO_TIPO: Record<string, string> = {
  abordagem: 'Abordagem', follow_up: 'Follow-up', resposta: 'Resposta', entrega: 'Entrega',
};

export default async function Aprovacoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const pendentes = await db()<Pendente[]>`
    select m.id, m.lead_id, m.tipo, m.canal, m.assunto, m.corpo, m.para, m.criado_em,
           l.nome, l.bairro, l.categoria, l.token, l.diagnostico, l.nota, l.num_avaliacoes, l.maps_url
    from mensagens m join leads l on l.id = m.lead_id
    where m.status = 'aguardando_aprovacao'
    order by case m.tipo when 'resposta' then 0 when 'entrega' then 1 when 'follow_up' then 2 else 3 end, m.criado_em`;

  return (
    <>
      <Aviso {...sp} />
      <h1>Aprovações <span className="muted small">({pendentes.length})</span></h1>
      <p className="muted small">
        Nada sai sem o seu ok enquanto o portão estiver ativo. Aprovadas saem na próxima rodada do agente
        (ou em Config → Enviar agora). Você pode editar o texto antes de aprovar; mantenha os marcadores
        <span className="mono"> {'{{amostra}}'}</span> e <span className="mono">{'{{entrega}}'}</span>, que viram links.
      </p>
      {pendentes.length === 0 && <div className="card muted">Nada aguardando aprovação.</div>}

      {pendentes.map((m) => (
        <article key={m.id} className="card">
          <div className="linha-form" style={{ justifyContent: 'space-between' }}>
            <div>
              <span className="chip">{ROTULO_TIPO[m.tipo] ?? m.tipo}</span>{' '}
              {m.canal === 'manual' && <span className="chip s-aguardando_aprovacao">envio manual</span>}{' '}
              <Link href={`/leads/${m.lead_id}`} className="nome">{m.nome}</Link>
              <span className="muted small"> · {[m.categoria, m.bairro].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="small muted">para {m.para ?? '—'}</span>
          </div>

          {m.diagnostico && (
            <p className="small muted" style={{ marginTop: 8 }}>
              <strong>Diagnóstico:</strong> {m.diagnostico}
              {m.nota && <> · {m.nota}★ ({m.num_avaliacoes} avaliações)</>}
              {m.maps_url && <> · <a href={m.maps_url} target="_blank" rel="noreferrer">Maps</a></>}
            </p>
          )}

          {m.tipo === 'abordagem' && (
            <p className="small"><a href={`/a/${m.token}`} target="_blank">Ver a amostra que o cliente vai receber →</a></p>
          )}

          <h3 style={{ marginTop: 12 }}>{m.assunto ?? '(assunto automático: Re: …)'}</h3>
          <div className="corpo-email">{montarCorpo(m.corpo, m.token, m.tipo)}</div>

          <form action={aprovar}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="canal" value={m.canal} />
            <details>
              <summary className="small">Editar antes de aprovar</summary>
              <label htmlFor={`a-${m.id}`}>Assunto</label>
              <input id={`a-${m.id}`} name="assunto" defaultValue={m.assunto ?? ''} />
              <label htmlFor={`c-${m.id}`}>Texto</label>
              <textarea id={`c-${m.id}`} name="corpo" defaultValue={m.corpo} />
            </details>
            <div className="acoes">
              <button className="primario" type="submit">
                {m.canal === 'manual' ? 'Já enviei pelo WhatsApp/Instagram' : 'Aprovar envio'}
              </button>
            </div>
          </form>
          <form action={rejeitar} className="linha-form" style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={m.id} />
            <input name="motivo" placeholder="Motivo da rejeição (o agente usa para refazer)" aria-label="Motivo da rejeição" />
            <button className="perigo" type="submit">Rejeitar</button>
          </form>
        </article>
      ))}
    </>
  );
}
