import { backup, DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, stat, readdir, unlink, copyFile, chmod, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { encryptionKey } from "./secrets.js";

const header = Buffer.from("PORTBK01"), pattern = /^portfolio-\d{13}-[a-f0-9-]{36}\.sqlite\.enc$/;
export const backupDirectory = () => path.resolve(/* turbopackIgnore: true */ process.env.PORTFOLIO_BACKUP_DIR || path.join(process.cwd(), ".data", "backups"));
async function encryptFile(source, target, key) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const file = await open(target, "wx", 0o600);
  try {
    await file.write(Buffer.concat([header, iv]));
    await pipeline(createReadStream(source), cipher, createWriteStream(target, { fd: file.fd, start: 20, autoClose: false }));
    await file.write(cipher.getAuthTag(), 0, 16, (await file.stat()).size);
    await file.sync();
  } finally { await file.close(); }
}
export async function createBackup(store, { directory = backupDirectory(), mirror = process.env.PORTFOLIO_BACKUP_MIRROR_DIR, retention = Number(process.env.PORTFOLIO_BACKUP_RETENTION || 14), key = encryptionKey() } = {}) {
  if (!Number.isInteger(retention) || retention < 2 || retention > 365) throw new Error("BackupRetentionInvalid");
  directory = path.resolve(/* turbopackIgnore: true */ directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `portfolio-${Date.now()}-${randomUUID()}.sqlite.enc`, output = path.join(directory, name), temporary = path.join(directory, `.${randomUUID()}.sqlite`), encryptedTemporary = path.join(directory, `.${name}.part`);
  let completed = false;
  try {
    await backup(store, temporary); await chmod(temporary, 0o600);
    await encryptFile(temporary, encryptedTemporary, key);
    await rename(encryptedTemporary, output);
    if (mirror) {
      const destination = path.resolve(/* turbopackIgnore: true */ mirror);
      if (destination === directory) throw new Error("BackupMirrorMustDiffer");
      await mkdir(destination, { recursive: true, mode: 0o700 });
      const partial = path.join(destination, `.${name}.part`);
      try {
        await copyFile(output, partial, 1);
        await chmod(partial, 0o600);
        await rename(partial, path.join(destination, name));
      } finally { await unlink(partial).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    }
    completed = true;
    // Só arquivos criados por esta rotina são elegíveis à retenção.
    for (const location of [directory, ...(mirror ? [path.resolve(/* turbopackIgnore: true */ mirror)] : [])]) {
      const files = (await readdir(location)).filter(name => pattern.test(name)).sort().reverse();
      for (const old of files.slice(retention)) await unlink(path.join(location, old));
    }
    return { filename: name, createdAt: Date.now(), bytes: (await stat(output)).size, mirrored: Boolean(mirror) };
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    await unlink(encryptedTemporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    if (!completed) await unlink(output).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
export async function restoreBackup(source, destination, { key = encryptionKey() } = {}) {
  source = path.resolve(/* turbopackIgnore: true */ source); destination = path.resolve(/* turbopackIgnore: true */ destination);
  // Restauração sempre cria um diretório novo. Nunca sobrescreve o banco ativo.
  await mkdir(destination, { mode: 0o700 });
  const temporary = path.join(destination, ".restoring.sqlite"), output = path.join(destination, "portfolio.sqlite");
  const file = await open(source, "r");
  try {
    const info = await file.stat();
    if (info.size < 36) throw new Error("BackupInvalid");
    const prefix = Buffer.alloc(20), tag = Buffer.alloc(16);
    await file.read(prefix, 0, 20, 0); await file.read(tag, 0, 16, info.size - 16);
    if (!prefix.subarray(0, 8).equals(header)) throw new Error("BackupInvalid");
    const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(8));
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: 20, end: info.size - 17 }), decipher, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    const restored = new DatabaseSync(temporary);
    try {
      if (restored.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || restored.prepare("PRAGMA foreign_key_check").all().length) throw new Error("BackupIntegrityFailed");
    } finally { restored.close(); }
    await rename(temporary, output);
    return output;
  } finally {
    await file.close();
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
