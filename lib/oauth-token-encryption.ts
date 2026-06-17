import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_PREFIX = "enc:v1:";
const AAD = Buffer.from("dayza.oauth-token.v1", "utf8");

type TokenFields = {
  access_token?: string | null;
  refresh_token?: string | null;
  id_token?: string | null;
};

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function fromBase64url(value: string) {
  return Buffer.from(value, "base64url");
}

function tokenEncryptionSecret() {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY or APP_SECRET must be at least 32 characters to encrypt OAuth tokens");
  }
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(tokenEncryptionSecret(), "utf8").digest();
}

export function isEncryptedOAuthToken(value?: string | null) {
  return Boolean(value?.startsWith(TOKEN_PREFIX));
}

export function encryptOAuthToken(value?: string | null) {
  if (value == null || value === "") return value ?? null;
  if (isEncryptedOAuthToken(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_PREFIX}${base64url(iv)}:${base64url(tag)}:${base64url(ciphertext)}`;
}

export function decryptOAuthToken(value?: string | null) {
  if (value == null || value === "") return value ?? null;
  if (!isEncryptedOAuthToken(value)) return value;

  const parts = value.slice(TOKEN_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted OAuth token format");
  const [ivRaw, tagRaw, ciphertextRaw] = parts;
  const iv = fromBase64url(ivRaw);
  const tag = fromBase64url(tagRaw);
  const ciphertext = fromBase64url(ciphertextRaw);
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted OAuth token payload");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptOAuthTokenFields<T extends TokenFields>(data: T): T {
  const encrypted = { ...data };
  if ("access_token" in encrypted && encrypted.access_token !== undefined) {
    encrypted.access_token = encryptOAuthToken(encrypted.access_token) as T["access_token"];
  }
  if ("refresh_token" in encrypted && encrypted.refresh_token !== undefined) {
    encrypted.refresh_token = encryptOAuthToken(encrypted.refresh_token) as T["refresh_token"];
  }
  if ("id_token" in encrypted && encrypted.id_token !== undefined) {
    encrypted.id_token = encryptOAuthToken(encrypted.id_token) as T["id_token"];
  }
  return encrypted;
}

export function decryptOAuthTokenFields<T extends TokenFields | null>(account: T): T {
  if (!account) return account;
  const current = account as TokenFields;
  return {
    ...account,
    access_token: decryptOAuthToken(current.access_token),
    refresh_token: decryptOAuthToken(current.refresh_token),
    id_token: decryptOAuthToken(current.id_token),
  } as T;
}
