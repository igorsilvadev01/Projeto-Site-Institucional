import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const privateDataDir = () => path.resolve(/* turbopackIgnore: true */ process.env.PORTFOLIO_DATA_DIR || path.join(process.cwd(), ".data"));
export function encryptionKey() {
  let value = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("EncryptionKeyMissing");
    const directory = privateDataDir(), filename = path.join(directory, ".encryption-key");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { value = readFileSync(filename, "utf8").trim(); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      value = randomBytes(32).toString("base64");
      try { writeFileSync(filename, value, { flag: "wx", mode: 0o600 }); }
      catch (failure) { if (failure.code !== "EEXIST") throw failure; value = readFileSync(filename, "utf8").trim(); }
    }
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new Error("EncryptionKeyInvalid");
  return Buffer.from(value, "base64");
}
export function encryptSecret(value) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptSecret(value) {
  const raw = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
