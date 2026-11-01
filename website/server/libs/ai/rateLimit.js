import nconf from 'nconf';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Per-user limit on AI calls, separate from the general API rate limit,
// because each call costs money. In-memory is enough for a single instance.

const POINTS = Number(nconf.get('AI_RATE_LIMIT_PER_HOUR')) || 30;

const limiter = new RateLimiterMemory({
  keyPrefix: 'ai',
  points: POINTS,
  duration: 60 * 60,
});

// Returns true when the call is allowed, false when the user is over the limit.
export async function consumeAiQuota (userId) {
  try {
    await limiter.consume(userId);
    return true;
  } catch (err) {
    if (err instanceof Error) throw err;
    return false;
  }
}
