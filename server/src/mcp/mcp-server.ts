// Minimal MCP-like JSON-RPC tool interface over HTTP for demo purposes.
// Not a full MCP stdio implementation, but mirrors the concept of 'tools' for an agent.

import express from 'express';
import { logger } from '../utils/logger.js';

export function attachMcp(app: express.Express) {
  app.post('/mcp/tool', async (req, res, next) => {
    try {
      const { tool, params } = req.body || {};
      logger.info({ tool }, 'mcp_tool_call');
      if (tool === 'health') return res.json({ ok:true, tool, result: 'ok' });
      return res.status(400).json({ ok:false, error: 'Unknown tool' });
    } catch (err) {
      logger.error({ err }, 'mcp_tool_failed');
      next(err);
    }
  });

  app.get('/mcp/schema', (req, res) => {
    res.json({
      tools: [
        { name: 'health', input: {}, output: { ok: 'boolean', result: 'string' } }
      ]
    });
  });
}
