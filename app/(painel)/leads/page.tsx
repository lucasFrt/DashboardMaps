import Link from 'next/link';
import { listarLeads } from '@/lib/leads';
import { ROTULO_STATUS, STATUS, type Status } from '@/lib/regras';

export const dynamic = 'force-dynamic';

type Linha = { id: number; nome: string; bairro: string | null; categoria: string | null; status: Status; nota: string | null; num_avaliacoes: number | null; nao_contatar: boolean };

export default async function Leads({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = STATUS.includes(sp.status as Status) ? sp.status! : null;
  const leads = (await listarLeads({ status, q: sp.q || null })) as unknown as Linha[];
  return (
    <>
      <h1>Leads <span className="muted small">({leads.length})</span></h1>
      <form className="linha-form" style={{ marginBottom: 12 }}>
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nome, bairro ou categoria" aria-label="Buscar" />
        <button type="submit">Buscar</button>
      </form>
      <div className="filtros">
        <Link href="/leads" className={!status ? 'ativo' : undefined}><span className="chip">Todos</span></Link>
        {STATUS.map((s) => (
          <Link key={s} href={`/leads?status=${s}`} className={status === s ? 'ativo' : undefined}>
            <span className="chip">{ROTULO_STATUS[s]}</span>
          </Link>
        ))}
      </div>
      <div className="card">
        {leads.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhum lead aqui.</p>}
        <ul className="lista">
          {leads.map((l) => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="linha">
                <span>
                  <span className="nome">{l.nome}</span>
                  <br />
                  <span className="small muted">
                    {[l.categoria, l.bairro].filter(Boolean).join(' · ')}
                    {l.nota && ` · ${l.nota}★ (${l.num_avaliacoes ?? 0})`}
                    {l.nao_contatar && ' · não contatar'}
                  </span>
                </span>
                <span className={`chip s-${l.status}`}>{ROTULO_STATUS[l.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
