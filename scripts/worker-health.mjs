import { DatabaseSync } from "node:sqlite";
import { privateDataDir } from "../lib/server/secrets.js";
import path from "node:path";
try {
  const store = new DatabaseSync(path.join(privateDataDir(), "portfolio.sqlite"), { readOnly: true });
  try {
    const heartbeat = store.prepare("SELECT updated_at FROM operation_state WHERE name='worker'").get();
    if (!heartbeat || heartbeat.updated_at < Date.now() - 300_000) process.exitCode = 1;
  } finally { store.close(); }
} catch { process.exitCode = 1; }
