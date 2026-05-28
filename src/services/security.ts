import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function previewSecret(value: string) {
  if (value.length <= 12) {
    return `${value.slice(0, 3)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function createRelayApiKey() {
  return `sk-relay-${randomBytes(24).toString("base64url")}`;
}

function encryptionKey() {
  return createHash("sha256").update(env.APP_SECRET).digest();
}

export function encryptSecret(value: string) {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function decryptSecret(value?: string | null) {
  if (!value) {
    return "";
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
