export type Summary = {
  balance: number;
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  availableModels: number;
  providerConfigured: boolean;
  recentFailures: number;
  recentFailureRate: number;
  todayRequests: number;
  todayCostCredits: number;
  pendingTopUps: number;
};

export type ModelRow = {
  id: string;
  publicName: string;
  providerModel: string;
  status: "active" | "disabled";
  inputTokenPricePerMillion: number;
  outputTokenPricePerMillion: number;
  createdAt: string;
};

export type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  configured: boolean;
  status: "active" | "disabled" | "missing_key";
};

export type ApiKeyRow = {
  id: string;
  name: string;
  apiKeyPreview: string;
  status: "active" | "disabled";
  balance: number;
  createdAt: string;
};

export type UsageLogRow = {
  id: string;
  createdAt: string;
  clientId: string;
  model: string;
  providerModel?: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  providerId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCredits: number;
  error?: string;
};

export type AdminMe = {
  adminId: string;
  name: string;
  role: "owner" | "admin" | "viewer";
};

export type TopUpOrderRow = {
  id: string;
  apiKeyId: string;
  amountCredits: number;
  status: "pending" | "paid" | "canceled";
  externalRef?: string | null;
  note?: string | null;
  createdByAdminId: string;
  paidByAdminId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogRow = {
  id: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  action: string;
  objectType: string;
  objectId: string;
  changeSummary?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

export type AdminHealth = {
  ok: boolean;
  checks: {
    postgres: "ok" | "error";
    redis: "ok" | "error";
    providerConfigured: boolean;
  };
  metrics: {
    recentRequests: number;
    recentFailures: number;
    recentFailureRate: number;
    avgLatencyMs: number;
  };
};

export type AdminData = {
  summary: Summary;
  models: ModelRow[];
  providers: ProviderRow[];
  apiKeys: ApiKeyRow[];
  logs: UsageLogRow[];
  topUps: TopUpOrderRow[];
  auditLogs: AuditLogRow[];
  health: AdminHealth;
  admin: AdminMe;
};

const defaultBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

async function getJson<T>(path: string, apiKey: string, baseUrl = defaultBaseUrl): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function sendJson<T>(
  path: string,
  apiKey: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  baseUrl = defaultBaseUrl
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loadAdminData(apiKey: string, baseUrl = defaultBaseUrl): Promise<AdminData> {
  const [summary, models, providers, apiKeys, logs, topUps, auditLogs, health, admin] = await Promise.all([
    getJson<Summary>("/admin/summary", apiKey, baseUrl),
    getJson<{ data: ModelRow[] }>("/admin/models", apiKey, baseUrl),
    getJson<{ data: ProviderRow[] }>("/admin/providers", apiKey, baseUrl),
    getJson<{ data: ApiKeyRow[] }>("/admin/api-keys", apiKey, baseUrl),
    getJson<{ data: UsageLogRow[] }>("/admin/usage-logs", apiKey, baseUrl),
    getJson<{ data: TopUpOrderRow[] }>("/admin/top-up-orders", apiKey, baseUrl),
    getJson<{ data: AuditLogRow[] }>("/admin/audit-logs", apiKey, baseUrl),
    getJson<AdminHealth>("/admin/health", apiKey, baseUrl),
    getJson<AdminMe>("/admin/me", apiKey, baseUrl)
  ]);

  return {
    summary,
    models: models.data,
    providers: providers.data,
    apiKeys: apiKeys.data,
    logs: logs.data,
    topUps: topUps.data,
    auditLogs: auditLogs.data,
    health,
    admin
  };
}

export function createApiKey(apiKey: string, input: { name: string; balance: number }) {
  return sendJson<{ apiKey: string; record: ApiKeyRow }>("/admin/api-keys", apiKey, "POST", input);
}

export function updateApiKey(apiKey: string, id: string, input: Partial<Pick<ApiKeyRow, "name" | "status" | "balance">>) {
  return sendJson<ApiKeyRow>(`/admin/api-keys/${encodeURIComponent(id)}`, apiKey, "PATCH", input);
}

export function saveModel(
  apiKey: string,
  input: Pick<
    ModelRow,
    "publicName" | "providerModel" | "status" | "inputTokenPricePerMillion" | "outputTokenPricePerMillion"
  >
) {
  return sendJson<ModelRow>("/admin/models", apiKey, "POST", input);
}

export function deleteModel(apiKey: string, publicName: string) {
  return sendJson<{ ok: true }>(`/admin/models/${encodeURIComponent(publicName)}`, apiKey, "DELETE");
}

export function updateProvider(
  apiKey: string,
  id: string,
  input: Partial<Pick<ProviderRow, "name" | "baseUrl">> & { apiKey?: string; status?: "active" | "disabled" }
) {
  return sendJson<ProviderRow>(`/admin/providers/${encodeURIComponent(id)}`, apiKey, "PATCH", input);
}

export function createTopUpOrder(
  apiKey: string,
  input: { apiKeyId: string; amountCredits: number; externalRef?: string; note?: string }
) {
  return sendJson<TopUpOrderRow>("/admin/top-up-orders", apiKey, "POST", input);
}

export function updateTopUpOrder(
  apiKey: string,
  id: string,
  input: { status: "pending" | "paid" | "canceled"; note?: string }
) {
  return sendJson<TopUpOrderRow>(`/admin/top-up-orders/${encodeURIComponent(id)}`, apiKey, "PATCH", input);
}
