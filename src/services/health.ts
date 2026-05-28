import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { listProviders } from "./state.js";
import { readUsageLogs } from "./usage-log.js";

export async function readAdminHealth() {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    listProviders()
  ]);

  const providers = checks[2].status === "fulfilled" ? checks[2].value : [];
  const logs = await readUsageLogs(200);
  const recentFailures = logs.filter((log) => !log.success).length;
  const avgLatencyMs = logs.length
    ? Math.round(logs.reduce((sum, log) => sum + log.latencyMs, 0) / logs.length)
    : 0;
  const recentFailureRate = logs.length ? Number(((recentFailures / logs.length) * 100).toFixed(1)) : 0;

  return {
    ok: checks.every((check) => check.status === "fulfilled"),
    checks: {
      postgres: checks[0].status === "fulfilled" ? "ok" : "error",
      redis: checks[1].status === "fulfilled" && checks[1].value === "PONG" ? "ok" : "error",
      providerConfigured: providers.some((provider) => provider.configured && provider.status === "active")
    },
    metrics: {
      recentRequests: logs.length,
      recentFailures,
      recentFailureRate,
      avgLatencyMs
    }
  };
}
