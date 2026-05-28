import { findClientByRawKey, listApiKeys } from "./state.js";

export type AuthenticatedClient = {
  id: string;
  apiKeyHash: string;
  name: string;
};

export async function listClients() {
  const keys = await listApiKeys();
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    apiKeyPreview: key.keyPreview,
    status: key.status,
    balance: key.balance,
    createdAt: key.createdAt
  }));
}

export async function authenticateApiKey(authorization?: string): Promise<AuthenticatedClient | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return null;
  }

  const matched = await findClientByRawKey(token);
  if (!matched) {
    return null;
  }

  return {
    id: matched.id,
    apiKeyHash: matched.keyHash,
    name: matched.name
  };
}
