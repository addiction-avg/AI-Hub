import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerRoutes } from "./routes.js";
import { disconnectPrisma } from "./services/prisma.js";
import { disconnectRedis, ensureRedisReady } from "./services/redis.js";
import { ensureDatabaseReady } from "./services/state.js";

const app = Fastify({
  logger: {
    level: "info"
  }
});

await app.register(cors, {
  origin: true
});

await registerRoutes(app);

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
