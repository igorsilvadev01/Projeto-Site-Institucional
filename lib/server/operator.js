import { authDatabase, recordAudit } from "./auth.js";
const operator = { id: "server-operator", name: "Operador do servidor" };
export function setAccountRole(address, role) {
  if (!["usuario", "cliente", "admin"].includes(role)) throw new Error("InvalidRole");
  const store = authDatabase();
  store.exec("BEGIN IMMEDIATE");
  try {
    const user = store.prepare("SELECT u.id,COALESCE(a.role,'usuario') AS role FROM users u LEFT JOIN user_access a ON a.user_id=u.id WHERE u.email=?").get(address.trim().toLowerCase());
    if (!user) throw new Error("AccountNotFound");
    if (user.role === "admin" && role !== "admin" && store.prepare("SELECT COUNT(*) AS n FROM user_access WHERE role='admin'").get().n <= 1) throw new Error("LastAdmin");
    if (user.role !== role) {
      store.prepare("INSERT INTO user_access(user_id,role) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role").run(user.id, role);
      for (const table of ["user_sessions", "password_resets", "mfa_challenges", "mfa_enrollments"]) store.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id);
      recordAudit(store, operator, user.id, "account.role_changed", { previousRole: user.role, role });
    }
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
}
export function resetAccountMfa(address) {
  const store = authDatabase();
  store.exec("BEGIN IMMEDIATE");
  try {
    const user = store.prepare("SELECT id FROM users WHERE email=?").get(address.trim().toLowerCase());
    if (!user) throw new Error("AccountNotFound");
    for (const table of ["user_mfa", "mfa_recovery_codes", "mfa_challenges", "mfa_enrollments", "user_sessions", "password_resets"]) store.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id);
    recordAudit(store, operator, user.id, "mfa.reset_by_operator");
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
}
