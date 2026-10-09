import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UserAccount } from "./types";

const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "telegram_users.json");

// In-memory cache for fast read/write
const memoryStore = new Map<number, UserAccount>();
let isLoaded = false;

function getSecretKey(): Buffer {
  const secret =
    process.env.TELEGRAM_ENCRYPTION_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.GEMINI_API_KEY ||
    "mobogen-telegram-bot-default-secret-salt-2026";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt sensitive string (e.g. Kemnaker password) using AES-256-GCM
 */
export function encryptData(text: string): string {
  if (!text) return "";
  try {
    const key = getSecretKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("[Store] Encryption error:", err);
    return text;
  }
}

/**
 * Decrypt sensitive string
 */
export function decryptData(cipherText: string): string {
  if (!cipherText) return "";
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 3) return cipherText;

    const [ivHex, tagHex, encryptedHex] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[Store] Decryption error:", err);
    return "";
  }
}

function loadFromFile() {
  if (isLoaded) return;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, "utf8");
      const users: Record<string, UserAccount> = JSON.parse(data);
      for (const [chatIdStr, user] of Object.entries(users)) {
        memoryStore.set(Number(chatIdStr), user);
      }
    }
  } catch (err) {
    console.error("[Store] Failed to load Telegram user store:", err);
  } finally {
    isLoaded = true;
  }
}

function persistToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, UserAccount> = {};
    for (const [chatId, user] of memoryStore.entries()) {
      obj[String(chatId)] = user;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("[Store] Failed to persist Telegram user store:", err);
  }
}

export function getUser(chatId: number): UserAccount {
  loadFromFile();
  const existing = memoryStore.get(chatId);
  if (existing) {
    return { ...existing };
  }
  return {
    chatId,
    step: "idle",
    reminderEnabled: true,
    createdAt: new Date().toISOString(),
  };
}

export function saveUser(user: UserAccount): void {
  loadFromFile();
  user.updatedAt = new Date().toISOString();
  memoryStore.set(user.chatId, { ...user });
  persistToFile();
}

export function deleteUser(chatId: number): boolean {
  loadFromFile();
  const deleted = memoryStore.delete(chatId);
  if (deleted) {
    persistToFile();
  }
  return deleted;
}

export function getAllUsers(): UserAccount[] {
  loadFromFile();
  return Array.from(memoryStore.values());
}
