// Very lightweight price prediction: simple SMA forecast
// Predict next close as the average of the last N closes.

export function predictNextClose(closes: number[], window: number = 10): number {
  if (!closes.length) return 0;
  const n = Math.min(window, closes.length);
  const recent = closes.slice(-n);
  const sum = recent.reduce((a,b)=>a+b,0);
  return sum / n;
}
