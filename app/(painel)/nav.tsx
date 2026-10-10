'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/', rotulo: 'Resumo' },
  { href: '/aprovacoes', rotulo: 'Aprovações', badge: 'aprovacoes' },
  { href: '/leads', rotulo: 'Leads' },
  { href: '/caixa', rotulo: 'Caixa', badge: 'gastos' },
  { href: '/metricas', rotulo: 'Métricas' },
  { href: '/config', rotulo: 'Config' },
] as const;

export function Nav({ contagens }: { contagens: { aprovacoes: number; gastos: number } }) {
  const atual = usePathname();
  return (
    <header className="topo">
      <nav>
        {ITENS.map((i) => {
          const ativo = i.href === '/' ? atual === '/' : atual.startsWith(i.href);
          const n = 'badge' in i ? contagens[i.badge] : 0;
          return (
            <Link key={i.href} href={i.href} className={ativo ? 'ativo' : undefined}>
              {i.rotulo}
              {n > 0 && <span className="badge">{n}</span>}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
