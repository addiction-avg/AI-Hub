ALTER TABLE "Model"
ADD COLUMN "inputTokenPricePerMillion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "outputTokenPricePerMillion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UsageLog"
ADD COLUMN "providerId" TEXT,
ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "costCredits" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "changeSummary" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TopUpOrder" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "amountCredits" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "externalRef" TEXT,
  "note" TEXT,
  "createdByAdminId" TEXT NOT NULL,
  "paidByAdminId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TopUpOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BalanceLedger" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "adminId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BalanceLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageLog_providerId_idx" ON "UsageLog"("providerId");
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX "AuditLog_objectType_objectId_idx" ON "AuditLog"("objectType", "objectId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "TopUpOrder_apiKeyId_idx" ON "TopUpOrder"("apiKeyId");
CREATE INDEX "TopUpOrder_status_idx" ON "TopUpOrder"("status");
CREATE INDEX "TopUpOrder_createdAt_idx" ON "TopUpOrder"("createdAt");
CREATE INDEX "BalanceLedger_apiKeyId_idx" ON "BalanceLedger"("apiKeyId");
CREATE INDEX "BalanceLedger_sourceType_sourceId_idx" ON "BalanceLedger"("sourceType", "sourceId");
CREATE INDEX "BalanceLedger_createdAt_idx" ON "BalanceLedger"("createdAt");
