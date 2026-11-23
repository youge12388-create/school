import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const algorithm = "aes-256-gcm";
let cachedKey: { path: string; mtimeMs: number; size: number; key: Buffer } | null = null;

export function getAppKey() {
  const keyPath = resolve(/* turbopackIgnore: true */ process.env.APP_KEY_PATH ?? "./data/keys/app.key");
  mkdirSync(dirname(keyPath), { recursive: true });
  if (!existsSync(/* turbopackIgnore: true */ keyPath)) {
    try {
      writeFileSync(/* turbopackIgnore: true */ keyPath, randomBytes(32), { flag: "wx" });
      try {
        chmodSync(/* turbopackIgnore: true */ keyPath, 0o600);
      } catch {
        // Windows ACLs are managed outside POSIX mode bits.
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const info = statSync(/* turbopackIgnore: true */ keyPath);
  if (
    cachedKey &&
    cachedKey.path === keyPath &&
    cachedKey.mtimeMs === info.mtimeMs &&
    cachedKey.size === info.size
  ) {
    return cachedKey.key;
  }
  const key = readFileSync(/* turbopackIgnore: true */ keyPath);
  if (key.length !== 32) throw new Error("应用加密密钥长度不正确");
  cachedKey = { path: keyPath, mtimeMs: info.mtimeMs, size: info.size, key };
  return key;
}

export function encryptBuffer(buffer: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getAppKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return {
    encrypted,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

export function decryptBuffer(
  encrypted: Buffer,
  ivText: string,
  tagText: string,
  expectedChecksum: string,
) {
  const decipher = createDecipheriv(
    algorithm,
    getAppKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const checksum = createHash("sha256").update(plain).digest("hex");
  if (checksum !== expectedChecksum) throw new Error("文件完整性校验失败");
  return plain;
}
