const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const diaFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

export const brl = (v: number | string | null | undefined) => (v == null ? '—' : brlFmt.format(Number(v)));
export const dataHora = (d: Date | string | null | undefined) => (d ? dataFmt.format(new Date(d)) : '—');
export const dia = (d: Date | string | null | undefined) => (d ? diaFmt.format(new Date(d)) : '—');
export const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
