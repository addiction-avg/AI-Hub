import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { authenticateAdminKey, authenticateApiKey, canOwn, canWrite, listClients, type AdminRole, type AuthenticatedAdmin } from "./services/auth.js";
import { readAuditLogs, redactValue, writeAuditLog } from "./services/audit-log.js";
import { calculateCostCredits, createTopUpOrder, getBillingSummary, listTopUpOrders, normalizeUsageTokens, updateTopUpOrder } from "./services/billing.js";
import { debitCredits, getBalance, getTotalBalance, recordBalanceAdjustment, spendCredit } from "./services/credits.js";
import { readAdminHealth } from "./services/health.js";
import { listPublicModels, resolveProviderModel } from "./services/model-router.js";
import { consumeRateLimit } from "./services/redis.js";
import {
  createApiKey,
  deleteModel,
  getApiKeyById,
  getPrimaryProvider,
  listModels,
  listProviders,
  updateApiKey,
  updateProvider,
  upsertModel
} from "./services/state.js";
import { readUsageLogs, writeUsageLog } from "./services/usage-log.js";

type ChatBody = {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
};

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: {
      message: "Missing or invalid API key",
      type: "authentication_error"
    }
  });
}

function forbiddenAdmin(reply: FastifyReply) {
  return reply.code(401).send({
    error: {
      message: "Missing or invalid admin key",
      type: "admin_authentication_error"
    }
  });
}

function forbiddenRole(reply: FastifyReply) {
  return reply.code(403).send({
    error: {
      message: "Admin role is not allowed to perform this action",
      type: "authorization_error"
    }
  });
}

function requireAdminRole(request: FastifyRequest, reply: FastifyReply, allowed: AdminRole[]) {
  const admin = request.admin;
  if (!admin) {
    forbiddenAdmin(reply);
    return null;
  }

  if (!allowed.includes(admin.role)) {
    forbiddenRole(reply);
    return null;
  }

  return admin;
}

async function audit(request: FastifyRequest, admin: AuthenticatedAdmin, input: {
  action: Parameters<typeof writeAuditLog>[0]["action"];
  objectType: string;
  objectId: string;
  changeSummary?: Record<string, unknown>;
}) {
  await writeAuditLog({
    admin,
    request,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    changeSummary: redactValue(input.changeSummary ?? {}) as Prisma.InputJsonObject
  });
}

async function enforceRateLimit(clientId: string, reply: FastifyReply) {
  const result = await consumeRateLimit(clientId);
  reply.header("x-ratelimit-limit", result.limit);
  reply.header("x-ratelimit-remaining", result.remaining);
  reply.header("x-ratelimit-reset-ms", result.resetMs);

  if (!result.allowed) {
    reply.code(429).send({
      error: {
        message: "Rate limit exceeded",
        type: "rate_limit_error"
      }
    });
    return false;
  }

  return true;
}

export async function registerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/admin/")) {
      return;
    }

    const admin = await authenticateAdminKey(request.headers.authorization);
    if (!admin) {
      await forbiddenAdmin(reply);
      return reply;
    }

    if (!(await enforceRateLimit(admin.id, reply))) {
      return reply;
    }

    request.admin = admin;
  });

  app.get("/health", async () => ({
    ok: true,
    service: "ai-relay-starter",
    time: new Date().toISOString()
  }));

  app.get("/v1/models", async () => ({
    object: "list",
    data: (await listPublicModels()).map((model) => ({
      id: model,
      object: "model",
      owned_by: "ai-relay"
    }))
  }));

  app.get("/dashboard/me", async (request, reply) => {
    const client = await authenticateApiKey(request.headers.authorization);
    if (!client) {
      return unauthorized(reply);
    }

    return {
      clientId: client.id,
      balance: await getBalance(client.id),
      models: await listPublicModels()
    };
  });

  app.get("/admin/me", async (request) => ({
    adminId: request.admin?.id,
    name: request.admin?.name,
    role: request.admin?.role
  }));

  app.get("/admin/health", async () => readAdminHealth());

  app.get("/admin/audit-logs", async () => ({
    data: await readAuditLogs(100)
  }));

  app.get("/admin/summary", async () => {
    const logs = await readUsageLogs(200);
    const providers = await listProviders();
    const billing = await getBillingSummary();
    const recentFailures = logs.filter((log) => !log.success).length;
    const avgLatencyMs = logs.length
      ? Math.round(logs.reduce((sum, log) => sum + log.latencyMs, 0) / logs.length)
      : 0;
    const recentFailureRate = logs.length ? Number(((recentFailures / logs.length) * 100).toFixed(1)) : 0;

    return {
      balance: await getTotalBalance(),
      totalRequests: logs.length,
      successRate: logs.length ? Number((((logs.length - recentFailures) / logs.length) * 100).toFixed(1)) : 100,
      avgLatencyMs,
      availableModels: (await listPublicModels()).length,
      providerConfigured: providers.some((provider) => provider.configured && provider.status === "active"),
      recentFailures,
      recentFailureRate,
      todayRequests: billing.todayRequests,
      todayCostCredits: billing.todayCostCredits,
      pendingTopUps: billing.pendingTopUps
    };
  });

  app.get("/admin/models", async () => ({
    data: await listModels()
  }));

  app.get("/admin/providers", async () => ({
    data: await listProviders()
  }));

  app.get("/admin/api-keys", async () => ({
    data: await listClients()
  }));

  app.get("/admin/usage-logs", async () => ({
    data: await readUsageLogs(100)
  }));

  app.get("/admin/top-up-orders", async () => ({
    data: await listTopUpOrders(100)
  }));

  app.post("/admin/api-keys", async (
    request: FastifyRequest<{ Body: { name?: string; balance?: number } }>,
    reply
  ) => {
    const admin = requireAdminRole(request, reply, ["owner", "admin"]);
    if (!admin) {
      return reply;
    }

    const created = await createApiKey({
      name: request.body.name ?? "New API Key",
      balance: Number(request.body.balance ?? 1000)
    });

    await audit(request, admin, {
      action: "api_key.create",
      objectType: "api_key",
      objectId: created.record.id,
      changeSummary: { name: created.record.name, balance: created.record.balance }
    });

    return created;
  });

  app.patch("/admin/api-keys/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; status?: "active" | "disabled"; balance?: number };
    }>,
    reply
  ) => {
    const existing = await getApiKeyById(request.params.id);
    if (!existing) {
      return reply.code(404).send({ error: { message: "API key not found" } });
    }

    const admin = requireAdminRole(request, reply, request.body.balance !== undefined ? ["owner"] : ["owner", "admin"]);
    if (!admin) {
      return reply;
    }

    const updated = await updateApiKey(request.params.id, request.body);
    if (!updated) {
      return reply.code(404).send({ error: { message: "API key not found" } });
    }

    if (request.body.balance !== undefined && updated.balance !== existing.balance) {
      await recordBalanceAdjustment({
        apiKeyId: updated.id,
        amount: updated.balance - existing.balance,
        reason: "manual_adjustment",
        sourceType: "admin_api_key_update",
        sourceId: updated.id,
        adminId: admin.id,
        note: "Manual balance update from admin panel"
      });
    }

    await audit(request, admin, {
      action: "api_key.update",
      objectType: "api_key",
      objectId: updated.id,
      changeSummary: {
        before: {
          name: existing.name,
          status: existing.status,
          balance: existing.balance
        },
        after: {
          name: updated.name,
          status: updated.status,
          balance: updated.balance
        }
      }
    });

    return updated;
  });

  app.post("/admin/models", async (
    request: FastifyRequest<{
      Body: {
        publicName?: string;
        providerModel?: string;
        status?: "active" | "disabled";
        inputTokenPricePerMillion?: number;
        outputTokenPricePerMillion?: number;
      };
    }>,
    reply
  ) => {
    const admin = requireAdminRole(request, reply, ["owner", "admin"]);
    if (!admin) {
      return reply;
    }

    const updated = await upsertModel({
      publicName: request.body.publicName ?? "",
      providerModel: request.body.providerModel ?? "",
      status: request.body.status === "disabled" ? "disabled" : "active",
      inputTokenPricePerMillion: Number(request.body.inputTokenPricePerMillion ?? 0),
      outputTokenPricePerMillion: Number(request.body.outputTokenPricePerMillion ?? 0)
    });

    if (!updated) {
      return reply.code(400).send({ error: { message: "publicName and providerModel are required" } });
    }

    await audit(request, admin, {
      action: "model.upsert",
      objectType: "model",
      objectId: updated.publicName,
      changeSummary: {
        publicName: updated.publicName,
        providerModel: updated.providerModel,
        status: updated.status,
        inputTokenPricePerMillion: updated.inputTokenPricePerMillion,
        outputTokenPricePerMillion: updated.outputTokenPricePerMillion
      }
    });

    return updated;
  });

  app.delete("/admin/models/:publicName", async (request: FastifyRequest<{ Params: { publicName: string } }>, reply) => {
    const admin = requireAdminRole(request, reply, ["owner", "admin"]);
    if (!admin) {
      return reply;
    }

    const deleted = await deleteModel(request.params.publicName);
    if (!deleted) {
      return reply.code(404).send({ error: { message: "Model not found" } });
    }

    await audit(request, admin, {
      action: "model.delete",
      objectType: "model",
      objectId: request.params.publicName,
      changeSummary: { publicName: request.params.publicName }
    });

    return { ok: true };
  });

  app.patch("/admin/providers/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; baseUrl?: string; apiKey?: string; status?: "active" | "disabled" };
    }>,
    reply
  ) => {
    const admin = requireAdminRole(request, reply, ["owner"]);
    if (!admin) {
      return reply;
    }

    const updated = await updateProvider(request.params.id, request.body);
    await audit(request, admin, {
      action: "provider.update",
      objectType: "provider",
      objectId: updated.id,
      changeSummary: {
        name: updated.name,
        baseUrl: updated.baseUrl,
        status: updated.status,
        apiKey: request.body.apiKey ? "[updated]" : "[unchanged]"
      }
    });

    return updated;
  });

  app.post("/admin/top-up-orders", async (
    request: FastifyRequest<{
      Body: { apiKeyId?: string; amountCredits?: number; externalRef?: string; note?: string };
    }>,
    reply
  ) => {
    const admin = requireAdminRole(request, reply, ["owner", "admin"]);
    if (!admin) {
      return reply;
    }

    const amountCredits = Number(request.body.amountCredits ?? 0);
    if (!request.body.apiKeyId || !Number.isFinite(amountCredits) || amountCredits <= 0) {
      return reply.code(400).send({ error: { message: "apiKeyId and positive amountCredits are required" } });
    }

    const order = await createTopUpOrder({
      apiKeyId: request.body.apiKeyId,
      amountCredits,
      externalRef: request.body.externalRef,
      note: request.body.note,
      adminId: admin.id
    });
    if (!order) {
      return reply.code(404).send({ error: { message: "API key not found" } });
    }

    await audit(request, admin, {
      action: "top_up_order.create",
      objectType: "top_up_order",
      objectId: order.id,
      changeSummary: {
        apiKeyId: order.apiKeyId,
        amountCredits: order.amountCredits,
        status: order.status,
        externalRef: order.externalRef
      }
    });

    return order;
  });

  app.patch("/admin/top-up-orders/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { status?: "pending" | "paid" | "canceled"; note?: string };
    }>,
    reply
  ) => {
    const admin = requireAdminRole(request, reply, ["owner"]);
    if (!admin) {
      return reply;
    }

    const status = request.body.status;
    if (status !== "pending" && status !== "paid" && status !== "canceled") {
      return reply.code(400).send({ error: { message: "status must be pending, paid, or canceled" } });
    }

    const result = await updateTopUpOrder({
      id: request.params.id,
      status,
      note: request.body.note,
      adminId: admin.id
    });
    if (!result) {
      return reply.code(404).send({ error: { message: "Top-up order not found" } });
    }
    if ("error" in result) {
      return reply.code(409).send({ error: { message: "Paid top-up orders cannot be changed" } });
    }

    await audit(request, admin, {
      action: "top_up_order.update",
      objectType: "top_up_order",
      objectId: result.order.id,
      changeSummary: {
        apiKeyId: result.order.apiKeyId,
        amountCredits: result.order.amountCredits,
        status: result.order.status
      }
    });

    return result.order;
  });

  app.post("/v1/chat/completions", async (request: FastifyRequest<{ Body: ChatBody }>, reply) => {
    const startedAt = Date.now();
    const client = await authenticateApiKey(request.headers.authorization);
    if (!client) {
      return unauthorized(reply);
    }

    if (!(await enforceRateLimit(client.id, reply))) {
      return reply;
    }

    const provider = await getPrimaryProvider();
    const providerReady = Boolean(provider.apiKey) && provider.status === "active";
    if (!providerReady) {
      return reply.code(503).send({
        error: {
          message: "Provider API key is not configured",
          type: "provider_configuration_error"
        }
      });
    }

    const publicModel = request.body.model;
    if (!publicModel) {
      return reply.code(400).send({
        error: {
          message: "Field 'model' is required",
          type: "invalid_request_error"
        }
      });
    }

    const resolvedModel = await resolveProviderModel(publicModel);
    if (!resolvedModel) {
      return reply.code(404).send({
        error: {
          message: `Model '${publicModel}' is not available`,
          type: "model_not_found"
        }
      });
    }

    if (!(await spendCredit(client.id))) {
      return reply.code(402).send({
        error: {
          message: "Insufficient credits",
          type: "billing_error"
        }
      });
    }

    const upstreamBody = {
      ...request.body,
      model: resolvedModel.providerModel
    };

    try {
      const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${provider.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(upstreamBody)
      });

      reply.code(upstream.status);

      const contentType = upstream.headers.get("content-type");
      if (contentType) {
        reply.header("content-type", contentType);
      }

      if (request.body.stream && upstream.body) {
        await writeUsageLog({
          clientId: client.id,
          model: publicModel,
          providerId: provider.id,
          providerModel: resolvedModel.providerModel,
          statusCode: upstream.status,
          latencyMs: Date.now() - startedAt,
          success: upstream.ok,
          costCredits: 1
        });
        return reply.send(upstream.body);
      }

      const upstreamText = await upstream.text();
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let costCredits = 1;

      if (upstream.ok) {
        try {
          const upstreamJson = JSON.parse(upstreamText) as { usage?: unknown };
          const usage = normalizeUsageTokens(upstreamJson.usage);
          inputTokens = usage.inputTokens;
          outputTokens = usage.outputTokens;
          totalTokens = usage.totalTokens;
          costCredits = calculateCostCredits({
            inputTokens,
            outputTokens,
            inputTokenPricePerMillion: resolvedModel.inputTokenPricePerMillion,
            outputTokenPricePerMillion: resolvedModel.outputTokenPricePerMillion
          });
          if (costCredits > 1) {
            await debitCredits(client.id, costCredits - 1);
          }
        } catch {
          costCredits = 1;
        }
      }

      await writeUsageLog({
        clientId: client.id,
        model: publicModel,
        providerId: provider.id,
        providerModel: resolvedModel.providerModel,
        statusCode: upstream.status,
        latencyMs: Date.now() - startedAt,
        success: upstream.ok,
        inputTokens,
        outputTokens,
        totalTokens,
        costCredits: upstream.ok ? costCredits : 1
      });

      return reply.send(upstreamText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      await writeUsageLog({
        clientId: client.id,
        model: publicModel,
        providerId: provider.id,
        providerModel: resolvedModel.providerModel,
        statusCode: 502,
        latencyMs: Date.now() - startedAt,
        success: false,
        costCredits: 1,
        error: message
      });

      return reply.code(502).send({
        error: {
          message,
          type: "provider_error"
        }
      });
    }
  });
}
