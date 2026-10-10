import Link from 'next/link';
import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import { montarCorpo } from '@/lib/email';
import { brl, dataHora } from '@/lib/formato';
import { lerLead } from '@/lib/leads';
import { ROTULO_STATUS, STATUS, type Status } from '@/lib/regras';
import { desfazerPagamento, naoContatar, pago, salvarLead } from '../../acoes';
import { Aviso } from '../../aviso';

export const dynamic = 'force-dynamic';

type Msg = {
  id: number; direcao: string; tipo: string; canal: string; status: string; assunto: string | null; corpo: string;
  motivo: string | null; para: string | null; de: string | null; criado_em: Date; enviada_em: Date | null; recebida_em: Date | null;
};
type Lead = {
  id: number; nome: string; bairro: string | null; categoria: string | null; maps_url: string | null; endereco: string | null;
  email: string | null; telefone: string | null; instagram: string | null; site: string | null; nota: string | null;
  num_avaliacoes: number | null; diagnostico: string | null; amostra: string | null; entrega: string | null; token: string;
  status: Status; valor: string | null; pago: boolean; pago_em: Date | null; nao_contatar: boolean; observacoes: string | null;
  mensagens: Msg[]; transicoes: { de: string | null; para: string; por: string; motivo: string | null; em: Date }[];
};

export default async function LeadDetalhe({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  let l: Lead;
  try {
    l = (await lerLead(n)) as unknown as Lead;
  } catch {
    notFound();
  }

  return (
    <>
      <Aviso {...sp} />
      <p className="small"><Link href="/leads">← Leads</Link></p>
      <h1>{l.nome}</h1>
      <p>
        <span className={`chip s-${l.status}`}>{ROTULO_STATUS[l.status]}</span>{' '}
        {l.pago && <span className="chip s-pago">pago {brl(l.valor)}</span>}{' '}
        {l.nao_contatar && <span className="chip s-recusou">não contatar</span>}
      </p>

      <div className="card">
        <p className="small" style={{ margin: 0 }}>
          {[l.categoria, l.bairro, l.endereco].filter(Boolean).join(' · ')}
          {l.nota && <> · {l.nota}★ ({l.num_avaliacoes} avaliações)</>}
        </p>
        <p className="small" style={{ margin: '6px 0 0' }}>
          {l.email && <>✉ {l.email} </>}
          {l.telefone && <>· ☎ {l.telefone} </>}
          {l.instagram && <>· IG {l.instagram} </>}
          {l.site && <>· <a href={l.site} target="_blank" rel="noreferrer">site</a> </>}
          {l.maps_url && <>· <a href={l.maps_url} target="_blank" rel="noreferrer">Google Maps</a></>}
        </p>
        {l.diagnostico && <p style={{ margin: '10px 0 0' }}><strong>Diagnóstico:</strong> {l.diagnostico}</p>}
      </div>

      {!l.pago ? (
        <form action={pago} className="card">
          <h3>O pagamento caiu?</h3>
          <input type="hidden" name="id" value={l.id} />
          <div className="linha-form">
            <input name="valor" inputMode="decimal" defaultValue={l.valor ? String(Number(l.valor)).replace('.', ',') : '120'} aria-label="Valor recebido (R$)" />
            <button className="primario" type="submit">Marcar como pago</button>
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>Lança a receita no caixa; o agente gera e envia a entrega na próxima rodada.</p>
        </form>
      ) : (
        <form action={desfazerPagamento} className="card">
          <input type="hidden" name="id" value={l.id} />
          <span className="small">Pago em {dataHora(l.pago_em)} · {brl(l.valor)}</span>{' '}
          <button type="submit" className="perigo">Desfazer</button>
        </form>
      )}

      <h2>Mensagens</h2>
      {l.mensagens.length === 0 && <p className="muted">Nenhuma ainda.</p>}
      {l.mensagens.map((m) => (
        <div key={m.id} className={`msg ${m.direcao} ${m.status}`}>
          <div className="small muted">
            {m.direcao === 'entrada' ? `Recebida de ${m.de}` : `${m.tipo} → ${m.para ?? '—'}`}
            {' · '}{m.status}{m.canal === 'manual' && ' (manual)'}
            {' · '}{dataHora(m.recebida_em ?? m.enviada_em ?? m.criado_em)}
            {m.motivo && <> · <em>{m.motivo}</em></>}
          </div>
          {m.assunto && <strong>{m.assunto}</strong>}
          <div className="corpo-email">{m.direcao === 'saida' ? montarCorpo(m.corpo, l.token, m.tipo) : m.corpo}</div>
        </div>
      ))}

      {l.amostra && (
        <details className="card">
          <summary>Amostra · <a href={`/a/${l.token}`} target="_blank">página pública</a></summary>
          <div className="md"><Markdown>{l.amostra}</Markdown></div>
        </details>
      )}
      {l.entrega && (
        <details className="card">
          <summary>Entrega · <a href={`/e/${l.token}`} target="_blank">página pública</a></summary>
          <div className="md"><Markdown>{l.entrega}</Markdown></div>
        </details>
      )}

      <form action={salvarLead} className="card">
        <h3>Ajustes</h3>
        <input type="hidden" name="id" value={l.id} />
        <label htmlFor="status">Forçar status</label>
        <select id="status" name="status" defaultValue="">
          <option value="">(manter {ROTULO_STATUS[l.status]})</option>
          {STATUS.filter((s) => s !== 'pago').map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
        </select>
        <label htmlFor="obs">Observações (o agente lê)</label>
        <textarea id="obs" name="observacoes" defaultValue={l.observacoes ?? ''} style={{ minHeight: 90 }} />
        <div className="acoes"><button type="submit">Salvar</button></div>
      </form>

      {!l.nao_contatar && (
        <form action={naoContatar} className="card">
          <p className="small" style={{ margin: 0 }}>Pediu para não ser contatado? Isso cancela mensagens pendentes e bloqueia para sempre.</p>
          <input type="hidden" name="id" value={l.id} />
          <div className="acoes"><button type="submit" className="perigo">Nunca mais contatar</button></div>
        </form>
      )}

      <details className="card">
        <summary>Histórico de status</summary>
        <table>
          <tbody>
            {l.transicoes.map((t, i) => (
              <tr key={i}>
                <td className="small">{dataHora(t.em)}</td>
                <td>{t.de ? `${t.de} → ` : ''}{t.para}</td>
                <td className="small muted">{t.por}{t.motivo ? ` · ${t.motivo}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
