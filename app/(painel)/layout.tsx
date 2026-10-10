import { exigirLogin } from '@/lib/auth';
import { db } from '@/lib/db';
import { Nav } from './nav';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  await exigirLogin();
  const [c] = await db()<{ aprovacoes: number; gastos: number }[]>`
    select (select count(*)::int from mensagens where status = 'aguardando_aprovacao') as aprovacoes,
           (select count(*)::int from gastos where status = 'pendente') as gastos`;
  return (
    <>
      <Nav contagens={c} />
      <main>{children}</main>
    </>
  );
}
