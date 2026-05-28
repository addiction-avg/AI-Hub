import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./services/prisma.js";
import { disconnectRedis, ensureRedisReady } from "./services/redis.js";
import { ensureDatabaseReady } from "./services/state.js";

const app = await buildApp();

try {
  await ensureDatabaseReady();
  await ensureRedisReady();
  await app.listen({
    host: env.HOST,
    port: env.PORT
  });
} catch (error) {
  app.log.error(error);
  await disconnectPrisma().catch(() => undefined);
  disconnectRedis();
  process.exit(1);
}
