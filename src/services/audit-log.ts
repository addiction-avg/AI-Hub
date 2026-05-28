import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedAdmin } from "./auth.js";
import { prisma } from "./prisma.js";

export type AuditAction =
  | "api_key.create"
  | "api_key.update"
  | "model.upsert"
  | "model.delete"
  | "provider.update"
  | "top_up_order.create"
  | "top_up_order.update";

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 12 || value.startsWith("sk-")) {
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /apiKey|key|secret|token|password/i.test(key) ? "[redacted]" : redactValue(entry)
      ])
    );
  }

  return value;
}

export async function writeAuditLog(input: {
  admin: AuthenticatedAdmin;
  request: FastifyRequest;
  action: AuditAction;
  objectType: string;
  objectId: string;
  changeSummary?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      adminId: input.admin.id,
      adminName: input.admin.name,
      adminRole: input.admin.role,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId,
      changeSummary: input.changeSummary ?? undefined,
      ip: input.request.ip,
      userAgent: input.request.headers["user-agent"]
    }
  });
}

export async function readAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });
}
