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

type StoreKind = 'memory' | 'hnsw' | 'sqlite';
const STORE_KIND: StoreKind = (process.env.RAG_STORE as StoreKind) || 'memory';
const RAG_DIR = process.env.RAG_DIR || path.resolve(process.cwd(), 'data', 'rag');

const memStores = new Map<Namespace, MemoryVectorStore>();
const hnswLoaded = new Map<Namespace, any>();
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
  logger.warn('rag_embeddings_missing_provider');
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  return new OpenAIEmbeddings({ model });
}

function nsPath(ns: Namespace) { return path.join(RAG_DIR, ns); }

export async function ensureNamespace(ns: Namespace) {
  if (STORE_KIND === 'memory') {
    if (!memStores.has(ns)) memStores.set(ns, new MemoryVectorStore(await getEmbeddingsAsync()));
    return memStores.get(ns)!;
  }
  if (STORE_KIND === 'hnsw') {
    fs.mkdirSync(nsPath(ns), { recursive: true });
    if (!hnswLoaded.has(ns)) {
      try {
        const HNSWLib = await getHNSWLib();
        const store = await HNSWLib.load(nsPath(ns), await getEmbeddingsAsync());
        hnswLoaded.set(ns, store);
      } catch {
        // Will create on first index
      }
    }
    return hnswLoaded.get(ns) || null;
  }
  // sqlite store is handled ad-hoc; return null placeholder
  return null as any;
}

export async function loadFromUrls(urls: string[]) {
  const docs: Document[] = [];
  for (const url of urls) {
    const loader = new CheerioWebBaseLoader(url);
    const loaded = await loader.load();
    docs.push(...loaded);
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
    const loaded = await loadFromUrls(input.urls);
    docs.push(...loaded);
  }
  if (input.texts?.length) {
    docs.push(...input.texts.map(t => new Document({ pageContent: t.text, metadata: t.metadata || {} })));
  }
  if (!docs.length) return { added: 0 };
  const chunks = await splitDocs(docs);
  if (STORE_KIND === 'memory') {
    const store = await ensureNamespace(ns) as MemoryVectorStore;
    await store.addDocuments(chunks);
  } else if (STORE_KIND === 'hnsw') {
    let store = hnswLoaded.get(ns);
    const HNSWLib = await getHNSWLib();
    if (!store) {
      store = await HNSWLib.fromDocuments(chunks, await getEmbeddingsAsync());
      hnswLoaded.set(ns, store);
    } else {
      await store.addDocuments(chunks);
    }
    await store.save(nsPath(ns));
  } else {
    // sqlite: embed and persist
    const embeds = await (await getEmbeddingsAsync()).embedDocuments(chunks.map(c=>c.pageContent));
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

export async function retrieve(ns: Namespace, query: string, k = 5) {
  if (STORE_KIND === 'memory') {
    const store = await ensureNamespace(ns) as MemoryVectorStore;
    const retriever = store.asRetriever(k);
    return retriever.invoke(query);
  }
  if (STORE_KIND === 'hnsw') {
    let store = hnswLoaded.get(ns);
    if (!store) {
      try { const HNSWLib = await getHNSWLib(); store = await HNSWLib.load(nsPath(ns), await getEmbeddingsAsync()); hnswLoaded.set(ns, store); } catch { return []; }
    }
    const retriever = store.asRetriever(k);
    return retriever.invoke(query);
  }
  // sqlite
  const emb = await (await getEmbeddingsAsync()).embedQuery(query);
  const rows = db.prepare(`SELECT id,text,metadata,vector FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{id:string,text:string,metadata:string,vector:string}>;
  const scored = rows.map(r=>{
    const v = JSON.parse(r.vector) as number[];
    // cosine similarity
    let dot=0, a=0, b=0; for (let i=0;i<emb.length;i++){ const x=emb[i]||0, y=v[i]||0; dot+=x*y; a+=x*x; b+=y*y; }
    const sim = dot/((Math.sqrt(a)||1)*(Math.sqrt(b)||1));
    return { id:r.id, text:r.text, metadata: JSON.parse(r.metadata||'{}'), score: sim };
  }).sort((x,y)=>y.score-x.score).slice(0,k);
  return scored.map(s=> new Document({ pageContent: s.text, metadata: s.metadata }));
}

function formatDocs(docs: Document[]) {
  return docs.map((d, i) => `Source ${i + 1}:
${d.pageContent}
`).join('\n\n');
}

export async function answer(ns: Namespace, question: string, k = 5) {
  const docs = await retrieve(ns, question, k);
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

export async function answerSSE(ns: Namespace, question: string, k = 5, onChunk?: (ev: {type:'sources'|'answer', data:any})=>void) {
  const docs = await retrieve(ns, question, k);
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
