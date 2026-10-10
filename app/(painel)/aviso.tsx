/** Mostra ?ok= / ?erro= deixados pelas server actions. */
export function Aviso({ ok, erro }: { ok?: string; erro?: string }) {
  if (erro) return <div className="card erro" role="alert">{erro}</div>;
  if (ok) return <div className="card ok" role="status">{ok}</div>;
  return null;
}
