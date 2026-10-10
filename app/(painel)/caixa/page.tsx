import { db } from '@/lib/db';
import { brl, dataHora } from '@/lib/formato';
import { saldo } from '@/lib/regras';
import { gasto, lancamento } from '../acoes';
import { Aviso } from '../aviso';

export const dynamic = 'force-dynamic';

export default async function Caixa({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const sql = db();
  const s = await saldo();
  const pendentes = await sql<{ id: number; descricao: string; valor: string; justificativa: string; pedido_em: Date }[]>`
    select * from gastos where status = 'pendente' order by pedido_em`;
  const decididos = await sql<{ id: number; descricao: string; valor: string; status: string; decidido_em: Date }[]>`
    select * from gastos where status <> 'pendente' order by decidido_em desc limit 20`;
  const lancs = await sql<{ id: number; tipo: string; valor: string; descricao: string; em: Date }[]>`
    select * from caixa order by em desc, id desc limit 100`;

  return (
    <>
      <Aviso {...sp} />
      <h1>Caixa</h1>
      <div className="grade">
        <div className="card kpi"><div className="rotulo">Saldo</div><div className="valor">{brl(s.saldo)}</div></div>
        <div className="card kpi"><div className="rotulo">Capital</div><div className="valor">{brl(s.capital)}</div></div>
        <div className="card kpi"><div className="rotulo">Receitas</div><div className="valor">{brl(s.receita)}</div></div>
        <div className="card kpi"><div className="rotulo">Gastos</div><div className="valor">{brl(s.gasto)}</div></div>
      </div>

      <h2>Pedidos de gasto</h2>
      {pendentes.length === 0 && <p className="muted">Nenhum pedido pendente. Regra: nenhum gasto antes da primeira venda.</p>}
      {pendentes.map((g) => (
        <div key={g.id} className="card alerta">
          <strong>{g.descricao}</strong> · <span className="num">{brl(g.valor)}</span>
          <p className="small" style={{ margin: '6px 0 0' }}>{g.justificativa}</p>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Pedido em {dataHora(g.pedido_em)}</p>
          <form action={gasto} className="acoes">
            <input type="hidden" name="id" value={g.id} />
            <button className="primario" name="decisao" value="aprovar" type="submit">Aprovar (vou pagar)</button>
            <button className="perigo" name="decisao" value="negar" type="submit">Negar</button>
          </form>
        </div>
      ))}
      {decididos.length > 0 && (
        <details className="card">
          <summary>Pedidos já decididos</summary>
          <table><tbody>
            {decididos.map((g) => (
              <tr key={g.id}><td>{g.descricao}</td><td className="num">{brl(g.valor)}</td><td>{g.status}</td><td className="small">{dataHora(g.decidido_em)}</td></tr>
            ))}
          </tbody></table>
        </details>
      )}

      <h2>Lançamentos</h2>
      <div className="card rolagem">
        <table>
          <thead><tr><th>Quando</th><th>Tipo</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {lancs.map((x) => (
              <tr key={x.id}>
                <td className="small">{dataHora(x.em)}</td>
                <td>{x.tipo}</td>
                <td>{x.descricao}</td>
                <td className="num">{x.tipo === 'gasto' ? '−' : '+'}{brl(x.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary>Lançamento manual</summary>
        <form action={lancamento}>
          <div className="linha-form">
            <select name="tipo" aria-label="Tipo" defaultValue="receita">
              <option value="receita">Receita</option><option value="gasto">Gasto</option><option value="capital">Capital</option>
            </select>
            <input name="valor" inputMode="decimal" placeholder="Valor" aria-label="Valor" required />
          </div>
          <label htmlFor="desc">Descrição</label>
          <input id="desc" name="descricao" required />
          <div className="acoes"><button type="submit">Lançar</button></div>
        </form>
      </details>
    </>
  );
}
