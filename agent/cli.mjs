#!/usr/bin/env node
// CLI do agente: fala com o painel na Vercel via /api/agent/*. Sem dependências.
// Requer PAINEL_URL e AGENT_TOKEN no ambiente. Saída sempre em JSON.
// Corpo das requisições: arquivo JSON (caminho) ou "-" para ler da entrada padrão.
import { readFileSync } from 'node:fs';

const AJUDA = `uso: npm run agent -- <comando> [args]

  estado                         tudo que a rodada precisa (fila, conversas, follow-ups, métricas)
  metricas                       funil por categoria e bairro
  leads [status] [busca]         lista leads
  lead <id>                      lead completo com mensagens e histórico
  places "<consulta>" [pagina]   busca no Google Places (ex.: "padaria Tijuca Rio de Janeiro")
  criar-lead <json>              cria lead (campos: nome, place_id, bairro, categoria, maps_url, endereco,
                                 email, telefone, instagram, site, nota, num_avaliacoes, diagnostico, amostra, observacoes)
  atualizar-lead <id> <json>     atualiza campos e/ou {"status": "...", "motivo": "..."}
  mensagem <id> <json>           cria mensagem de saída {tipo, assunto?, corpo, canal?}
                                 tipo: abordagem | follow_up | resposta | entrega
  nao-contatar <id> [motivo]     bloqueia o negócio para sempre
  enviar                         envia as mensagens aprovadas (respeita o limite diário)
  ler-respostas                  lê a caixa de entrada e registra respostas de leads
  pedir-gasto <json>             {descricao, valor, justificativa}
  revisao <json>                 {semana: "AAAA-MM-DD", texto}
  rodada "<resumo>"              registra o resumo da rodada no painel`;

const base = (process.env.PAINEL_URL || '').replace(/\/$/, '');
const token = process.env.AGENT_TOKEN;

function json(arg) {
  if (!arg) throw new Error('faltou o JSON (arquivo ou "-")');
  const txt = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
  return JSON.parse(txt);
}

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { dados = { erro: `resposta não-JSON (${r.status})`, corpo: texto.slice(0, 500) }; }
  console.log(JSON.stringify(dados, null, 2));
  if (!r.ok) process.exitCode = r.status === 422 ? 2 : 1;
}

const [cmd, a, b] = process.argv.slice(2);
if (!cmd || cmd === 'ajuda' || cmd === '--help') {
  console.log(AJUDA);
  process.exit(0);
}
if (!base || !token) {
  console.error('Defina PAINEL_URL e AGENT_TOKEN no ambiente.');
  process.exit(1);
}

const q = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v));
  return p.size ? `?${p}` : '';
};

const comandos = {
  estado: () => chamar('GET', '/api/agent/estado'),
  metricas: () => chamar('GET', '/api/agent/metricas'),
  leads: () => chamar('GET', `/api/agent/leads${q({ status: a, q: b })}`),
  lead: () => chamar('GET', `/api/agent/leads/${a}`),
  places: () => chamar('GET', `/api/agent/places${q({ q: a, pagina: b })}`),
  'criar-lead': () => chamar('POST', '/api/agent/leads', json(a)),
  'atualizar-lead': () => chamar('PATCH', `/api/agent/leads/${a}`, json(b)),
  mensagem: () => chamar('POST', `/api/agent/leads/${a}/mensagens`, json(b)),
  'nao-contatar': () => chamar('POST', `/api/agent/leads/${a}/nao-contatar`, { motivo: b }),
  enviar: () => chamar('POST', '/api/agent/enviar'),
  'ler-respostas': () => chamar('POST', '/api/agent/ler-respostas'),
  'pedir-gasto': () => chamar('POST', '/api/agent/gastos', json(a)),
  revisao: () => chamar('POST', '/api/agent/revisoes', json(a)),
  rodada: () => chamar('POST', '/api/agent/rodadas', { resumo: a }),
};

if (!comandos[cmd]) {
  console.error(`comando desconhecido: ${cmd}\n\n${AJUDA}`);
  process.exit(1);
}
try {
  await comandos[cmd]();
} catch (e) {
  console.error(JSON.stringify({ erro: e.message }));
  process.exit(1);
}
