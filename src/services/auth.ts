import { env } from "../config/env.js";
import { previewSecret, safeEquals, sha256 } from "./security.js";
import { findClientByRawKey, listApiKeys } from "./state.js";

export type AdminRole = "owner" | "admin" | "viewer";

export type AuthenticatedClient = {
  id: string;
  apiKeyHash: string;
  name: string;
};

export type AuthenticatedAdmin = {
  id: string;
  apiKeyHash: string;
  name: string;
  role: AdminRole;
};

const adminRoles: AdminRole[] = ["owner", "admin", "viewer"];

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

function bearerToken(authorization?: string) {
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function parseAdminKey(rawKey: string, index: number) {
  const [maybeRole, ...rest] = rawKey.split(":");
  const hasRolePrefix = rest.length > 0 && adminRoles.includes(maybeRole as AdminRole);
  const role = hasRolePrefix ? maybeRole as AdminRole : "owner";
  const key = hasRolePrefix ? rest.join(":").trim() : rawKey.trim();

  return {
    key,
    role,
    name: index === 0 ? role === "owner" ? "Owner" : `${role} 1` : `${role} ${index + 1}`
  };
}

export async function authenticateApiKey(authorization?: string): Promise<AuthenticatedClient | null> {
  const token = bearerToken(authorization);
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

export async function authenticateAdminKey(authorization?: string): Promise<AuthenticatedAdmin | null> {
  const token = bearerToken(authorization);
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const entries = env.adminApiKeys.map(parseAdminKey).filter((entry) => entry.key);
  const matched = entries.find((entry) => safeEquals(sha256(entry.key), tokenHash));
  if (!matched) {
    return null;
  }

  return {
    id: `admin_${tokenHash.slice(0, 12)}`,
    apiKeyHash: tokenHash,
    name: `${matched.name} (${previewSecret(token)})`,
    role: matched.role
  };
}

export function canWrite(role: AdminRole) {
  return role === "owner" || role === "admin";
}

export function canOwn(role: AdminRole) {
  return role === "owner";
}
