import { lerConfig } from '@/lib/regras';
import { db } from '@/lib/db';
import { sairDoPainel } from '../../sair-painel';
import { configurar, enviarAgora, lerAgora } from '../acoes';
import { Aviso } from '../aviso';

export const dynamic = 'force-dynamic';

export default async function Config({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const cfg = await lerConfig();
  const [c] = await db()<{ aprovadas: number; fila: number }[]>`
    select count(*) filter (where tipo = 'abordagem' and status in ('aprovada', 'enviada'))::int as aprovadas,
           count(*) filter (where status = 'aprovada' and canal = 'email')::int as fila
    from mensagens`;
  const faltando = ['SMTP_USER', 'SMTP_PASS', 'GOOGLE_PLACES_API_KEY', 'AGENT_TOKEN', 'APP_URL'].filter((k) => !process.env[k]);

  return (
    <>
      <Aviso {...sp} />
      <h1>Configuração</h1>
      {faltando.length > 0 && (
        <div className="card alerta small">Variáveis não configuradas na Vercel: <span className="mono">{faltando.join(', ')}</span></div>
      )}

      <form action={configurar} className="card">
        <h3>Portão de aprovação</h3>
        <p className="small">
          {cfg.gate_ativo
            ? 'Ativo: nenhuma mensagem sai sem a sua aprovação.'
            : 'Desligado: mensagens de e-mail do agente saem direto (ainda respeitando todas as regras).'}
          {' '}Abordagens aprovadas até agora: <strong>{c.aprovadas}</strong> (a regra pede a primeira semana ou ~20).
        </p>
        <input type="hidden" name="gate_ativo" value={cfg.gate_ativo ? 'false' : 'true'} />
        <button type="submit" className={cfg.gate_ativo ? undefined : 'primario'}>
          {cfg.gate_ativo ? 'Desligar portão' : 'Religar portão'}
        </button>
      </form>

      <form action={configurar} className="card">
        <h3>Limite diário de e-mails frios</h3>
        <p className="small muted">Abordagens + follow-ups. Respostas a quem escreveu e entregas não contam.</p>
        <div className="linha-form">
          <input name="limite_diario" type="number" min={0} max={40} defaultValue={cfg.limite_diario} aria-label="Limite diário" />
          <button type="submit">Salvar</button>
        </div>
      </form>

      <div className="card">
        <h3>Rodar agora</h3>
        <p className="small muted">Normalmente o agente faz isso nas rodadas agendadas. {c.fila} mensagem(ns) aprovada(s) na fila.</p>
        <div className="acoes">
          <form action={enviarAgora}><button type="submit">Enviar aprovadas agora</button></form>
          <form action={lerAgora}><button type="submit">Ler caixa de entrada</button></form>
        </div>
      </div>

      <form action={sairDoPainel}><button type="submit">Sair do painel</button></form>
    </>
  );
}
