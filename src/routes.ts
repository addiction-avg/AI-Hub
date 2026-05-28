import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticateApiKey, listClients } from "./services/auth.js";
import { getBalance, spendCredit } from "./services/credits.js";
import { listPublicModels, resolveProviderModel } from "./services/model-router.js";
import { consumeRateLimit } from "./services/redis.js";
import {
  createApiKey,
  deleteModel,
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

    const client = await authenticateApiKey(request.headers.authorization);
    if (!client) {
      await unauthorized(reply);
      return reply;
    }

    if (!(await enforceRateLimit(client.id, reply))) {
      return reply;
    }

    request.client = client;
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

  app.get("/admin/summary", async (request) => {
    const logs = await readUsageLogs(200);
    const client = request.client;
    const providers = await listProviders();
    const recentFailures = logs.filter((log) => !log.success).length;
    const avgLatencyMs = logs.length
      ? Math.round(logs.reduce((sum, log) => sum + log.latencyMs, 0) / logs.length)
      : 0;

    return {
      balance: client ? await getBalance(client.id) : 0,
      totalRequests: logs.length,
      successRate: logs.length ? Number((((logs.length - recentFailures) / logs.length) * 100).toFixed(1)) : 100,
      avgLatencyMs,
      availableModels: (await listPublicModels()).length,
      providerConfigured: providers.some((provider) => provider.configured && provider.status === "active"),
      recentFailures
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

  app.post("/admin/api-keys", async (request: FastifyRequest<{ Body: { name?: string; balance?: number } }>) => {
    return createApiKey({
      name: request.body.name ?? "New API Key",
      balance: Number(request.body.balance ?? 1000)
    });
  });

  app.patch("/admin/api-keys/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; status?: "active" | "disabled"; balance?: number };
    }>,
    reply
  ) => {
    const updated = await updateApiKey(request.params.id, request.body);
    if (!updated) {
      return reply.code(404).send({ error: { message: "API key not found" } });
    }

    return updated;
  });

  app.post("/admin/models", async (
    request: FastifyRequest<{
      Body: { publicName?: string; providerModel?: string; status?: "active" | "disabled" };
    }>,
    reply
  ) => {
    const updated = await upsertModel({
      publicName: request.body.publicName ?? "",
      providerModel: request.body.providerModel ?? "",
      status: request.body.status === "disabled" ? "disabled" : "active"
    });

    if (!updated) {
      return reply.code(400).send({ error: { message: "publicName and providerModel are required" } });
    }

    return updated;
  });

  app.delete("/admin/models/:publicName", async (request: FastifyRequest<{ Params: { publicName: string } }>, reply) => {
    const deleted = await deleteModel(request.params.publicName);
    if (!deleted) {
      return reply.code(404).send({ error: { message: "Model not found" } });
    }

    return { ok: true };
  });

  app.patch("/admin/providers/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; baseUrl?: string; apiKey?: string; status?: "active" | "disabled" };
    }>
  ) => {
    return updateProvider(request.params.id, request.body);
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

    const providerModel = resolveProviderModel(publicModel);
    const resolvedProviderModel = await providerModel;
    if (!resolvedProviderModel) {
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
      model: resolvedProviderModel
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

      await writeUsageLog({
        clientId: client.id,
        model: publicModel,
        providerModel: resolvedProviderModel,
        statusCode: upstream.status,
        latencyMs: Date.now() - startedAt,
        success: upstream.ok
      });

      reply.code(upstream.status);

      const contentType = upstream.headers.get("content-type");
      if (contentType) {
        reply.header("content-type", contentType);
      }

      if (request.body.stream && upstream.body) {
        return reply.send(upstream.body);
      }

      return reply.send(await upstream.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      await writeUsageLog({
        clientId: client.id,
        model: publicModel,
        providerModel: resolvedProviderModel,
        statusCode: 502,
        latencyMs: Date.now() - startedAt,
        success: false,
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
