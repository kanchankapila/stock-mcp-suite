import 'dotenv/config';
process.env.RAG_STORE = 'hnsw';
process.env.RAG_EMBEDDINGS = ''; // force local hash fallback
process.env.RAG_DIR = process.env.RAG_DIR || 'server/.rag';
import { indexNamespace } from '../src/rag/langchain.js';

async function main() {
  const ns = process.argv[2] || 'TEST.NS';
  const texts = [{ text: 'Test document about revenue growth and margin expansion.', metadata: { date: '2025-01-01', source: 'test' } }];
  const out = await indexNamespace(ns, { texts });
  console.log(JSON.stringify({ ok: true, ns, added: out.added }));
}

main().catch(err => { console.error(err); process.exit(1); });

