import { prisma } from "./prisma.js";

export type UsageLogInput = {
  clientId: string;
  model: string;
  providerId?: string;
  providerModel?: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costCredits?: number;
  error?: string;
};

export async function writeUsageLog(input: UsageLogInput) {
  await prisma.usageLog.create({
    data: {
      clientId: input.clientId,
      model: input.model,
      providerId: input.providerId,
      providerModel: input.providerModel,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      success: input.success,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      costCredits: input.costCredits ?? 0,
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
