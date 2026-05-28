import { readFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { encryptSecret } from "../src/services/security.js";
import { prisma } from "../src/services/prisma.js";
import { ensureDefaults } from "../src/services/state.js";

type LegacyState = {
  apiKeys?: Array<{
    id: string;
    name: string;
    keyHash: string;
    keyPreview: string;
    status: "active" | "disabled";
    balance: number;
    createdAt?: string;
  }>;
  models?: Array<{
    id?: string;
    publicName: string;
    providerModel: string;
    status: "active" | "disabled";
    createdAt?: string;
  }>;
  providers?: Array<{
    id: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    status: "active" | "disabled";
    createdAt?: string;
    updatedAt?: string;
  }>;
};

function dateOrNow(value?: string) {
  return value ? new Date(value) : new Date();
}

async function main() {
  await ensureDefaults();

  const statePath = path.resolve("data", "state.json");
  const content = await readFile(statePath, "utf8");
  const state = JSON.parse(content) as LegacyState;

  for (const key of state.apiKeys ?? []) {
    await prisma.apiKey.upsert({
      where: { keyHash: key.keyHash },
      update: {
        name: key.name,
        keyPreview: key.keyPreview,
        status: key.status,
        balance: key.balance
      },
      create: {
        id: key.id,
        name: key.name,
        keyHash: key.keyHash,
        keyPreview: key.keyPreview,
        status: key.status,
        balance: key.balance,
        createdAt: dateOrNow(key.createdAt)
      }
    });
  }

  for (const model of state.models ?? []) {
    await prisma.model.upsert({
      where: { publicName: model.publicName },
      update: {
        providerModel: model.providerModel,
        status: model.status
      },
      create: {
        id: model.id ?? `model_${nanoid(10)}`,
        publicName: model.publicName,
        providerModel: model.providerModel,
        status: model.status,
        createdAt: dateOrNow(model.createdAt)
      }
    });
  }

  for (const provider of state.providers ?? []) {
    await prisma.provider.upsert({
      where: { id: provider.id },
      update: {
        name: provider.name,
        baseUrl: provider.baseUrl,
        encryptedApiKey: encryptSecret(provider.apiKey ?? ""),
        status: provider.status
      },
      create: {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        encryptedApiKey: encryptSecret(provider.apiKey ?? ""),
        status: provider.status,
        createdAt: dateOrNow(provider.createdAt),
        updatedAt: dateOrNow(provider.updatedAt)
      }
    });
  }

  console.log("Imported data/state.json into PostgreSQL.");
}

await main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
