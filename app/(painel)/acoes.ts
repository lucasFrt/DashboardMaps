'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirLogin } from '@/lib/auth';
import { db } from '@/lib/db';
import { enviarAprovadas } from '@/lib/email';
import { lerRespostas } from '@/lib/imap';
import { atualizarLead } from '@/lib/leads';
import {
  aprovarMensagem, confirmarEnvioManual, decidirGasto, desfazerPago, gravarConfig, marcarNaoContatar, marcarPago,
  RegraVioladaError, rejeitarMensagem,
} from '@/lib/regras';

/** Executa a ação; erros de regra voltam para a página como ?erro=... em vez de quebrar. */
async function executar(voltar: string, fn: () => Promise<unknown>, ok?: string) {
  await exigirLogin();
  let destino = voltar;
  const sep = voltar.includes('?') ? '&' : '?';
  try {
    await fn();
    if (ok) destino = `${voltar}${sep}ok=${encodeURIComponent(ok)}`;
  } catch (e) {
    const msg = e instanceof RegraVioladaError ? e.message : `Falhou: ${e instanceof Error ? e.message : String(e)}`;
    destino = `${voltar}${sep}erro=${encodeURIComponent(msg)}`;
  }
  revalidatePath('/', 'layout');
  redirect(destino);
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? '');
const voltarPara = (f: FormData, padrao: string) => {
  const v = texto(f, 'voltar');
  return v.startsWith('/') && !v.startsWith('//') ? v : padrao;
};

export async function aprovar(f: FormData) {
  const id = Number(texto(f, 'id'));
  const edicao = { assunto: texto(f, 'assunto') || null, corpo: texto(f, 'corpo') };
  if (texto(f, 'canal') === 'manual') {
    await executar(voltarPara(f, '/aprovacoes'), () => confirmarEnvioManual(id, edicao), 'Registrado como enviado');
  } else {
    await executar(voltarPara(f, '/aprovacoes'), () => aprovarMensagem(id, edicao), 'Mensagem aprovada');
  }
}

export async function rejeitar(f: FormData) {
  const id = Number(texto(f, 'id'));
  await executar(voltarPara(f, '/aprovacoes'), () => rejeitarMensagem(id, texto(f, 'motivo')), 'Mensagem rejeitada');
}

export async function pago(f: FormData) {
  const id = Number(texto(f, 'id'));
  const valor = Number(texto(f, 'valor').replace(/\./g, '').replace(',', '.'));
  await executar(`/leads/${id}`, () => marcarPago(id, valor), 'Pagamento registrado no caixa');
}

export async function desfazerPagamento(f: FormData) {
  const id = Number(texto(f, 'id'));
  await executar(`/leads/${id}`, () => desfazerPago(id), 'Pagamento desmarcado');
}

export async function salvarLead(f: FormData) {
  const id = Number(texto(f, 'id'));
  const dados: Record<string, unknown> = { observacoes: texto(f, 'observacoes') };
  const status = texto(f, 'status');
  if (status) dados.status = status;
  await executar(`/leads/${id}`, () => atualizarLead(id, dados, 'investidor'), 'Salvo');
}

export async function naoContatar(f: FormData) {
  const id = Number(texto(f, 'id'));
  await executar(`/leads/${id}`, () =>
    db().begin((tx) => marcarNaoContatar(tx, id, 'marcado pelo investidor', 'investidor')), 'Marcado: não contatar');
}

export async function gasto(f: FormData) {
  const id = Number(texto(f, 'id'));
  const aprovar = texto(f, 'decisao') === 'aprovar';
  await executar('/caixa', () => decidirGasto(id, aprovar), aprovar ? 'Gasto aprovado e lançado' : 'Gasto negado');
}

export async function lancamento(f: FormData) {
  const tipo = texto(f, 'tipo');
  const valor = Number(texto(f, 'valor').replace(/\./g, '').replace(',', '.'));
  const descricao = texto(f, 'descricao').trim();
  await executar('/caixa', async () => {
    if (!['capital', 'gasto', 'receita'].includes(tipo)) throw new RegraVioladaError('tipo inválido');
    if (!(valor > 0) || !descricao) throw new RegraVioladaError('informe valor e descrição');
    await db()`insert into caixa (tipo, valor, descricao) values (${tipo}, ${valor}, ${descricao})`;
  }, 'Lançamento registrado');
}

export async function configurar(f: FormData) {
  await executar('/config', async () => {
    if (f.has('gate_ativo')) await gravarConfig('gate_ativo', texto(f, 'gate_ativo') === 'true');
    if (f.has('limite_diario')) {
      const n = Number(texto(f, 'limite_diario'));
      if (!Number.isInteger(n) || n < 0 || n > 40) throw new RegraVioladaError('limite deve ficar entre 0 e 40');
      await gravarConfig('limite_diario', n);
    }
  }, 'Configuração salva');
}

export async function enviarAgora() {
  await executar('/config', async () => {
    const r = await enviarAprovadas();
    if (r.erros.length) throw new RegraVioladaError(`${r.enviadas.length} enviadas, ${r.erros.length} com erro: ${r.erros[0].erro}`);
  }, 'Envio concluído');
}

export async function lerAgora() {
  await executar('/config', () => lerRespostas(), 'Caixa de entrada lida');
}
