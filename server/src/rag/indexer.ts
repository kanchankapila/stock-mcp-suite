import { insertDocRow } from '../db.js';
import { logger } from '../utils/logger.js';

// naive tokenizer
function tokenize(text: string) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function chunkText(text: string, maxLen = 120) {
  const words = tokenize(text);
  const chunks: string[] = [];
  for (let i=0;i<words.length;i+=maxLen) {
    chunks.push(words.slice(i, i+maxLen).join(' '));
  }
  return chunks;
}

export function indexDocs(symbol: string, docs: {title?:string, summary?:string, url?:string}[]) {
  try {
    let count = 0;
    for (const d of docs) {
      const base = `${d.title || ''}. ${d.summary || ''}`.trim();
      for (const chunk of chunkText(base)) {
        const terms: Record<string, number> = {};
        for (const t of tokenize(chunk)) {
          terms[t] = (terms[t] || 0) + 1;
        }
        insertDocRow(symbol, chunk, JSON.stringify(Object.entries(terms).map(([term, tf])=>({term, tf}))));
        count++;
      }
    }
    logger.info({ symbol, chunks: count }, 'rag_indexed');
  } catch (err) {
    logger.error({ err, symbol }, 'rag_index_failed');
    throw err;
  }
}
