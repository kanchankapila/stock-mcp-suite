import 'dotenv/config';
// Force HNSW as destination
process.env.RAG_STORE = 'hnsw';
process.env.RAG_DIR = process.env.RAG_DIR || 'server/.rag';

import db from '../src/db.js';
import { logger } from '../src/utils/logger.js';
import { indexNamespace } from '../src/rag/langchain.js';

async function migrateOne(ns: string) {
  try {
    const rows = db.prepare(`SELECT text, metadata FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{text:string, metadata:string}>;
    if (!rows.length) { logger.info({ ns }, 'rag_migrate_skip_empty'); return { ns, added: 0 }; }
    const texts = rows.map(r => {
      let md: any = {}; try { md = JSON.parse(r.metadata || '{}'); } catch {}
      return { text: r.text, metadata: md };
    });
    const out = await indexNamespace(ns, { texts });
    logger.info({ ns, added: out.added }, 'rag_migrate_done');
    return { ns, added: out.added };
  } catch (err:any) {
    logger.error({ err, ns }, 'rag_migrate_failed');
    return { ns, added: 0, error: String(err?.message || err) } as any;
  }
}

async function main() {
  const rows = db.prepare(`SELECT DISTINCT ns FROM rag_embeddings ORDER BY ns`).all() as Array<{ns:string}>;
  if (!rows.length) { console.log(JSON.stringify({ ok: true, migrated: 0 })); return; }
  let migrated = 0;
  for (const r of rows) {
    const ns = String(r.ns || '').toUpperCase();
    const res = await migrateOne(ns);
    migrated += Number(res?.added || 0);
  }
  console.log(JSON.stringify({ ok: true, migrated }));
}

main().catch(err => { console.error(err); process.exit(1); });

