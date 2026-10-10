import { PaginaPublica, metadataPublica } from '../../publica';

export const dynamic = 'force-dynamic';
export const metadata = { ...metadataPublica, title: 'Amostra' };

export default async function Amostra({ params }: { params: Promise<{ token: string }> }) {
  return <PaginaPublica token={(await params).token} campo="amostra" />;
}
