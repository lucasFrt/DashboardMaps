import Link from 'next/link';
import { db } from '@/lib/db';
import { brl, dataHora } from '@/lib/formato';
import { resumo } from '@/lib/metricas';
import { ROTULO_STATUS, STATUS } from '@/lib/regras';
import { Aviso } from './aviso';

export const dynamic = 'force-dynamic';

export default async function Resumo({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const r = await resumo();
  const sql = db();
  const paraEntregar = await sql<{ n: number }[]>`select count(*)::int as n from leads where status = 'pago'`;
  const rodadas = await sql<{ resumo: string; em: Date }[]>`select resumo, em from rodadas order by em desc limit 5`;
  const progresso = Math.min(100, Math.max(0, ((r.caixa.saldo - r.config.capital_inicial) / (r.config.meta - r.config.capital_inicial)) * 100));

  return (
    <>
      <Aviso {...sp} />
      <h1>Resumo</h1>

      <div className="card">
        <div className="kpi">
          <div className="rotulo">Saldo em caixa</div>
          <div className="valor">{brl(r.caixa.saldo)} <span className="muted small">de {brl(r.config.meta)}</span></div>
        </div>
        <div className="barra" aria-label={`Progresso ${progresso.toFixed(0)}%`}><span style={{ width: `${progresso}%` }} /></div>
        <div className="small muted">
          Faltam {brl(r.falta_para_meta)} · {r.dias_restantes} dias até {r.config.prazo.split('-').reverse().join('/')}
          {' · '}receitas {brl(r.caixa.receita)} · gastos {brl(r.caixa.gasto)}
        </div>
      </div>

      {(r.mensagens_aguardando_aprovacao > 0 || r.gastos_pendentes > 0 || paraEntregar[0].n > 0) && (
        <div className="card alerta">
          <h3>Precisa de você</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {r.mensagens_aguardando_aprovacao > 0 && (
              <li><Link href="/aprovacoes">{r.mensagens_aguardando_aprovacao} mensagem(ns) aguardando aprovação</Link></li>
            )}
            {r.gastos_pendentes > 0 && <li><Link href="/caixa">{r.gastos_pendentes} pedido(s) de gasto</Link></li>}
            {paraEntregar[0].n > 0 && (
              <li><Link href="/leads?status=pago">{paraEntregar[0].n} pago(s) aguardando entrega</Link> <span className="muted">(o agente cuida)</span></li>
            )}
          </ul>
        </div>
      )}

      <div className="grade">
        <div className="card kpi"><div className="rotulo">Abordagens enviadas</div><div className="valor">{r.abordagens_enviadas}</div></div>
        <div className="card kpi"><div className="rotulo">Respostas</div><div className="valor">{r.respostas_recebidas}</div></div>
        <div className="card kpi"><div className="rotulo">Vendas</div><div className="valor">{(r.leads_por_status.pago ?? 0) + (r.leads_por_status.entregue ?? 0)}</div></div>
        <div className="card kpi">
          <div className="rotulo">E-mails frios hoje</div>
          <div className="valor">{r.frios_enviados_hoje}<span className="muted small"> / {r.config.limite_diario}</span></div>
        </div>
      </div>

      <div className="card">
        <h3>Pipeline</h3>
        <div className="filtros">
          {STATUS.map((s) => (
            <Link key={s} href={`/leads?status=${s}`}>
              <span className={`chip s-${s}`}>{ROTULO_STATUS[s]} · {r.leads_por_status[s] ?? 0}</span>
            </Link>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Portão de aprovação: <strong>{r.config.gate_ativo ? 'ativo' : 'desligado'}</strong>
          {' '}({r.abordagens_aprovadas} abordagens aprovadas até agora; a regra pede ~20 antes de desligar).{' '}
          <Link href="/config">Alterar</Link>
        </p>
      </div>

      <h2>Últimas rodadas do agente</h2>
      {rodadas.length === 0 && <p className="muted">Nenhuma rodada registrada ainda.</p>}
      {rodadas.map((x, i) => (
        <div key={i} className="card">
          <div className="small muted">{dataHora(x.em)}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{x.resumo}</div>
        </div>
      ))}
    </>
  );
}
