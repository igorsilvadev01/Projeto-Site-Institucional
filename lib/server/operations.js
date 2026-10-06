import { authDatabase, requireAdmin } from "./auth.js";
import { deliveryDatabase, processContactQueue } from "./contact-delivery.js";
import { createBackup } from "./backups.js";
import { randomUUID } from "node:crypto";

export function operationsDatabase() {
  const store = authDatabase(); deliveryDatabase();
  store.exec("CREATE TABLE IF NOT EXISTS operation_state(name TEXT PRIMARY KEY,updated_at INTEGER NOT NULL,value TEXT NOT NULL)");
  return store;
}
function state(store, name, value) {
  store.prepare("INSERT INTO operation_state(name,updated_at,value) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at,value=excluded.value").run(name, Date.now(), JSON.stringify(value));
}
export async function operationTick({ backup = true } = {}) {
  const store = operationsDatabase();
  state(store, "worker", { status: "running" });
  await processContactQueue();
  const now = Date.now();
  for (const table of ["mfa_challenges", "mfa_enrollments", "email_verifications", "pending_registrations", "password_resets", "user_sessions"]) store.prepare(`DELETE FROM ${table} WHERE expires_at<=?`).run(now);
  const previous = store.prepare("SELECT updated_at FROM operation_state WHERE name='backup'").get();
  if (backup && (!previous || previous.updated_at + 86_400_000 <= now)) {
    const owner = randomUUID();
    const lease = store.prepare(`INSERT INTO operation_state(name,updated_at,value) VALUES('backup-lease',?,?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at,value=excluded.value WHERE operation_state.updated_at<? RETURNING name`).get(now, owner, now - 3_600_000);
    if (lease) {
      try { state(store, "backup", await createBackup(store)); state(store, "backup-error", { status: "ok" }); }
      catch { state(store, "backup-error", { status: "failed", code: "BACKUP_FAILED" }); }
      finally { store.prepare("DELETE FROM operation_state WHERE name='backup-lease' AND value=?").run(owner); }
    }
  }
  state(store, "worker", { status: "ready" });
}
export function operationOverview(user) {
  requireAdmin(user);
  const store = operationsDatabase();
  return {
    states: Object.fromEntries(store.prepare("SELECT * FROM operation_state WHERE name<>'backup-lease'").all().map(row => [row.name, { at: row.updated_at, ...JSON.parse(row.value) }])),
    queue: store.prepare("SELECT j.*,c.created_at FROM contact_delivery_jobs j JOIN contact_requests c USING(reference) WHERE j.status NOT IN ('done','local') ORDER BY c.created_at DESC LIMIT 50").all(),
    audit: store.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 50").all(),
  };
}
