// Centralized scoring utilities
// Combines sentiment [-1,1] and momentum (return fraction) into 0-100 score and recommendation.

export interface StrategyScoreInput {
  sentiment: number; // expected in roughly [-1,1]
  momentum: number;  // raw return fraction over lookback, clamped internally to +/-50%
}
export interface StrategyScoreResult { score: number; recommendation: 'BUY'|'HOLD'|'SELL'; components: { sentiment: number; momentum: number }; }

export function computeStrategyScore(input: StrategyScoreInput): StrategyScoreResult {
  const sRaw = Number.isFinite(input.sentiment) ? input.sentiment : 0;
  const mRaw = Number.isFinite(input.momentum) ? input.momentum : 0;
  const s = Math.max(-1, Math.min(1, sRaw));
  const m = Math.max(-0.5, Math.min(0.5, mRaw)); // clamp to +/-50%
  // Sentiment and momentum each contribute 50 points (simple for now)
  const sScore = (s + 1) / 2 * 50; // 0..50
  const mScore = (m + 0.5) / 1.0 * 50; // 0..50
  const score = Math.round(sScore + mScore);
  let recommendation: StrategyScoreResult['recommendation'] = 'HOLD';
  if (score >= 66) recommendation = 'BUY';
  else if (score <= 33) recommendation = 'SELL';
  return { score, recommendation, components: { sentiment: Number(sScore.toFixed(2)), momentum: Number(mScore.toFixed(2)) } };
}

// Backwards compatibility helper mirroring old signature (sentiment, momentum)
export function scoreStrategy(sentiment: number, momentum: number) {
  return computeStrategyScore({ sentiment, momentum });
}
