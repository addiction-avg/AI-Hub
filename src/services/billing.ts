import { prisma } from "./prisma.js";

export type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function normalizeUsageTokens(usage: unknown): UsageTokens {
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const record = usage as Record<string, unknown>;
  const inputTokens = numberValue(record.prompt_tokens ?? record.input_tokens);
  const outputTokens = numberValue(record.completion_tokens ?? record.output_tokens);
  const totalTokens = numberValue(record.total_tokens) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

export function calculateCostCredits(input: {
  inputTokens: number;
  outputTokens: number;
  inputTokenPricePerMillion: number;
  outputTokenPricePerMillion: number;
}) {
  const rawCost =
    (input.inputTokens * input.inputTokenPricePerMillion + input.outputTokens * input.outputTokenPricePerMillion)
    / 1_000_000;

  return Math.max(1, Math.ceil(rawCost));
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export async function createTopUpOrder(input: {
  apiKeyId: string;
  amountCredits: number;
  externalRef?: string;
  note?: string;
  adminId: string;
}) {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: input.apiKeyId },
    select: { id: true }
  });
  if (!apiKey) {
    return null;
  }

  return prisma.topUpOrder.create({
    data: {
      apiKeyId: apiKey.id,
      amountCredits: Math.max(1, Math.trunc(input.amountCredits)),
      externalRef: input.externalRef?.trim() || null,
      note: input.note?.trim() || null,
      createdByAdminId: input.adminId
    }
  });
}

export async function listTopUpOrders(limit = 100) {
  return prisma.topUpOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

export async function updateTopUpOrder(input: {
  id: string;
  status: "pending" | "paid" | "canceled";
  adminId: string;
  note?: string;
}) {
  const order = await prisma.topUpOrder.findUnique({ where: { id: input.id } });
  if (!order) {
    return null;
  }

  if (order.status === "paid" && input.status !== "paid") {
    return { error: "paid_order_locked" as const, order };
  }

  if (input.status === "paid" && order.status !== "paid") {
    const paidOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.topUpOrder.update({
        where: { id: input.id },
        data: {
          status: "paid",
          paidByAdminId: input.adminId,
          paidAt: new Date(),
          ...(input.note !== undefined ? { note: input.note.trim() || order.note } : {})
        }
      });

      await tx.apiKey.update({
        where: { id: order.apiKeyId },
        data: {
          balance: { increment: order.amountCredits }
        }
      });

      await tx.balanceLedger.create({
        data: {
          apiKeyId: order.apiKeyId,
          amount: order.amountCredits,
          reason: "top_up",
          sourceType: "top_up_order",
          sourceId: order.id,
          adminId: input.adminId,
          note: input.note?.trim() || order.note
        }
      });

      return updated;
    });

    return { order: paidOrder };
  }

  const updated = await prisma.topUpOrder.update({
    where: { id: input.id },
    data: {
      status: input.status,
      ...(input.note !== undefined ? { note: input.note.trim() || order.note } : {})
    }
  });

  return { order: updated };
}

export async function getBillingSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingTopUps, todayUsage] = await Promise.all([
    prisma.topUpOrder.count({ where: { status: "pending" } }),
    prisma.usageLog.aggregate({
      where: { createdAt: { gte: today } },
      _count: { id: true },
      _sum: { costCredits: true }
    })
  ]);

  return {
    pendingTopUps,
    todayRequests: todayUsage._count.id,
    todayCostCredits: todayUsage._sum.costCredits ?? 0
  };
}
