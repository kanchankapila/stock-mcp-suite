import Sentiment from 'sentiment';

const sentiment = new Sentiment();

export function sentimentScore(texts: string[]): number {
  if (!texts.length) return 0;
  const scores = texts.map(t => sentiment.analyze(t || '').comparative || 0);
  const avg = scores.reduce((a,b)=>a+b, 0) / scores.length;
  return avg; // roughly -1..+1
}
