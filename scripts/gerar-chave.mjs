import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { privateDataDir } from "../lib/server/secrets.js";
import path from "node:path";
try {
  let key;
  try { key = readFileSync(path.join(privateDataDir(), ".encryption-key"), "utf8").trim(); }
  catch (error) { if (error.code !== "ENOENT") throw error; key = randomBytes(32).toString("base64"); }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error("InvalidKey");
  writeFileSync("production.keys.env", `PORTFOLIO_ENCRYPTION_KEY=${key}\n`, { flag: "wx", mode: 0o600 });
  console.log("Chave gravada em production.keys.env, sem exibir seu conteúdo. Preserve uma cópia segura fora do servidor. Se já havia uma chave local, ela foi mantida para permitir a migração dos autenticadores.");
} catch { console.error("Não foi possível criar production.keys.env. O arquivo existente e os dados foram preservados."); process.exitCode = 1; }
