CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPreview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "balance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Model" (
  "id" TEXT NOT NULL,
  "publicName" TEXT NOT NULL,
  "providerModel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Provider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "encryptedApiKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageLog" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "providerModel" TEXT,
  "statusCode" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");
CREATE UNIQUE INDEX "Model_publicName_key" ON "Model"("publicName");
CREATE INDEX "Model_status_idx" ON "Model"("status");
CREATE INDEX "UsageLog_clientId_idx" ON "UsageLog"("clientId");
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
CREATE INDEX "UsageLog_success_idx" ON "UsageLog"("success");
