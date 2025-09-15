import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import type { Embeddings } from "@langchain/core/embeddings";
import { logger } from "../utils/logger.js";
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import db from "../db.js";

type Namespace = string;

type StoreKind = 'memory' | 'hnsw' | 'sqlite' | 'chroma';
const STORE_KIND: StoreKind = (process.env.RAG_STORE as StoreKind) || 'memory';
const RAG_DIR = process.env.RAG_DIR || path.resolve(process.cwd(), 'data', 'rag');
const LEGACY_HNSW_DIR = path.resolve(process.cwd(), 'server', 'stock.db');

const memStores = new Map<Namespace, MemoryVectorStore>();
const hnswLoaded = new Map<Namespace, any>();
const chromaLoaded = new Map<Namespace, any>();
async function getHNSWLib() {
  const mod = await import("@langchain/community/vectorstores/hnswlib");
  return mod.HNSWLib;
}

async function getEmbeddingsAsync(): Promise<Embeddings> {
  const prefer = (process.env.RAG_EMBEDDINGS || '').toLowerCase();
  if ((prefer === 'openai' || !prefer) && process.env.OPENAI_API_KEY) {
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    return new OpenAIEmbeddings({ model });
  }
  if (prefer === 'hf' || process.env.HUGGINGFACEHUB_API_KEY) {
    const model = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    const mod = await import("@langchain/community/embeddings/hf");
    const HF = mod.HuggingFaceInferenceEmbeddings;
    return new HF({ model });
  }
  // Fallback: local hash-based embeddings (preferred when RAG_EMBEDDINGS=local)
  if ((process.env.RAG_EMBEDDINGS || '').toLowerCase() === 'local') {
    logger.info('rag_embeddings_local_hash');
  } else {
    logger.warn('rag_embeddings_missing_provider_fallback_local_hash');
  }
  class LocalHashEmbeddings {
    // Satisfy Embeddings shape at type level
    caller: any = {};
    dim = Number(process.env.RAG_EMBED_DIM || 512);
    private vec(text: string) {
      const dim = this.dim;
      const v = new Array<number>(dim).fill(0);
      const tokens = String(text || '').toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
      for (const t of tokens) {
        // Simple hash (djb2)
        let h = 5381;
        for (let i = 0; i < t.length; i++) h = ((h << 5) + h) + t.charCodeAt(i);
        const idx = Math.abs(h) % dim;
        v[idx] += 1;
      }
      // L2 normalize
      let norm = 0; for (const x of v) norm += x*x; norm = Math.sqrt(norm) || 1;
      return v.map(x => x / norm);
    }
    async embedDocuments(texts: string[]) { return texts.map(t => this.vec(t)); }
    async embedQuery(text: string) { return this.vec(text); }
  }
  return new LocalHashEmbeddings() as unknown as Embeddings;
}

// Provide an explicit local-hash embeddings helper for fallback cases
function getLocalHashEmbeddings(): Embeddings {
  class LocalHashEmbeddingsLocal {
    caller: any = {};
    dim = Number(process.env.RAG_EMBED_DIM || 512);
    private vec(text: string) {
      const dim = this.dim;
      const v = new Array<number>(dim).fill(0);
      const tokens = String(text || '').toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
      for (const t of tokens) {
        let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h) + t.charCodeAt(i);
        const idx = Math.abs(h) % dim; v[idx] += 1;
      }
      let norm = 0; for (const x of v) norm += x*x; norm = Math.sqrt(norm) || 1;
      return v.map(x => x / norm);
    }
    async embedDocuments(texts: string[]) { return texts.map(t => this.vec(t)); }
    async embedQuery(text: string) { return this.vec(text); }
  }
  return new (LocalHashEmbeddingsLocal as any)() as Embeddings;
}

// Embeddings chooser for vector store, allowing HNSW-specific override
async function getStoreEmbeddings(): Promise<Embeddings> {
  if (STORE_KIND !== 'hnsw') return getEmbeddingsAsync();
  const pref = String(process.env.RAG_HNSW_EMBEDDINGS || 'local').toLowerCase();
  if (pref === 'local') return getLocalHashEmbeddings();
  if (pref === 'openai') {
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    return new OpenAIEmbeddings({ model });
  }
  if (pref === 'hf') {
    const { HuggingFaceInferenceEmbeddings } = await import("@langchain/community/embeddings/hf").then(m=>({ HuggingFaceInferenceEmbeddings: (m as any).HuggingFaceInferenceEmbeddings }));
    const model = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    return new (HuggingFaceInferenceEmbeddings as any)({ model });
  }
  return getLocalHashEmbeddings();
}

function nsPath(ns: Namespace) { return path.join(RAG_DIR, ns); }

export async function ensureNamespace(ns: Namespace) {
  if (STORE_KIND === 'memory') {
    if (!memStores.has(ns)) memStores.set(ns, new MemoryVectorStore(await getEmbeddingsAsync()));
    return memStores.get(ns)!;
  }
  if (STORE_KIND === 'hnsw') {
    fs.mkdirSync(nsPath(ns), { recursive: true });
    // One-time migration: if new path is empty/missing but legacy exists, copy
    try {
      const newDoc = path.join(nsPath(ns), 'docstore.json');
      const legacyDoc = path.join(LEGACY_HNSW_DIR, ns, 'docstore.json');
      if (!fs.existsSync(newDoc) && fs.existsSync(legacyDoc)) {
        fs.mkdirSync(nsPath(ns), { recursive: true });
        fs.cpSync(path.join(LEGACY_HNSW_DIR, ns), nsPath(ns), { recursive: true });
        logger.info({ ns }, 'rag_hnsw_migrated_namespace');
      }
    } catch {}
    if (!hnswLoaded.has(ns)) {
      try {
        const HNSWLib = await getHNSWLib();
        const store = await HNSWLib.load(nsPath(ns), await getStoreEmbeddings());
        hnswLoaded.set(ns, store);
      } catch {
        // Will create on first index
      }
    }
    return hnswLoaded.get(ns) || null;
  }
  if (STORE_KIND === 'chroma') {
    const { Chroma } = await import("@langchain/community/vectorstores/chroma");
    const url = process.env.CHROMA_URL || 'http://localhost:8000';
    const prefix = process.env.CHROMA_COLLECTION_PREFIX || 'stock';
    const collectionName = `${prefix}_${ns}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!chromaLoaded.has(ns)) {
      try {
        const store = await Chroma.fromExistingCollection(await getEmbeddingsAsync(), { url, collectionName });
        chromaLoaded.set(ns, store);
      } catch {
        // Will create on first index
      }
    }
    return chromaLoaded.get(ns) || null;
  }
  // sqlite store is handled ad-hoc; return null placeholder
  return null as any;
}

export async function loadFromUrls(urls: string[], ns?: Namespace) {
  const docs: Document[] = [];
  const up = ns ? db.prepare(`INSERT OR REPLACE INTO rag_url_status(ns,url,last_indexed,status,note) VALUES(?,?,?,?,?)`) : null;
  for (const url of urls) {
    try {
      const loader = new CheerioWebBaseLoader(url);
      const loaded = await loader.load();
      docs.push(...loaded);
      if (ns && up) up.run(ns, url, new Date().toISOString(), 'ok', '');
    } catch (err: any) {
      if (ns && up) up.run(ns, url, new Date().toISOString(), 'error', String(err?.message || err));
      logger.warn({ ns, url, err }, 'rag_url_load_failed');
    }
  }
  return docs;
}

export async function splitDocs(docs: Document[]) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
  return splitter.splitDocuments(docs);
}

export async function indexNamespace(ns: Namespace, input: { urls?: string[], texts?: { text: string, metadata?: Record<string, unknown> }[] }) {
  await ensureNamespace(ns);
  let docs: Document[] = [];
  if (input.urls?.length) {
    const loaded = await loadFromUrls(input.urls, ns);
    docs.push(...loaded);
  }
  if (input.texts?.length) {
    const norm = (meta: Record<string, unknown> | undefined) => {
      const m: any = Object.assign({}, meta || {});
      if (m.date) {
        try {
          const d = new Date(String(m.date));
          if (isFinite(d.getTime())) m.date = d.toISOString().slice(0, 10);
          else delete m.date;
        } catch { delete m.date; }
      }
      return m;
    };
    docs.push(...input.texts.map(t => new Document({ pageContent: t.text, metadata: norm(t.metadata) })));
  }
  if (!docs.length) return { added: 0 };
  const chunks = await splitDocs(docs);
  if (STORE_KIND === 'memory') {
    const store = await ensureNamespace(ns) as MemoryVectorStore;
    try { await store.addDocuments(chunks); }
    catch (err) {
      logger.warn({ err, ns }, 'rag_embed_memory_failed_fallback_hash');
      const alt = new MemoryVectorStore(getLocalHashEmbeddings());
      memStores.set(ns, alt);
      await alt.addDocuments(chunks);
    }
  } else if (STORE_KIND === 'hnsw') {
    let store = hnswLoaded.get(ns);
    const HNSWLib = await getHNSWLib();
    if (!store) {
      try { store = await HNSWLib.fromDocuments(chunks, await getStoreEmbeddings()); }
      catch (err) {
        logger.warn({ err, ns }, 'rag_embed_hnsw_failed_primary');
        // Try HF backup first if available, else local
        try {
          if (process.env.HUGGINGFACEHUB_API_KEY && String(process.env.RAG_HF_BACKUP || 'true').toLowerCase() === 'true') {
            const mod = await import("@langchain/community/embeddings/hf");
            const HF = mod.HuggingFaceInferenceEmbeddings;
            const emb = new HF({ model: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2' });
            store = await HNSWLib.fromDocuments(chunks, emb as any);
          } else {
            throw new Error('hf_backup_not_enabled');
          }
        } catch (e2) {
          logger.warn({ err: e2, ns }, 'rag_embed_hnsw_failed_hf_fallback');
          store = await HNSWLib.fromDocuments(chunks, getLocalHashEmbeddings());
        }
      }
      hnswLoaded.set(ns, store);
    } else {
      try { await store.addDocuments(chunks); }
      catch (err) {
        logger.warn({ err, ns }, 'rag_embed_hnsw_add_failed');
        try {
          // Fallback: manually embed with store embeddings (then addVectors)
          let emb: any = (store as any)?.embeddings || null;
          if (!emb) {
            if (process.env.HUGGINGFACEHUB_API_KEY && String(process.env.RAG_HF_BACKUP || 'true').toLowerCase() === 'true') {
              const mod = await import("@langchain/community/embeddings/hf");
              const HF = mod.HuggingFaceInferenceEmbeddings;
              emb = new HF({ model: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2' });
            } else {
              emb = await getStoreEmbeddings();
            }
          }
          const vectors = await emb.embedDocuments(chunks.map((c: any)=> c.pageContent));
          if (Array.isArray(vectors) && vectors.length === chunks.length) {
            await (store as any).addVectors(vectors, chunks);
          }
        } catch (e2) {
          logger.warn({ err: e2, ns }, 'rag_embed_hnsw_addvectors_failed');
        }
      }
    }
    await store!.save(nsPath(ns));
  } else if (STORE_KIND === 'chroma') {
    const { Chroma } = await import("@langchain/community/vectorstores/chroma");
    const url = process.env.CHROMA_URL || 'http://localhost:8000';
    const prefix = process.env.CHROMA_COLLECTION_PREFIX || 'stock';
    const collectionName = `${prefix}_${ns}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    let store = chromaLoaded.get(ns);
    if (!store) {
      store = await Chroma.fromDocuments(chunks, await getEmbeddingsAsync(), { url, collectionName });
      chromaLoaded.set(ns, store);
    } else {
      await store.addDocuments(chunks);
    }
  } else {
    // sqlite: embed and persist
    let embeds: number[][];
    try { embeds = await (await getEmbeddingsAsync()).embedDocuments(chunks.map(c=>c.pageContent)) as any; }
    catch (err) {
      logger.warn({ err, ns }, 'rag_embed_sqlite_failed_primary');
      try {
        if (process.env.HUGGINGFACEHUB_API_KEY && String(process.env.RAG_HF_BACKUP || 'true').toLowerCase() === 'true') {
          const mod = await import("@langchain/community/embeddings/hf");
          const HF = mod.HuggingFaceInferenceEmbeddings;
          const emb = new HF({ model: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2' });
          embeds = await (emb as any).embedDocuments(chunks.map(c=>c.pageContent)) as any;
        } else {
          throw new Error('hf_backup_not_enabled');
        }
      } catch (e2) {
        logger.warn({ err: e2, ns }, 'rag_embed_sqlite_failed_hf_fallback');
        embeds = await (getLocalHashEmbeddings() as any).embedDocuments(chunks.map(c=>c.pageContent));
      }
    }
    const stmt = db.prepare(`INSERT OR REPLACE INTO rag_embeddings(ns,id,text,metadata,vector) VALUES(?,?,?,?,?)`);
    db.transaction(()=>{
      for (let i=0;i<chunks.length;i++) {
        const c = chunks[i];
        const id = crypto.createHash('sha1').update(c.pageContent).digest('hex');
        stmt.run(ns, id, c.pageContent, JSON.stringify(c.metadata||{}), JSON.stringify(embeds[i]));
      }
    })();
  }
  return { added: chunks.length };
}

export function getStoreKind() { return STORE_KIND; }

export async function retrieve(ns: Namespace, query: string, k = 5, opts?: { dateCutoff?: string, minScore?: number }) {
  const cutoff = opts?.dateCutoff ? String(opts.dateCutoff) : '';
  const minScore = typeof opts?.minScore === 'number' ? opts!.minScore : undefined;
  if (STORE_KIND === 'memory') {
    const store = await ensureNamespace(ns) as MemoryVectorStore;
    try {
      // Prefer similaritySearchWithScore to capture scores
      const pairs = await (store as any).similaritySearchWithScore?.(query, k * 2) || [];
      let docs = pairs.map((p: any) => { const [d, s] = p; (d.metadata as any)._score = s; return d; });
      if (!pairs.length) {
        const retriever = store.asRetriever(k);
        docs = await retriever.invoke(query);
      }
      if (cutoff) docs = docs.filter(d => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter(d => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    } catch {
      const retriever = store.asRetriever(k);
      let docs = await retriever.invoke(query);
      if (cutoff) docs = docs.filter(d => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter(d => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    }
  }
  if (STORE_KIND === 'hnsw') {
    let store = hnswLoaded.get(ns);
    if (!store) {
      try { const HNSWLib = await getHNSWLib(); store = await HNSWLib.load(nsPath(ns), await getStoreEmbeddings()); hnswLoaded.set(ns, store); } catch { return []; }
    }
    try {
      const pairs = await (store as any).similaritySearchWithScore?.(query, k * 2) || [];
      let docs = pairs.map((p: any) => { const [d, s] = p; (d.metadata as any)._score = s; return d; });
      if (!pairs.length) {
        const retriever = store.asRetriever(k);
        docs = await retriever.invoke(query);
      }
      if (cutoff) docs = docs.filter(d => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter(d => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    } catch {
      const retriever = store.asRetriever(k);
      let docs = await retriever.invoke(query);
      if (cutoff) docs = docs.filter(d => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter(d => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    }
  }
  if (STORE_KIND === 'chroma') {
    let store = chromaLoaded.get(ns);
    const { Chroma } = await import("@langchain/community/vectorstores/chroma");
    if (!store) {
      try {
        const url = process.env.CHROMA_URL || 'http://localhost:8000';
        const prefix = process.env.CHROMA_COLLECTION_PREFIX || 'stock';
        const collectionName = `${prefix}_${ns}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
        store = await Chroma.fromExistingCollection(await getEmbeddingsAsync(), { url, collectionName });
        chromaLoaded.set(ns, store);
      } catch { return []; }
    }
    try {
      const pairs = await (store as any).similaritySearchWithScore?.(query, k * 2, cutoff ? { date: { $gte: cutoff } } : undefined) || [];
      let docs = pairs.map((p: any) => { const [d, s] = p; (d.metadata as any)._score = s; return d; });
      if (!pairs.length) {
        const retriever = store.asRetriever(k);
        docs = await retriever.invoke(query);
      }
      if (cutoff) docs = docs.filter((d: any) => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter((d: any) => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    } catch {
      const retriever = store.asRetriever(k);
      let docs = await retriever.invoke(query);
      if (cutoff) docs = docs.filter((d: any) => { const dstr = String((d.metadata as any)?.date || ''); return !cutoff || (dstr && dstr >= cutoff); });
      if (minScore !== undefined) docs = docs.filter((d: any) => (d.metadata as any)?._score === undefined || (d.metadata as any)._score >= minScore);
      return docs.slice(0, k);
    }
  }
  // sqlite
  const emb = await (await getEmbeddingsAsync()).embedQuery(query);
  const rows = db.prepare(`SELECT id,text,metadata,vector FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{id:string,text:string,metadata:string,vector:string}>;
  const filtered = rows.filter(r => {
    if (!cutoff) return true; try { const md = JSON.parse(r.metadata || '{}'); const dstr = String(md?.date || ''); return dstr && dstr >= cutoff; } catch { return false; }
  });
  const scored = filtered.map(r=>{ const v = JSON.parse(r.vector || '[]') as number[]; let dot=0,a=0,b=0; for (let i=0;i<emb.length;i++){ const x=emb[i]||0, y=v[i]||0; dot+=x*y; a+=x*x; b+=y*y; } const sim = dot/((Math.sqrt(a)||1)*(Math.sqrt(b)||1)); return { id:r.id, text:r.text, metadata: JSON.parse(r.metadata||'{}'), score: sim }; })
    .filter(s => minScore === undefined || s.score >= minScore)
    .sort((x,y)=>y.score-x.score).slice(0,k);
  return scored.map(s=> { const d = new Document({ pageContent: s.text, metadata: { ...s.metadata, _score: s.score } }); return d; });
}

function formatDocs(docs: Document[]) {
  return docs.map((d, i) => `Source ${i + 1}:
${d.pageContent}
`).join('\n\n');
}

export async function answer(ns: Namespace, question: string, k = 5, opts?: { dateCutoff?: string, minScore?: number }) {
  const docs = await retrieve(ns, question, k, opts);
  const llm = process.env.OPENAI_API_KEY ? new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
  }) : null;
  if (!llm) {
    return { answer: null, sources: docs.map(d=>({ text: d.pageContent, metadata: d.metadata })) };
  }
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a concise assistant. Answer using the provided context. If unsure, say you don't know. Return facts only relevant to the question."],
    ["human", "Question: {question}\n\nContext:\n{context}"]
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const response = await chain.invoke({ question, context: formatDocs(docs) });
  return { answer: response, sources: docs.map(d=>({ text: d.pageContent, metadata: d.metadata })) };
}

export async function answerSSE(ns: Namespace, question: string, k = 5, onChunk?: (ev: {type:'sources'|'answer', data:any})=>void, opts?: { dateCutoff?: string, minScore?: number }) {
  const docs = await retrieve(ns, question, k, opts);
  onChunk?.({ type:'sources', data: docs.map(d=>({ text: d.pageContent, metadata: d.metadata })) });
  if (!process.env.OPENAI_API_KEY) {
    onChunk?.({ type:'answer', data: null });
    return;
  }
  const llm = new ChatOpenAI({ modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2 });
  const prompt = ChatPromptTemplate.fromMessages([["system","You are a concise assistant. Answer with only facts from context."],["human","Question: {question}\n\nContext:\n{context}"]]);
  const msgs = await prompt.formatMessages({ question, context: formatDocs(docs) });
  // Try token streaming; fallback to single response
  try {
    const stream = await llm.stream(msgs);
    let acc = '';
    for await (const token of stream) { acc += String(token); onChunk?.({ type:'answer', data: token }); }
    if (!acc) {
      const full = await llm.invoke(msgs);
      onChunk?.({ type:'answer', data: String(full.content || '') });
    }
  } catch {
    const full = await llm.invoke(msgs);
    onChunk?.({ type:'answer', data: String((full as any).content || '') });
  }
}

// Health check: report RAG store status and Chroma connectivity if configured
export async function ragHealth() {
  const store = STORE_KIND;
  const llm = {
    enabled: !!process.env.OPENAI_API_KEY,
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'none',
    model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : null,
  } as const;
  if (store === 'chroma') {
    try {
      const { Chroma } = await import("@langchain/community/vectorstores/chroma");
      const url = process.env.CHROMA_URL || 'http://localhost:8000';
      const collectionName = (process.env.CHROMA_COLLECTION_PREFIX || 'stock') + '_health';
      // Try to get or create a lightweight collection
      await Chroma.fromTexts(['ok'], [{}], await getEmbeddingsAsync(), { url, collectionName });
      return { ok: true, store, chroma: { url, collectionName }, llm };
    } catch (err:any) {
      return { ok: false, store, error: String(err?.message || err), llm };
    }
  }
  // For other stores, assume healthy if code is reachable
  return { ok: true, store, llm };
}

// Stats helpers for UI: list namespaces and counts across different stores
export async function ragStatsAll(): Promise<Array<{ ns: string, docs: number | null }>> {
  if (STORE_KIND === 'sqlite') {
    const rows = db.prepare(`SELECT ns, COUNT(1) as docs FROM rag_embeddings GROUP BY ns ORDER BY ns`).all() as Array<{ns:string, docs:number}>;
    return rows.map(r => ({ ns: r.ns, docs: Number(r.docs||0) }));
  }
  if (STORE_KIND === 'memory') {
    const out: Array<{ns:string, docs:number|null}> = [];
    for (const [ns, store] of memStores.entries()) {
      let n: number | null = null;
      try { const anyStore: any = store as any; n = Array.isArray(anyStore?.memoryVectors) ? anyStore.memoryVectors.length : null; } catch {}
      out.push({ ns, docs: n });
    }
    return out;
  }
  if (STORE_KIND === 'hnsw') {
    const out: Array<{ns:string, docs:number|null}> = [];
    const set = new Set<string>();
    const scan = (base: string) => {
      try {
        if (!fs.existsSync(base)) return;
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const dir of entries) { if (dir.isDirectory()) set.add(dir.name); }
      } catch {}
    };
    scan(RAG_DIR); scan(LEGACY_HNSW_DIR);
    for (const ns of set) {
      let count: number | null = null;
      const newDoc = path.join(RAG_DIR, ns, 'docstore.json');
      const legacyDoc = path.join(LEGACY_HNSW_DIR, ns, 'docstore.json');
      try {
        const doc = fs.existsSync(newDoc) ? newDoc : (fs.existsSync(legacyDoc) ? legacyDoc : '');
        if (doc) {
          const j = JSON.parse(fs.readFileSync(doc, 'utf8')) as any;
          const docsObj = j?.docstore?.docs || j?.docs || null;
          if (docsObj && typeof docsObj === 'object') count = Object.keys(docsObj).length;
        }
      } catch {}
      out.push({ ns, docs: count });
    }
    return out;
  }
  if (STORE_KIND === 'chroma') {
    const out: Array<{ns:string, docs:number|null}> = [];
    for (const [ns] of chromaLoaded.entries()) out.push({ ns, docs: null });
    return out;
  }
  return [];
}

export async function ragStatsDetail(ns: Namespace): Promise<{ ns: string, docs: number | null, dateRange?: { min: string | null, max: string | null } }> {
  if (STORE_KIND === 'sqlite') {
    const countRow = db.prepare(`SELECT COUNT(1) as docs FROM rag_embeddings WHERE ns=?`).get(ns) as {docs:number} | undefined;
    const rows = db.prepare(`SELECT metadata FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{metadata:string}>;
    let minDate: string | null = null, maxDate: string | null = null;
    for (const r of rows) {
      try { const md = JSON.parse(r.metadata||'{}'); const d = String((md as any)?.date || ''); if (!d) continue; if (!minDate || d < minDate) minDate = d; if (!maxDate || d > maxDate) maxDate = d; } catch {}
    }
    return { ns, docs: Number(countRow?.docs || 0), dateRange: { min: minDate, max: maxDate } };
  }
  if (STORE_KIND === 'hnsw') {
    const newDoc = path.join(RAG_DIR, ns, 'docstore.json');
    const legacyDoc = path.join(LEGACY_HNSW_DIR, ns, 'docstore.json');
    let docs: number | null = null; let minDate: string | null = null, maxDate: string | null = null;
    try {
      const doc = fs.existsSync(newDoc) ? newDoc : (fs.existsSync(legacyDoc) ? legacyDoc : '');
      if (doc) {
        const j = JSON.parse(fs.readFileSync(doc, 'utf8')) as any;
        const docsObj = j?.docstore?.docs || j?.docs || null;
        if (docsObj && typeof docsObj === 'object') {
          const vals = Object.values(docsObj) as Array<any>;
          docs = vals.length;
          for (const v of vals) {
            const dstr = String(v?.metadata?.date || '');
            if (!dstr) continue;
            if (!minDate || dstr < minDate) minDate = dstr;
            if (!maxDate || dstr > maxDate) maxDate = dstr;
          }
        }
      }
    } catch {}
    return { ns, docs, dateRange: { min: minDate, max: maxDate } };
  }
  if (STORE_KIND === 'memory') {
    const store = memStores.get(ns) as any;
    let n: number | null = null;
    try { n = Array.isArray(store?.memoryVectors) ? store.memoryVectors.length : null; } catch {}
    return { ns, docs: n };
  }
  if (STORE_KIND === 'chroma') {
    return { ns, docs: null };
  }
  return { ns, docs: null };
}

export async function deleteDocs(ns: Namespace, filters: { source?: string; before?: string }) {
  const { source, before } = filters;
  const beforeDate = before ? String(before) : undefined;
  let deleted = 0;
  if (STORE_KIND === 'sqlite') {
    const rows = db.prepare(`SELECT id, metadata FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{id:string, metadata:string}>;
    const matches: string[] = [];
    for (const r of rows) {
      try {
        const md = JSON.parse(r.metadata || '{}');
        const src = String(md?.source || '');
        const dstr = String(md?.date || '');
        if (source && src !== source) continue;
        if (beforeDate && (!dstr || dstr >= beforeDate)) continue; // delete strictly older than before
        matches.push(r.id);
      } catch {}
    }
    if (matches.length) {
      const stmt = db.prepare(`DELETE FROM rag_embeddings WHERE ns=? AND id=?`);
      db.transaction(()=>{ for (const id of matches) stmt.run(ns, id); })();
    }
    deleted = matches.length;
    return { deleted };
  }
  if (STORE_KIND === 'memory') {
    const store = memStores.get(ns) as any;
    if (!store) return { deleted: 0 };
    try {
      const vectors = Array.isArray(store.memoryVectors) ? store.memoryVectors : [];
      const kept = [] as any[];
      for (const v of vectors) {
        const doc = v.document || v;
        const md = doc?.metadata || {};
        const src = String(md?.source || '');
        const dstr = String(md?.date || '');
        const matchSource = source ? src === source : true;
        const matchBefore = beforeDate ? (dstr && dstr < beforeDate) : true;
        const toDelete = matchSource && matchBefore;
        if (toDelete) deleted++; else kept.push(v);
      }
      store.memoryVectors = kept; // mutate in place
    } catch {}
    return { deleted };
  }
  if (STORE_KIND === 'hnsw') {
    // Manipulate docstore.json
    const newDoc = path.join(RAG_DIR, ns, 'docstore.json');
    const legacyDoc = path.join(LEGACY_HNSW_DIR, ns, 'docstore.json');
    const docPath = fs.existsSync(newDoc) ? newDoc : (fs.existsSync(legacyDoc) ? legacyDoc : '');
    if (!docPath) return { deleted: 0 };
    try {
      const content = JSON.parse(fs.readFileSync(docPath, 'utf8')) as any;
      const docsObj = content?.docstore?.docs || content?.docs || {};
      const remaining: any = {};
      for (const [id, d] of Object.entries(docsObj)) {
        const md: any = (d as any)?.metadata || {};
        const src = String(md?.source || '');
        const dstr = String(md?.date || '');
        const matchSource = source ? src === source : true;
        const matchBefore = beforeDate ? (dstr && dstr < beforeDate) : true;
        const toDelete = matchSource && matchBefore;
        if (toDelete) deleted++; else remaining[id] = d;
      }
      if (content.docstore && content.docstore.docs) content.docstore.docs = remaining;
      else content.docs = remaining;
      fs.writeFileSync(docPath, JSON.stringify(content));
      // Rebuild in-memory store if loaded
      if (hnswLoaded.has(ns)) {
        try {
          const HNSWLib = await getHNSWLib();
            const allDocs = Object.values(remaining).map((r: any)=> new Document({ pageContent: r.pageContent || r.page_content || r.page_content_ || '', metadata: r.metadata || {} }));
            const store = await HNSWLib.fromDocuments(allDocs, await getStoreEmbeddings());
            hnswLoaded.set(ns, store);
            await store.save(nsPath(ns));
        } catch {}
      }
    } catch {}
    return { deleted };
  }
  if (STORE_KIND === 'chroma') {
    // Chroma: no efficient metadata delete without ids; skip for now
    return { deleted: 0, note: 'chroma_delete_not_implemented' } as any;
  }
  return { deleted };
}
