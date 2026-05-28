import type { AuthenticatedAdmin, AuthenticatedClient } from "../services/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    admin?: AuthenticatedAdmin;
    client?: AuthenticatedClient;
  }
}
