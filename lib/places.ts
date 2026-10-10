// Google Places API (New) — Text Search. Com o campo reviews a chamada cai no SKU
// "Text Search Enterprise + Atmosphere": 1.000 chamadas grátis/mês (cada chamada traz até 20 lugares).
import { db } from './db';

const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress',
  'places.rating', 'places.userRatingCount', 'places.websiteUri', 'places.nationalPhoneNumber',
  'places.googleMapsUri', 'places.regularOpeningHours.weekdayDescriptions', 'places.businessStatus',
  'places.primaryTypeDisplayName', 'places.photos', 'places.reviews', 'places.editorialSummary',
  'nextPageToken',
].join(',');

type Review = {
  rating?: number; text?: { text?: string }; originalText?: { text?: string };
  relativePublishTimeDescription?: string; publishTime?: string; authorAttribution?: { displayName?: string };
};
type Place = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; shortFormattedAddress?: string;
  rating?: number; userRatingCount?: number; websiteUri?: string; nationalPhoneNumber?: string;
  googleMapsUri?: string; regularOpeningHours?: { weekdayDescriptions?: string[] }; businessStatus?: string;
  primaryTypeDisplayName?: { text?: string }; photos?: unknown[]; reviews?: Review[];
  editorialSummary?: { text?: string };
};

export async function buscarLugares(consulta: string, pagina?: string) {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  if (!chave) throw new Error('GOOGLE_PLACES_API_KEY não configurada');
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
    body: JSON.stringify({ textQuery: consulta, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, pageToken: pagina }),
  });
  if (!r.ok) throw new Error(`Places API ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const json = (await r.json()) as { places?: Place[]; nextPageToken?: string };
  const lugares = json.places ?? [];

  const ids = lugares.map((p) => p.id);
  const sql = db();
  const existentes = ids.length
    ? await sql<{ place_id: string; id: number; status: string }[]>`select place_id, id, status from leads where place_id in ${sql(ids)}`
    : [];
  const bloqueados = ids.length
    ? await sql<{ place_id: string }[]>`select place_id from nao_contatar where place_id in ${sql(ids)}`
    : [];
  const mapa = new Map(existentes.map((e) => [e.place_id, e]));
  const proibidos = new Set(bloqueados.map((b) => b.place_id));

  return {
    proxima_pagina: json.nextPageToken ?? null,
    lugares: lugares.map((p) => ({
      place_id: p.id,
      nome: p.displayName?.text ?? '',
      categoria: p.primaryTypeDisplayName?.text ?? null,
      endereco: p.formattedAddress ?? null,
      nota: p.rating ?? null,
      num_avaliacoes: p.userRatingCount ?? 0,
      site: p.websiteUri ?? null,
      telefone: p.nationalPhoneNumber ?? null,
      maps_url: p.googleMapsUri ?? null,
      horario: p.regularOpeningHours?.weekdayDescriptions ?? null,
      situacao: p.businessStatus ?? null,
      // A API devolve no máximo 10 referências de foto: < 10 indica perfil com poucas fotos.
      fotos_api: p.photos?.length ?? 0,
      descricao_google: p.editorialSummary?.text ?? null,
      // No máximo 5 avaliações; a API NÃO informa se o dono respondeu.
      avaliacoes: (p.reviews ?? []).map((v) => ({
        nota: v.rating ?? null,
        quando: v.relativePublishTimeDescription ?? null,
        data: v.publishTime ?? null,
        primeiro_nome: v.authorAttribution?.displayName?.split(' ')[0] ?? null,
        texto: v.originalText?.text ?? v.text?.text ?? '',
      })),
      ja_no_painel: mapa.get(p.id) ?? null,
      nao_contatar: proibidos.has(p.id),
    })),
  };
}
