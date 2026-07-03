// Simple sliding-window rate limiter used by the real API clients.
//
// GHL V2 API burst limit is 100 requests per 10 seconds per app per resource
// (docs: https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Authorization.md,
// "What are current rate limits for API 2.0?"). The design doc additionally
// caps SaaS endpoints at 10 requests/second, so we default to that stricter
// bound and stay far inside both.

export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Resolves when a request slot is available; never rejects. */
  async acquire(): Promise<void> {
    for (;;) {
      const cutoff = this.now() - this.windowMs;
      this.timestamps = this.timestamps.filter((t) => t > cutoff);
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(this.now());
        return;
      }
      const oldest = this.timestamps[0];
      const waitMs = oldest === undefined ? this.windowMs : oldest + this.windowMs - this.now();
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 5)));
    }
  }
}

/** 10 requests/second, per the design doc's SaaS endpoint constraint. */
export function ghlRateLimiter(): RateLimiter {
  return new RateLimiter(10, 1000);
}

/** Stripe allows far more, but 25 rps keeps us polite and safe. */
export function stripeRateLimiter(): RateLimiter {
  return new RateLimiter(25, 1000);
}
