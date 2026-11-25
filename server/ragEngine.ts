import type { RagDocument, RagSearchHit } from '../src/types/helbawey.ts';

/**
 * Normalizes Arabic and English text for offline TF-IDF indexing and semantic retrieval.
 * Zero external API dependencies.
 */
export function normalizeTextForIndex(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Strip Arabic Tashkeel diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC_SYNONYM_MAP: Record<string, string[]> = {
  مشفي: ['مستشفي'],
  مستشفي: ['مشفي', 'رعايه'],
  تخصصي: ['مستشفي', 'رعايه'],
  انتهاء: ['تجديد', 'موعد'],
  ينتهي: ['تجديد', 'موعد'],
  ميعاد: ['موعد', 'تاريخ'],
  سداد: ['مدفوع', 'فاتوره'],
  متاخره: ['متاخر', 'استحقاق'],
  تقييم: ['التزام'],
};

function expandArabicTokenVariants(token: string): string[] {
  const out = new Set<string>([token]);
  if (/[\u0600-\u06FF]/.test(token)) {
    let stem = token;
    for (const prefix of ['وال', 'بال', 'كال', 'لال', 'فال', 'ال']) {
      if (stem.startsWith(prefix) && stem.length - prefix.length >= 3) {
        stem = stem.slice(prefix.length);
        out.add(stem);
        break;
      }
    }
    for (const suffix of ['هم', 'هن', 'كم', 'نا', 'ها', 'ات', 'ين', 'ون', 'ه']) {
      if (stem.endsWith(suffix) && stem.length - suffix.length >= 3) {
        out.add(stem.slice(0, -suffix.length));
        break;
      }
    }
    if (token.startsWith('و') && token.length >= 4) {
      out.add(token.slice(1));
    }
  }
  for (const variant of Array.from(out)) {
    const syns = ARABIC_SYNONYM_MAP[variant];
    if (syns) {
      for (const s of syns) out.add(s);
    }
  }
  return Array.from(out);
}

export function tokenizeNormalized(input: string): string[] {
  const normalized = normalizeTextForIndex(input);
  if (!normalized) return [];
  const stopWords = new Set([
    'في', 'من', 'علي', 'الي', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي',
    'ان', 'او', 'ثم', 'كما', 'بين', 'كل', 'عند', 'قد', 'لا', 'ما', 'هو', 'هي',
    'متي', 'كم', 'ماهي', 'ماهو', 'حاله',
    'the', 'is', 'at', 'which', 'on', 'and', 'or', 'for', 'to', 'of', 'in', 'a', 'an',
  ]);
  const tokens: string[] = [];
  for (const raw of normalized.split(' ')) {
    if (raw.length < 2 || stopWords.has(raw)) continue;
    for (const variant of expandArabicTokenVariants(raw)) {
      if (variant.length >= 2 && !stopWords.has(variant)) {
        tokens.push(variant);
      }
    }
  }
  return tokens;
}

export function chunkDocument(content: string, maxWordsPerChunk = 80): string[] {
  const clean = content.trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    if (words.length <= maxWordsPerChunk) {
      chunks.push(para);
    } else {
      for (let i = 0; i < words.length; i += maxWordsPerChunk - 12) {
        const slice = words.slice(i, i + maxWordsPerChunk).join(' ');
        if (slice.trim()) chunks.push(slice);
      }
    }
  }
  return chunks.length > 0 ? chunks : [clean];
}

export interface LocalVectorIndex {
  vocabulary: string[];
  idf: Record<string, number>;
  chunks: {
    docId: string;
    title: string;
    chunkIndex: number;
    text: string;
    tf: Record<string, number>;
  }[];
}

export function buildLocalRagIndex(docs: RagDocument[]): LocalVectorIndex {
  const allChunks: { docId: string; title: string; chunkIndex: number; text: string; tokens: string[] }[] = [];

  for (const doc of docs) {
    const chunks = chunkDocument(doc.content);
    chunks.forEach((text, idx) => {
      allChunks.push({
        docId: doc.id,
        title: doc.title,
        chunkIndex: idx,
        text,
        tokens: tokenizeNormalized(`${doc.title} ${text}`),
      });
    });
  }

  const df: Record<string, number> = {};
  for (const chunk of allChunks) {
    const unique = new Set(chunk.tokens);
    for (const token of unique) {
      df[token] = (df[token] || 0) + 1;
    }
  }

  const totalDocs = Math.max(allChunks.length, 1);
  const idf: Record<string, number> = {};
  const vocabulary = Object.keys(df);
  for (const token of vocabulary) {
    idf[token] = Math.log((totalDocs + 1) / ((df[token] || 0) + 1)) + 1;
  }

  const indexedChunks = allChunks.map((chunk) => {
    const counts: Record<string, number> = {};
    for (const t of chunk.tokens) {
      counts[t] = (counts[t] || 0) + 1;
    }
    const len = Math.max(chunk.tokens.length, 1);
    const tf: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) {
      tf[k] = (v / len) * (idf[k] || 1);
    }
    return {
      docId: chunk.docId,
      title: chunk.title,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      tf,
    };
  });

  return { vocabulary, idf, chunks: indexedChunks };
}

export function searchLocalRag(docs: RagDocument[], query: string, topK = 4): RagSearchHit[] {
  if (!query.trim() || docs.length === 0) return [];
  const index = buildLocalRagIndex(docs);
  const queryTokens = tokenizeNormalized(query);
  if (queryTokens.length === 0) return [];

  const qCounts: Record<string, number> = {};
  for (const t of queryTokens) {
    qCounts[t] = (qCounts[t] || 0) + 1;
  }
  const qVec: Record<string, number> = {};
  let qNormSq = 0;
  for (const [t, c] of Object.entries(qCounts)) {
    const w = (c / queryTokens.length) * (index.idf[t] || 1);
    qVec[t] = w;
    qNormSq += w * w;
  }
  const qNorm = Math.sqrt(qNormSq) || 1;

  const scored: RagSearchHit[] = [];
  for (const chunk of index.chunks) {
    let dot = 0;
    let dNormSq = 0;
    for (const val of Object.values(chunk.tf)) {
      dNormSq += val * val;
    }
    for (const [t, qw] of Object.entries(qVec)) {
      if (chunk.tf[t]) {
        dot += qw * chunk.tf[t];
      }
    }
    const dNorm = Math.sqrt(dNormSq) || 1;
    const score = dot / (qNorm * dNorm);
    if (score > 0.01) {
      scored.push({
        docId: chunk.docId,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
        excerpt: chunk.text,
        score: Number(score.toFixed(4)),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Generates standalone offline JS module embedded in exported client packages.
 */
export function generateStandaloneRagModuleCode(): string {
  return `// HELBAWEY LOCAL RAG ENGINE (100% Offline, Zero External APIs)
import fs from 'node:fs';
import path from 'node:path';

export function normalizeArabicEnglish(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\\u064B-\\u065F\\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\\p{L}\\p{N}\\s]/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

export function tokenize(input) {
  const norm = normalizeArabicEnglish(input);
  if (!norm) return [];
  const stop = new Set(['في','من','على','الى','عن','مع','هذا','هذه','و','او','the','is','and','or','in','of','to']);
  return norm.split(' ').filter((t) => t.length >= 2 && !stop.has(t));
}

export function loadKnowledgeIndex(indexPath) {
  const resolved = path.resolve(indexPath);
  if (!fs.existsSync(resolved)) {
    return { vocabulary: [], idf: {}, chunks: [] };
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function searchLocalKnowledge(index, query, topK = 4) {
  const tokens = tokenize(query);
  if (!tokens.length || !index.chunks?.length) return [];
  const qCounts = {};
  for (const t of tokens) qCounts[t] = (qCounts[t] || 0) + 1;
  const qVec = {};
  let qNormSq = 0;
  for (const [t, c] of Object.entries(qCounts)) {
    const w = (c / tokens.length) * (index.idf?.[t] || 1);
    qVec[t] = w;
    qNormSq += w * w;
  }
  const qNorm = Math.sqrt(qNormSq) || 1;
  const hits = [];
  for (const chunk of index.chunks) {
    let dot = 0;
    let dNormSq = 0;
    for (const v of Object.values(chunk.tf || {})) dNormSq += v * v;
    for (const [t, qw] of Object.entries(qVec)) {
      if (chunk.tf?.[t]) dot += qw * chunk.tf[t];
    }
    const score = dot / (qNorm * (Math.sqrt(dNormSq) || 1));
    if (score > 0.01) {
      hits.push({ docId: chunk.docId, title: chunk.title, chunkIndex: chunk.chunkIndex, excerpt: chunk.text, score: Number(score.toFixed(4)) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}
`;
}
