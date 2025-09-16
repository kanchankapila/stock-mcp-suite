// Simple token bucket rate limiter per provider
export class RateLimiter {
  private capacity: number;
  private refillPerMs: number; // tokens per ms
  private tokens: number;
  private last: number;
  constructor(rpm: number) {
    const perMinute = Math.max(1, rpm);
    this.capacity = perMinute;
    this.refillPerMs = perMinute / 60000; // per minute
    this.tokens = perMinute;
    this.last = Date.now();
  }
  take(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) { this.tokens -= cost; return true; }
    return false;
  }
  private refill() {
    const now = Date.now();
    const delta = now - this.last;
    if (delta <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + delta * this.refillPerMs);
    this.last = now;
  }
  waitFor(cost = 1): Promise<void> {
    if (this.take(cost)) return Promise.resolve();
    // compute wait time until enough tokens
    const needed = cost - this.tokens;
    const ms = Math.ceil(needed / this.refillPerMs);
    return new Promise(res => setTimeout(()=> { this.refill(); this.take(cost); res(); }, ms));
  }
}
