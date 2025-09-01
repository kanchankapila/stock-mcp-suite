import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { indexNamespace, retrieve as lcRetrieve, answer as lcAnswer, answerSSE } from '../rag/langchain.js';

export const router = Router();

router.post('/index', asyncHandler(async (req, res) => {
  const { namespace, urls, texts } = req.body || {};
  if (!namespace) return res.status(400).json({ ok:false, error: 'namespace required' });
  const result = await indexNamespace(String(namespace), { urls, texts });
  res.json({ ok:true, ...result });
}));

router.post('/query', asyncHandler(async (req, res) => {
  const { namespace, query, k, withAnswer } = req.body || {};
  if (!namespace || !query) return res.status(400).json({ ok:false, error: 'namespace and query required' });
  if (withAnswer) {
    const out = await lcAnswer(String(namespace), String(query), Number(k||5));
    return res.json({ ok:true, ...out });
  }
  const docs = await lcRetrieve(String(namespace), String(query), Number(k||5));
  res.json({ ok:true, hits: docs.map(d=>({ text: d.pageContent, metadata: d.metadata })) });
}));

// SSE streaming answer
router.post('/stream', asyncHandler(async (req, res) => {
  const { namespace, query, k } = req.body || {};
  if (!namespace || !query) return res.status(400).json({ ok:false, error: 'namespace and query required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (ev: string, data: any) => { res.write(`event: ${ev}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
  await answerSSE(String(namespace), String(query), Number(k||5), ({type, data}) => send(type, data));
  res.end();
}));
