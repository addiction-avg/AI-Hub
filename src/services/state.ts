import { env } from "../config/env.js";
import { createRelayApiKey, decryptSecret, encryptSecret, previewSecret, safeEquals, sha256 } from "./security.js";
import { prisma } from "./prisma.js";

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyHash: string;
  keyPreview: string;
  status: "active" | "disabled";
  balance: number;
  createdAt: Date;
};

export type ModelRecord = {
  id: string;
  publicName: string;
  providerModel: string;
  status: "active" | "disabled";
  inputTokenPricePerMillion: number;
  outputTokenPricePerMillion: number;
  createdAt: Date;
};

export type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
};

function providerKeyFromEnv() {
  return env.providerApiKeyConfigured ? env.OPENAI_COMPAT_API_KEY : "";
}

function defaultModels() {
  return Object.entries(env.modelAliases).map(([publicName, providerModel]) => ({
    id: `model_${sha256(publicName).slice(0, 10)}`,
    publicName,
    providerModel,
    status: "active",
    inputTokenPricePerMillion: 0,
    outputTokenPricePerMillion: 0
  }));
}

function apiKeyFromRaw(raw: string, index: number) {
  const keyHash = sha256(raw);

  return {
    id: `client_${keyHash.slice(0, 12)}`,
    name: index === 0 ? "Local Dev Key" : `Env Key ${index + 1}`,
    keyHash,
    keyPreview: previewSecret(raw),
    status: "active",
    balance: env.INITIAL_CREDITS
  };
}

export async function ensureDatabaseReady() {
  await prisma.$connect();
  await ensureDefaults();
}

export async function ensureDefaults() {
  for (const [index, raw] of env.relayApiKeys.entries()) {
    const apiKey = apiKeyFromRaw(raw, index);
    await prisma.apiKey.upsert({
      where: { keyHash: apiKey.keyHash },
      update: {},
      create: apiKey
    });
  }

  for (const model of defaultModels()) {
    await prisma.model.upsert({
      where: { publicName: model.publicName },
      update: {},
      create: model
    });
  }

  const providerCount = await prisma.provider.count();
  if (providerCount === 0) {
    const apiKey = providerKeyFromEnv();
    await prisma.provider.create({
      data: {
        id: "openai-compatible",
        name: "OpenAI Compatible",
        baseUrl: env.OPENAI_COMPAT_BASE_URL,
        encryptedApiKey: encryptSecret(apiKey),
        status: "active"
      }
    });
  }
}

export async function findClientByRawKey(rawKey: string) {
  const tokenHash = sha256(rawKey);
  const keys = await prisma.apiKey.findMany({
    where: { status: "active" }
  });

  return keys.find((key) => safeEquals(key.keyHash, tokenHash)) ?? null;
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPreview: true,
      status: true,
      balance: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function getApiKeyById(id: string) {
  return prisma.apiKey.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      keyPreview: true,
      status: true,
      balance: true,
      createdAt: true
    }
  });
}

export async function createApiKey(input: { name: string; balance: number }) {
  const rawKey = createRelayApiKey();
  const keyHash = sha256(rawKey);
  const record = await prisma.apiKey.create({
    data: {
      id: `client_${keyHash.slice(0, 12)}`,
      name: input.name.trim() || "Untitled Key",
      keyHash,
      keyPreview: previewSecret(rawKey),
      status: "active",
      balance: Math.max(0, Math.trunc(input.balance))
    },
    select: {
      id: true,
      name: true,
      keyPreview: true,
      status: true,
      balance: true,
      createdAt: true
    }
  });

  return {
    apiKey: rawKey,
    record
  };
}

export async function updateApiKey(id: string, input: { name?: string; status?: "active" | "disabled"; balance?: number }) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  return prisma.apiKey.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() || existing.name } : {}),
      ...(input.status === "active" || input.status === "disabled" ? { status: input.status } : {}),
      ...(input.balance !== undefined && Number.isFinite(input.balance)
        ? { balance: Math.max(0, Math.trunc(input.balance)) }
        : {})
    },
    select: {
      id: true,
      name: true,
      keyPreview: true,
      status: true,
      balance: true,
      createdAt: true
    }
  });
}

export async function recordBalanceAdjustment(input: {
  apiKeyId: string;
  amount: number;
  reason: string;
  sourceType: string;
  sourceId?: string;
  adminId?: string;
  note?: string;
}) {
  return prisma.balanceLedger.create({
    data: {
      apiKeyId: input.apiKeyId,
      amount: input.amount,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      adminId: input.adminId,
      note: input.note
    }
  });
}

export async function getBalance(clientId: string) {
  const record = await prisma.apiKey.findUnique({
    where: { id: clientId },
    select: { balance: true }
  });

  return record?.balance ?? 0;
}

export async function getTotalBalance() {
  const result = await prisma.apiKey.aggregate({
    _sum: { balance: true }
  });

  return result._sum.balance ?? 0;
}

export async function spendCredit(clientId: string, amount = 1) {
  const updated = await prisma.apiKey.updateMany({
    where: {
      id: clientId,
      status: "active",
      balance: { gte: amount }
    },
    data: {
      balance: { decrement: amount }
    }
  });

  return updated.count === 1;
}

export async function debitCredits(clientId: string, amount: number) {
  if (amount <= 0) {
    return true;
  }

  await prisma.apiKey.update({
    where: { id: clientId },
    data: {
      balance: { decrement: Math.trunc(amount) }
    }
  });

  return true;
}

export async function listModels() {
  return prisma.model.findMany({
    orderBy: { publicName: "asc" }
  });
}

export async function listPublicModels() {
  const models = await prisma.model.findMany({
    where: { status: "active" },
    select: { publicName: true },
    orderBy: { publicName: "asc" }
  });

  return models.map((model) => model.publicName);
}

export async function resolveProviderModel(publicModel: string) {
  const model = await prisma.model.findFirst({
    where: {
      publicName: publicModel,
      status: "active"
    },
    select: {
      providerModel: true,
      inputTokenPricePerMillion: true,
      outputTokenPricePerMillion: true
    }
  });

  return model ?? null;
}

export async function upsertModel(input: {
  publicName: string;
  providerModel: string;
  status: "active" | "disabled";
  inputTokenPricePerMillion?: number;
  outputTokenPricePerMillion?: number;
}) {
  const publicName = input.publicName.trim();
  const providerModel = input.providerModel.trim();
  if (!publicName || !providerModel) {
    return null;
  }

  return prisma.model.upsert({
    where: { publicName },
    update: {
      providerModel,
      status: input.status,
      inputTokenPricePerMillion: normalizePrice(input.inputTokenPricePerMillion),
      outputTokenPricePerMillion: normalizePrice(input.outputTokenPricePerMillion)
    },
    create: {
      id: `model_${sha256(publicName).slice(0, 10)}`,
      publicName,
      providerModel,
      status: input.status,
      inputTokenPricePerMillion: normalizePrice(input.inputTokenPricePerMillion),
      outputTokenPricePerMillion: normalizePrice(input.outputTokenPricePerMillion)
    }
  });
}

function normalizePrice(value?: number) {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function deleteModel(publicName: string) {
  const deleted = await prisma.model.deleteMany({
    where: { publicName }
  });

  return deleted.count > 0;
}

export async function listProviders() {
  const providers = await prisma.provider.findMany({
    orderBy: { createdAt: "asc" }
  });

  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    configured: Boolean(provider.encryptedApiKey),
    status: provider.status === "disabled" ? "disabled" : provider.encryptedApiKey ? "active" : "missing_key"
  }));
}

export async function getPrimaryProvider(): Promise<ProviderRecord> {
  const provider = await prisma.provider.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (!provider) {
    await ensureDefaults();
    return getPrimaryProvider();
  }

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: decryptSecret(provider.encryptedApiKey),
    status: provider.status === "disabled" ? "disabled" : "active",
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

export async function updateProvider(id: string, input: {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  status?: "active" | "disabled";
}) {
  const existing = await prisma.provider.findUnique({ where: { id } });
  const encryptedApiKey = input.apiKey !== undefined ? encryptSecret(input.apiKey.trim()) : undefined;
  const nextStatus = input.status ?? (input.apiKey ? "active" : existing?.status ?? "active");

  const provider = await prisma.provider.upsert({
    where: { id },
    update: {
      ...(input.name !== undefined ? { name: input.name.trim() || existing?.name || "OpenAI Compatible" } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim() || existing?.baseUrl || env.OPENAI_COMPAT_BASE_URL } : {}),
      ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
      status: nextStatus
    },
    create: {
      id,
      name: input.name?.trim() || "OpenAI Compatible",
      baseUrl: input.baseUrl?.trim() || env.OPENAI_COMPAT_BASE_URL,
      encryptedApiKey: encryptedApiKey ?? null,
      status: nextStatus
    }
  });

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    configured: Boolean(provider.encryptedApiKey),
    status: provider.status === "disabled" ? "disabled" : provider.encryptedApiKey ? "active" : "missing_key"
  };
}
