import { RagIndexer } from './BaseProvider.js';
import { indexNamespace } from '../rag/langchain.js';

export class LangChainRagIndexer implements RagIndexer {
  async index(symbol: string, texts: { text: string; metadata?: Record<string, any> }[]): Promise<void> {
    if (!texts.length) return;
    try { await indexNamespace(symbol, { texts }); } catch { /* swallow */ }
  }
}
