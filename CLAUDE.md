# DashboardMaps

Painel (Next.js 16 na Vercel + Postgres) e CLI de um agente que vende pacotes de presença digital para
pequenos negócios do Rio. Contexto do negócio e regras: `docs/PROJETO.md`.

- **Pedido para "executar uma rodada"**: siga `agent/RODADA.md` à risca, usando `npm run agent -- …`.
  Não acesse o banco diretamente numa rodada; use só a CLI.
- Regras de negócio ficam em `lib/regras.ts` e são aplicadas no servidor. Não as afrouxe para facilitar
  uma rodada.
- Antes de commitar mudanças de código: `npm run typecheck` e `npm run build`.

@AGENTS.md
