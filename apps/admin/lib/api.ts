export type Summary = {
  balance: number;
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  availableModels: number;
  providerConfigured: boolean;
  recentFailures: number;
};

export type ModelRow = {
  id: string;
  publicName: string;
  providerModel: string;
  status: "active" | "disabled";
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
  error?: string;
};

export type AdminData = {
  summary: Summary;
  models: ModelRow[];
  providers: ProviderRow[];
  apiKeys: ApiKeyRow[];
  logs: UsageLogRow[];
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
  const [summary, models, providers, apiKeys, logs] = await Promise.all([
    getJson<Summary>("/admin/summary", apiKey, baseUrl),
    getJson<{ data: ModelRow[] }>("/admin/models", apiKey, baseUrl),
    getJson<{ data: ProviderRow[] }>("/admin/providers", apiKey, baseUrl),
    getJson<{ data: ApiKeyRow[] }>("/admin/api-keys", apiKey, baseUrl),
    getJson<{ data: UsageLogRow[] }>("/admin/usage-logs", apiKey, baseUrl)
  ]);

  return {
    summary,
    models: models.data,
    providers: providers.data,
    apiKeys: apiKeys.data,
    logs: logs.data
  };
}

export function createApiKey(apiKey: string, input: { name: string; balance: number }) {
  return sendJson<{ apiKey: string; record: ApiKeyRow }>("/admin/api-keys", apiKey, "POST", input);
}

export function updateApiKey(apiKey: string, id: string, input: Partial<Pick<ApiKeyRow, "name" | "status" | "balance">>) {
  return sendJson<ApiKeyRow>(`/admin/api-keys/${encodeURIComponent(id)}`, apiKey, "PATCH", input);
}

export function saveModel(apiKey: string, input: Pick<ModelRow, "publicName" | "providerModel" | "status">) {
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
