// Voice-assisted product lookup — AssemblyAI real-time streaming transcription.
// GET  /api/voice/token   — issues a 60-second AssemblyAI temp token for the browser WS
// POST /api/voice/intent  — matches finalized transcript to in-stock products via alias lookup
//
// Required env var: ASSEMBLYAI_API_KEY
// If missing, both endpoints run in demo mode so the UI can be developed without live keys.

import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const voiceRouter = new Hono();

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

// alias → English grocery terms (one alias can map to multiple English words)
const ALIAS_MAP: Record<string, string[]> = {
  // Somali
  sonkor:  ['sugar'],
  bariis:  ['rice'],
  beer:    ['rice'],
  caano:   ['milk'],
  saliid:  ['oil', 'cooking oil'],
  far:     ['flour'],
  faruur:  ['flour'],
  hilib:   ['meat'],
  kalluun: ['fish'],
  khudrad: ['vegetables', 'vegetable', 'veg'],
  qudaar:  ['vegetables', 'vegetable', 'veg'],
  timir:   ['dates'],
  subag:   ['butter', 'ghee'],
  biyo:    ['water'],
  shaah:   ['tea'],
  caataan: ['soda', 'soda water', 'soft drink'],
  buraro:  ['biscuits', 'biscuit', 'crackers'],
  doolshe: ['cake', 'biscuits', 'biscuit'],
  baasto:  ['pasta', 'spaghetti', 'noodles'],
  rooti:   ['bread'],
  ukun:    ['eggs', 'egg'],
  basbaas: ['chili', 'pepper', 'chilli'],
  suugo:   ['tomato sauce', 'tomato paste', 'tomato'],
  basal:   ['onion', 'onions'],
  toomo:   ['garlic'],
  macmacaan: ['sweets', 'candy', 'sweet'],
  xalwo:   ['halwa', 'halva'],
  maraq:   ['broth', 'soup', 'stock'],
  geel:    ['camel'],
  // Swahili
  sukari:   ['sugar'],
  mchele:   ['rice'],
  wali:     ['rice', 'cooked rice'],
  maziwa:   ['milk'],
  mafuta:   ['oil', 'cooking oil'],
  unga:     ['flour'],
  nyama:    ['meat', 'beef', 'goat'],
  kuku:     ['chicken'],
  samaki:   ['fish'],
  mboga:    ['vegetables', 'vegetable'],
  maji:     ['water'],
  chai:     ['tea'],
  mkate:    ['bread'],
  mayai:    ['eggs', 'egg'],
  pilipili: ['chili', 'pepper', 'chilli'],
  vitunguu: ['onion', 'onions'],
  nyanya:   ['tomato', 'tomatoes'],
  ndizi:    ['banana', 'bananas'],
  embe:     ['mango', 'mangoes'],
  chungwa:  ['orange', 'oranges'],
  // Kikuyu
  thukaari: ['sugar'],
  mukembe:  ['flour'],
  iria:     ['milk'],
  ngima:    ['ugali'],
};

// Multi-word Somali phrases (checked before single-word lookup)
const PHRASE_MAP: Array<[string, string[]]> = [
  ["hilib digaag", ["chicken"]],
  ["hilib lo'aad", ["beef"]],
  ["hilib ri",     ["goat", "goat meat"]],
];

// Somali / Swahili / English spoken numbers → digit
const NUMBER_WORDS: Record<string, number> = {
  // Somali
  kow: 1, laba: 2, lacab: 2, saddex: 3, afar: 4, shan: 5,
  lix: 6, toddoba: 7, siddeed: 8, sagaal: 9, toban: 10,
  // Swahili
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5,
  sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function matchProducts(
  transcript: string,
  products: Array<{ id: string; name: string; sku: string; category: string }>,
) {
  type Suggestion = { productId: string; name: string; sku: string; confidence: string; qty?: number };

  const lower = transcript.toLowerCase().replace(/[^a-z0-9\s']/g, ' ');
  const words = lower.split(/\s+/).filter(Boolean);

  // Extract quantity from number words or digits adjacent to item words
  let qty: number | undefined;
  for (const w of words) {
    if (NUMBER_WORDS[w]) { qty = NUMBER_WORDS[w]; break; }
    const d = parseInt(w, 10);
    if (!isNaN(d) && d > 0 && d <= 100) { qty = d; break; }
  }

  // Build expanded search terms: original words + alias expansions
  const searchTerms = new Set<string>(words);

  // Phrase matches first
  for (const [phrase, expansions] of PHRASE_MAP) {
    if (lower.includes(phrase)) {
      expansions.forEach((e) => searchTerms.add(e));
    }
  }

  // Single-word alias lookup
  for (const w of words) {
    const expansions = ALIAS_MAP[w];
    if (expansions) expansions.forEach((e) => searchTerms.add(e));
  }

  const results: Suggestion[] = [];

  for (const p of products) {
    const pName = p.name.toLowerCase();
    const pCat  = (p.category ?? '').toLowerCase();

    let score = 0;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    for (const term of searchTerms) {
      if (term.length < 3) continue;
      if (pName === term) {
        score += 10; confidence = 'high';
      } else if (pName.startsWith(term) || term.startsWith(pName)) {
        score += 6; if (confidence !== 'high') confidence = 'high';
      } else if (pName.includes(term)) {
        score += 4; if (confidence === 'low') confidence = 'medium';
      } else if (pCat.includes(term)) {
        score += 2; // category match only → low
      }
    }

    // Boost if transcript contains the product name directly
    if (lower.includes(pName)) score += 8;

    if (score > 0) {
      results.push({ productId: p.id, name: p.name, sku: p.sku, confidence, qty });
    }
  }

  // Sort by score descending, cap at 5
  results.sort((a, b) => {
    const order = { high: 2, medium: 1, low: 0 };
    return order[b.confidence as 'high' | 'medium' | 'low'] - order[a.confidence as 'high' | 'medium' | 'low'];
  });

  return results.slice(0, 5);
}

// GET /api/voice/token — return a short-lived AssemblyAI real-time token for the browser
voiceRouter.get('/token', async (c) => {
  if (!ASSEMBLYAI_KEY) {
    return c.json({ token: null, demo: true });
  }

  try {
    const res = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
      method: 'GET',
      headers: { Authorization: ASSEMBLYAI_KEY },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Voice/token] AssemblyAI error:', res.status, err.slice(0, 200));
      return c.json({ error: 'Token fetch failed' }, 502);
    }

    const data = await res.json() as { token: string };
    return c.json({ token: data.token });
  } catch (e) {
    console.error('[Voice/token] timeout:', (e as Error).message);
    return c.json({ error: 'Token fetch timeout' }, 504);
  }
});

// POST /api/voice/intent — match finalized transcript to in-stock products
voiceRouter.post('/intent', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{ transcript: string }>();
  if (!body.transcript?.trim()) return c.json({ suggestions: [] });

  const products = await prisma.item.findMany({
    where: { storeId, currentStock: { gt: 0 } },
    select: { id: true, name: true, sku: true, category: true },
    orderBy: { name: 'asc' },
    take: 300,
  });

  if (products.length === 0) return c.json({ suggestions: [] });

  const suggestions = matchProducts(body.transcript, products);
  return c.json({ suggestions });
});
