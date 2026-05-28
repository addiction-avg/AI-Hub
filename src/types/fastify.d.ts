import type { AuthenticatedClient } from "../services/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    client?: AuthenticatedClient;
  }
}
