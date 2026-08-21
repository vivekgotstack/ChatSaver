import Dexie, { type EntityTable } from "dexie";
import { createClientUuid } from "@/lib/client-uuid";

const DATABASE_NAME = "chatsaver-private-vault";
const METADATA_KEY = "vault";
const VERIFIER = "chatsaver-private-vault:v1";
const PBKDF2_ITERATIONS = 600_000;

export const PRIVATE_VAULT_DISMISSED_KEY = "chatsaver-private-vault-intro-dismissed";

export interface PrivateVaultItem {
  id: string;
  title: string;
  link: string;
  description: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PrivateVaultMetadata {
  key: typeof METADATA_KEY;
  salt: string;
  verifierIv: string;
  verifierCiphertext: string;
  createdAt: string;
}

interface EncryptedPrivateVaultItem {
  id: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
}

interface PrivateVaultBackup {
  format: "chatsaver-private-vault";
  schemaVersion: 1;
  exportedAt: string;
  metadata: PrivateVaultMetadata;
  items: EncryptedPrivateVaultItem[];
}

class PrivateVaultDatabase extends Dexie {
  metadata!: EntityTable<PrivateVaultMetadata, "key">;
  items!: EntityTable<EncryptedPrivateVaultItem, "id">;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({
      metadata: "&key",
      items: "&id, updatedAt, createdAt",
    });
  }
}

export const privateVaultDb = new PrivateVaultDatabase();

function bytes(length: number): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(value);
  return value;
}

function toBase64(value: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const result = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }
  return result;
}

async function keyFromPin(pin: string, salt: string): Promise<CryptoKey> {
  if (!/^\d{6}$/.test(pin)) throw new Error("Enter a six-digit PIN.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: CryptoKey, value: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = bytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function hasPrivateVault(): Promise<boolean> {
  return Boolean(await privateVaultDb.metadata.get(METADATA_KEY));
}

export async function createPrivateVault(pin: string): Promise<CryptoKey> {
  if (await hasPrivateVault()) throw new Error("This Private Vault is already configured.");
  const salt = toBase64(bytes(24));
  const key = await keyFromPin(pin, salt);
  const verifier = await encrypt(key, VERIFIER);
  await privateVaultDb.metadata.put({
    key: METADATA_KEY,
    salt,
    verifierIv: verifier.iv,
    verifierCiphertext: verifier.ciphertext,
    createdAt: new Date().toISOString(),
  });
  try { localStorage.removeItem(PRIVATE_VAULT_DISMISSED_KEY); } catch { /* ignored */ }
  return key;
}

export async function unlockPrivateVault(pin: string): Promise<CryptoKey> {
  const metadata = await privateVaultDb.metadata.get(METADATA_KEY);
  if (!metadata) throw new Error("Private Vault has not been configured.");
  try {
    const key = await keyFromPin(pin, metadata.salt);
    if (await decrypt(key, metadata.verifierIv, metadata.verifierCiphertext) !== VERIFIER) {
      throw new Error("Invalid PIN");
    }
    return key;
  } catch {
    throw new Error("That PIN is not correct.");
  }
}

function safeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid web link.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Only web links are supported.");
  return parsed.toString().slice(0, 2048);
}

function cleanItem(input: Omit<PrivateVaultItem, "id" | "createdAt" | "updatedAt">): Omit<PrivateVaultItem, "id" | "createdAt" | "updatedAt"> {
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!title) throw new Error("Add a title before saving.");
  return {
    title,
    link: safeLink(input.link),
    description: input.description.trim().slice(0, 4000),
    pinned: input.pinned,
  };
}

export async function listPrivateVaultItems(key: CryptoKey): Promise<PrivateVaultItem[]> {
  const stored = await privateVaultDb.items.toArray();
  const items = await Promise.all(stored.map(async (item) => ({
    ...(JSON.parse(await decrypt(key, item.iv, item.ciphertext)) as Omit<PrivateVaultItem, "id" | "createdAt" | "updatedAt">),
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })));
  return items.toSorted((left, right) =>
    Number(right.pinned) - Number(left.pinned)
      || right.updatedAt.localeCompare(left.updatedAt),
  );
}

export async function savePrivateVaultItem(
  key: CryptoKey,
  input: Omit<PrivateVaultItem, "id" | "createdAt" | "updatedAt">,
  current?: PrivateVaultItem,
): Promise<string> {
  const payload = cleanItem(input);
  const timestamp = new Date().toISOString();
  const encrypted = await encrypt(key, JSON.stringify(payload));
  const id = current?.id ?? createClientUuid();
  await privateVaultDb.items.put({
    id,
    ...encrypted,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  return id;
}

export async function deletePrivateVaultItem(id: string): Promise<void> {
  await privateVaultDb.items.delete(id);
}

export async function createPrivateVaultBackup(): Promise<string> {
  const metadata = await privateVaultDb.metadata.get(METADATA_KEY);
  if (!metadata) throw new Error("Private Vault has not been configured.");
  const backup: PrivateVaultBackup = {
    format: "chatsaver-private-vault",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    metadata,
    items: await privateVaultDb.items.toArray(),
  };
  return JSON.stringify(backup, null, 2);
}

function isPrivateVaultBackup(value: unknown): value is PrivateVaultBackup {
  if (typeof value !== "object" || value === null) return false;
  const backup = value as Partial<PrivateVaultBackup>;
  return backup.format === "chatsaver-private-vault"
    && backup.schemaVersion === 1
    && typeof backup.metadata === "object"
    && backup.metadata !== null
    && backup.metadata.key === METADATA_KEY
    && typeof backup.metadata.salt === "string"
    && typeof backup.metadata.verifierIv === "string"
    && typeof backup.metadata.verifierCiphertext === "string"
    && Array.isArray(backup.items)
    && backup.items.every((item) =>
      typeof item === "object" && item !== null
      && typeof item.id === "string"
      && typeof item.iv === "string"
      && typeof item.ciphertext === "string",
    );
}

export async function restorePrivateVaultBackup(value: unknown): Promise<number> {
  if (!isPrivateVaultBackup(value)) throw new Error("This is not a ChatSaver Private Vault backup.");
  const existing = await privateVaultDb.metadata.get(METADATA_KEY);
  if (existing && (
    existing.salt !== value.metadata.salt
    || existing.verifierCiphertext !== value.metadata.verifierCiphertext
  )) {
    throw new Error("This backup uses a different PIN vault. Reset this vault before restoring it.");
  }
  await privateVaultDb.transaction("rw", [privateVaultDb.metadata, privateVaultDb.items], async () => {
    await privateVaultDb.metadata.put(value.metadata);
    await privateVaultDb.items.bulkPut(value.items);
  });
  return value.items.length;
}

export async function resetPrivateVault(): Promise<void> {
  await privateVaultDb.delete();
  await privateVaultDb.open();
}
