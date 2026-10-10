import Markdown from 'react-markdown';
import { db } from '@/lib/db';
import { brl, dia, pct } from '@/lib/formato';
import { funilPor, type LinhaFunil } from '@/lib/metricas';

export const dynamic = 'force-dynamic';

function Tabela({ titulo, linhas }: { titulo: string; linhas: LinhaFunil[] }) {
  return (
    <div className="card rolagem">
      <h3>{titulo}</h3>
      {linhas.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sem dados ainda.</p> : (
        <table>
          <thead><tr>
            <th>{titulo.replace('Por ', '')}</th><th className="num">Leads</th><th className="num">Abord.</th>
            <th className="num">Resp.</th><th className="num">% resp.</th><th className="num">Vendas</th>
            <th className="num">% fech.</th><th className="num">Ticket</th>
          </tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.grupo}>
                <td>{l.grupo}</td><td className="num">{l.leads}</td><td className="num">{l.abordados}</td>
                <td className="num">{l.responderam}</td><td className="num">{pct(l.taxa_resposta)}</td>
                <td className="num">{l.pagos}</td><td className="num">{pct(l.taxa_fechamento)}</td>
                <td className="num">{l.ticket_medio == null ? '—' : brl(l.ticket_medio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function Metricas() {
  const [cat, bairro] = await Promise.all([funilPor('categoria'), funilPor('bairro')]);
  const revisoes = await db()<{ semana: Date; texto: string }[]>`select semana, texto from revisoes order by semana desc, em desc`;
  return (
    <>
      <h1>Métricas</h1>
      <p className="small muted">Critério de ajuste: se as primeiras ~100 abordagens tiverem resposta zero, mudar oferta, preço, nicho ou bairro.</p>
      <Tabela titulo="Por categoria" linhas={cat} />
      <Tabela titulo="Por bairro" linhas={bairro} />
      <h2>Revisões semanais</h2>
      {revisoes.length === 0 && <p className="muted">O agente escreve uma revisão por semana.</p>}
      {revisoes.map((r, i) => (
        <div key={i} className="card">
          <div className="small muted">Semana de {dia(r.semana)}</div>
          <div className="md"><Markdown>{r.texto}</Markdown></div>
        </div>
      ))}
    </>
  );
}
