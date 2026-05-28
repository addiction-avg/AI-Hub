import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://ai_relay:ai_relay_password@localhost:5432/ai_relay";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.APP_SECRET ??= "test-secret-at-least-16-chars";
process.env.ADMIN_API_KEYS = "owner:owner-secret,admin:admin-secret,viewer:viewer-secret,legacy-secret";

test("admin keys support role prefixes and legacy owner keys", async () => {
  const { authenticateAdminKey } = await import("../src/services/auth.js");

  assert.equal((await authenticateAdminKey("Bearer owner-secret"))?.role, "owner");
  assert.equal((await authenticateAdminKey("Bearer admin-secret"))?.role, "admin");
  assert.equal((await authenticateAdminKey("Bearer viewer-secret"))?.role, "viewer");
  assert.equal((await authenticateAdminKey("Bearer legacy-secret"))?.role, "owner");
  assert.equal(await authenticateAdminKey("Bearer missing"), null);
});

test("billing normalizes OpenAI usage and calculates integer credit cost", async () => {
  const { calculateCostCredits, normalizeUsageTokens } = await import("../src/services/billing.js");

  const usage = normalizeUsageTokens({
    prompt_tokens: 1200,
    completion_tokens: 800,
    total_tokens: 2000
  });

  assert.deepEqual(usage, {
    inputTokens: 1200,
    outputTokens: 800,
    totalTokens: 2000
  });
  assert.equal(
    calculateCostCredits({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputTokenPricePerMillion: 1000,
      outputTokenPricePerMillion: 2000
    }),
    3
  );
  assert.equal(
    calculateCostCredits({
      inputTokens: 0,
      outputTokens: 0,
      inputTokenPricePerMillion: 0,
      outputTokenPricePerMillion: 0
    }),
    1
  );
});
