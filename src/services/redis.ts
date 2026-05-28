import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: 1
});

redis.on("error", () => {
  // Startup and request paths surface Redis failures explicitly.
});

export async function ensureRedisReady() {
  const result = await redis.ping();
  if (result !== "PONG") {
    throw new Error("Redis ping failed");
  }
}

export async function disconnectRedis() {
  redis.disconnect();
}

export async function consumeRateLimit(clientId: string) {
  const key = `rate-limit:${clientId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.pexpire(key, env.RATE_LIMIT_WINDOW_MS);
  }

  const ttl = await redis.pttl(key);
  return {
    allowed: count <= env.RATE_LIMIT_MAX,
    count,
    limit: env.RATE_LIMIT_MAX,
    remaining: Math.max(0, env.RATE_LIMIT_MAX - count),
    resetMs: ttl
  };
}
