import db from '../db.js';
import { logger } from '../utils/logger.js';

function tokenize(text: string) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function retrieve(symbol: string, query: string, k=5) {
  try {
    // compute simple TF-IDF cosine among docs for symbol
    const rows = db.prepare('SELECT id, chunk, terms FROM docs WHERE symbol=?').all(symbol);
    if (!rows.length) return [];
    const corpusSize = rows.length;

    const qTokens = tokenize(query);
    const qTermFreq: Record<string, number> = {};
    qTokens.forEach(t=>{ qTermFreq[t]=(qTermFreq[t]||0)+1; });

    const docScores = rows.map((r:any)=>{
      const terms = JSON.parse(r.terms) as {term:string, tf:number}[];
      let dot=0, qNorm=0, dNorm=0;
      for (const [qt, qtf] of Object.entries(qTermFreq)) {
        const df = terms.find(t => t.term===qt)?.tf || 0;
        const idf = Math.log( (corpusSize+1) / (1 + (df>0?1:0)) );
        const qWeight = qtf * idf;
        const dWeight = (df>0?df:0) * idf;
        dot += qWeight * dWeight;
        qNorm += qWeight*qWeight;
        dNorm += dWeight*dWeight;
      }
      const denom = Math.sqrt(qNorm)*Math.sqrt(dNorm) || 1;
      const score = dot/denom;
      return { id: r.id, text: r.chunk, score };
    });

    const results = docScores.sort((a,b)=>b.score-a.score).slice(0,k);
    logger.debug({ symbol, k, returned: results.length }, 'rag_retrieved');
    return results;
  } catch (err) {
    logger.error({ err, symbol }, 'rag_retrieve_failed');
    throw err;
  }
}
