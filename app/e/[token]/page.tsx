import { PaginaPublica, metadataPublica } from '../../publica';

export const dynamic = 'force-dynamic';
export const metadata = { ...metadataPublica, title: 'Entrega' };

export default async function Entrega({ params }: { params: Promise<{ token: string }> }) {
  return <PaginaPublica token={(await params).token} campo="entrega" />;
}
