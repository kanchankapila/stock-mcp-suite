declare module '../analytics/features.js' {
  export function getStoredFeatures(symbol: string, days?: number): Promise<any[]>;
}
