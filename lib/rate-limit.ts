import { cacheIncrement } from "@/lib/cache";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(
  req: Request,
  name: string,
  options: { limit: number; windowMs: number; userId?: string | null }
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const identity = options.userId || clientIp(req);
  const key = `${name}:${identity}`;
  const redisKey = `v1:rate-limit:${name}:${encodeURIComponent(identity)}`;
  const ttlSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  return cacheIncrement(redisKey, ttlSeconds).then((redisResult) => {
    if (redisResult !== null) {
      const resetAt = now + redisResult.ttlMs;
      return {
        ok: redisResult.count <= options.limit,
        remaining: Math.max(0, options.limit - redisResult.count),
        resetAt,
      };
    }

    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return { ok: true, remaining: options.limit - 1, resetAt: now + options.windowMs };
    }

    if (current.count >= options.limit) {
      return { ok: false, remaining: 0, resetAt: current.resetAt };
    }

    current.count += 1;
    return { ok: true, remaining: options.limit - current.count, resetAt: current.resetAt };
  });
}

export function memoryRateLimit(
  req: Request,
  name: string,
  options: { limit: number; windowMs: number; userId?: string | null }
) {
  const now = Date.now();
  const identity = options.userId || clientIp(req);
  const key = `${name}:${identity}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.limit - 1, resetAt: now + options.windowMs };
  }

  if (current.count >= options.limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { ok: true, remaining: options.limit - current.count, resetAt: current.resetAt };
}

export function rateLimitHeaders(result: { remaining: number; resetAt: number }) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
