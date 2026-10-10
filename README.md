# Painel R$300 → R$600

Painel e memória do agente que opera a venda de pacotes de presença digital para pequenos negócios do Rio.
Contexto e regras: [`docs/PROJETO.md`](docs/PROJETO.md). Roteiro de cada rodada do agente:
[`agent/RODADA.md`](agent/RODADA.md).

```
 Rotina agendada (Claude Code na nuvem, 2–3x/dia)
        │  npm run agent -- …   (PAINEL_URL + AGENT_TOKEN)
        ▼
 Vercel (Next.js) ── /api/agent/*  ── regras aplicadas no servidor
        │              ├─ Gmail SMTP/IMAP (envio e leitura de respostas)
        │              └─ Google Places API (busca de negócios)
        ├── painel (você: aprovar, marcar pago, liberar gastos)
        ├── /a/<token>  amostra pública   /e/<token> entrega   /sair/<token> descadastro
        ▼
 Postgres grátis (Neon)
```

## Colocar no ar (uma vez, ~20 min)

### 1. Vercel + banco

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `lucasfrt/dashboardmaps` (plano Hobby, grátis).
2. No projeto: **Storage → Create Database → Neon** (plano grátis). Isso cria `DATABASE_URL` sozinho.
3. As tabelas são criadas automaticamente a cada deploy (`scripts/migrate.mjs` roda no build).

> O agente precisa da URL de **produção** (branch `main`). As URLs de preview ficam atrás do login da
> Vercel e o agente não consegue acessá-las.

### 2. Gmail (envio e leitura)

Recomendo uma conta Gmail **nova, só para este negócio**, no seu nome. Assim a reputação da sua conta
pessoal não corre risco.

1. Ative a verificação em duas etapas na conta.
2. Crie uma senha de app em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Essa senha vai em `SMTP_PASS`. A mesma conta e senha servem para ler as respostas (IMAP).

### 3. Google Places API

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative **Places API (New)**.
   O Google exige uma conta de faturamento com cartão, mesmo dentro da cota grátis.
2. Crie uma chave de API e restrinja-a a **Places API (New)**.
3. Para garantir custo zero, em **APIs e serviços → Places API (New) → Cotas**, limite as
   requisições de Text Search a ~50 por dia. A cota grátis é de 1.000 por mês no SKU usado (com avaliações).

### 4. Variáveis de ambiente na Vercel

| Variável | Valor |
|---|---|
| `DATABASE_URL` | criada pelo Neon |
| `PANEL_PASSWORD` | sua senha do painel (longa) |
| `AGENT_TOKEN` | token aleatório (ex.: `openssl rand -hex 24`) |
| `APP_URL` | `https://<seu-projeto>.vercel.app` |
| `SMTP_USER` | o Gmail do negócio |
| `SMTP_PASS` | a senha de app |
| `SMTP_FROM_NAME` | seu nome, como aparece no remetente |
| `GOOGLE_PLACES_API_KEY` | a chave do Places |

Opcionais: `SMTP_HOST`/`SMTP_PORT` e `IMAP_HOST`/`IMAP_PORT`/`IMAP_USER`/`IMAP_PASS`, para usar outro provedor.

Depois de salvar, faça **Redeploy**. Entre no painel, vá em **Config** e preencha a chave Pix e a assinatura.

### 5. Ambiente do agente (Claude Code na nuvem)

No ambiente da sessão (menu do ambiente → Editar):
- Variáveis: `PAINEL_URL=https://<seu-projeto>.vercel.app` e `AGENT_TOKEN=<o mesmo da Vercel>`.
- Acesso à rede: adicione `<seu-projeto>.vercel.app` aos domínios permitidos.

### 6. Rodadas

Primeiro, uma rodada manual: peça ao Claude para “executar uma rodada seguindo `agent/RODADA.md`”. Avalie as
amostras e abordagens em **Aprovações**. Só depois agende a rotina (2 a 3 vezes por dia) com o mesmo pedido.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # ajuste DATABASE_URL para um Postgres local
npm run migrate
npm run dev
```

`npm run typecheck` e `npm run build` validam o projeto.
