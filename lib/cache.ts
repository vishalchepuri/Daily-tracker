import Redis from "ioredis";

const MAX_CACHE_BYTES = 256 * 1024;
const DEFAULT_CACHE_TTL_SECONDS = 300;

let redis: Redis | null | undefined;

function getRedisClient() {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redis = null;
    return redis;
  }
  const parsedUrl = new URL(url);
  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2500,
    commandTimeout: 2500,
    tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
  });
  redis.on("error", () => {
    // Cache failures must never break app features.
  });
  return redis;
}

async function ensureRedisConnected(client: Redis) {
  if (client.status === "ready") return true;
  if (client.status === "connecting" || client.status === "connect") {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2500);
      client.once("ready", () => {
        clearTimeout(timer);
        resolve(true);
      });
      client.once("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  }
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    if (!(await ensureRedisConnected(client))) return null;
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS) {
  const client = getRedisClient();
  if (!client) return false;
  try {
    if (!(await ensureRedisConnected(client))) return false;
    const raw = JSON.stringify(value);
    if (Buffer.byteLength(raw, "utf8") > MAX_CACHE_BYTES) return false;
    await client.set(key, raw, "EX", ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDeletePattern(pattern: string) {
  const client = getRedisClient();
  if (!client) return 0;
  try {
    if (!(await ensureRedisConnected(client))) return 0;
    let cursor = "0";
    let deleted = 0;
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 50);
      cursor = nextCursor;
      if (keys.length) deleted += await client.del(...keys);
    } while (cursor !== "0");
    return deleted;
  } catch {
    return 0;
  }
}

export async function cachePing() {
  const client = getRedisClient();
  if (!client) return { configured: false, ok: false };
  try {
    if (!(await ensureRedisConnected(client))) return { configured: true, ok: false };
    const response = await client.ping();
    return { configured: true, ok: response === "PONG" };
  } catch {
    return { configured: true, ok: false };
  }
}
