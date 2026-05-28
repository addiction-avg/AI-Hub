import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_SECRET: z.string().min(16),
  ADMIN_API_KEYS: z.string().default("admin-local-dev"),
  RELAY_API_KEYS: z.string().default("sk-local-dev"),
  OPENAI_COMPAT_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_COMPAT_API_KEY: z.string().default(""),
  MODEL_ALIASES: z.string().default("gpt-4o-mini:gpt-4o-mini"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  INITIAL_CREDITS: z.coerce.number().int().nonnegative().default(1000)
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  providerApiKeyConfigured: Boolean(parsed.OPENAI_COMPAT_API_KEY)
    && parsed.OPENAI_COMPAT_API_KEY !== "replace-with-provider-key",
  adminApiKeys: parsed.ADMIN_API_KEYS.split(",").map((key) => key.trim()).filter(Boolean),
  relayApiKeys: parsed.RELAY_API_KEYS.split(",").map((key) => key.trim()).filter(Boolean),
  modelAliases: Object.fromEntries(
    parsed.MODEL_ALIASES.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((pair) => {
        const [publicName, providerName] = pair.split(":").map((part) => part.trim());
        return [publicName, providerName ?? publicName];
      })
  )
};
