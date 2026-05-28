import { prisma } from "./prisma.js";

export type UsageLogInput = {
  clientId: string;
  model: string;
  providerModel?: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export async function writeUsageLog(input: UsageLogInput) {
  await prisma.usageLog.create({
    data: {
      clientId: input.clientId,
      model: input.model,
      providerModel: input.providerModel,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      success: input.success,
      error: input.error
    }
  });
}

export async function readUsageLogs(limit = 50) {
  return prisma.usageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });
}
