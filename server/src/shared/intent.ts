// Unified agent intent parser (extracted from agent/agent.ts)
// Provides boolean flags for downstream logic in agentAnswer.
// If extending, keep backward compatibility with existing properties.
export interface AgentIntentFlags {
  symbol: string;
  wantSentiment: boolean;
  wantPrediction: boolean;
  wantBacktest: boolean;
  wantRag: boolean;
  wantIngest: boolean;
  wantOverview: boolean;
  wantHistory: boolean;
  wantDbStats: boolean;
  wantResolve: boolean;
  wantMc: boolean;
  wantRagIndex: boolean;
  wantRagAnswer: boolean;
}

export function parseAgentIntent(prompt: string): AgentIntentFlags {
  const p = (prompt||'').toLowerCase();
  const flags = {
    wantSentiment: /sentiment|news/.test(p),
    wantPrediction: /predict|forecast/.test(p),
    wantBacktest: /backtest|strategy/.test(p),
    wantRag: /why|explain|details|context|news|filing|report|rag|sources/.test(p),
    wantIngest: /\bingest\b|\bfetch\b|\bload\b|pull|update data/.test(p),
    wantOverview: /overview|summary|last close|change/.test(p),
    wantHistory: /history|prices|chart/.test(p),
    wantDbStats: /\bdb\b|database|counts|rows/.test(p),
    wantResolve: /resolve|map|identifiers|ids/.test(p),
    wantMc: /moneycontrol|mc insight|\binsight\b/.test(p),
    wantRagIndex: /rag index|index urls|add urls|add documents/.test(p),
    wantRagAnswer: /rag answer|\bqa\b|question|\bask\b/.test(p)
  } as const;
  // crude symbol detection: uppercase word 1-5 chars or after "for " (retain original logic)
  const m = prompt.match(/\b([A-Z]{1,5})\b/) || prompt.match(/for\s+([A-Za-z.]{1,10})/i);
  const symbol = (m?.[1] || '').toUpperCase();
  return { symbol, ...flags };
}
