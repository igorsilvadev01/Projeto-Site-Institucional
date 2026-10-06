import { randomInt, createHash } from "node:crypto";
import { authDatabase, requireUser, protect, recordAudit } from "./auth.js";
import { body, mail, reject, json, guard } from "./core.js";
const digest = (user, code) => createHash("sha256").update(`${user.id}:${user.email}:${code}`).digest("hex");
export async function sendEmailVerification(request) {
  protect(request, "verify-email-send", 10);
  const user = requireUser(request, { allowUnverified: true }), store = authDatabase(), now = Date.now();
  if (user.emailVerified) return json({ message: "Seu email já está confirmado." });
  guard(request, `verify-email:${user.id}`, 5, 3_600_000);
  const previous = store.prepare("SELECT last_sent_at FROM email_verifications WHERE user_id=?").get(user.id);
  if (previous && previous.last_sent_at + 60_000 > now) reject(429, "Aguarde um minuto para pedir outro código.");
  const code = String(randomInt(1_000_000)).padStart(6, "0"), hashed = digest(user, code);
  store.prepare(`INSERT INTO email_verifications(user_id,email,code_hash,expires_at,last_sent_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,attempts=CASE WHEN email_verifications.expires_at<=? OR email_verifications.email<>excluded.email THEN 0 ELSE email_verifications.attempts END,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at`)
    .run(user.id, user.email, hashed, now + 600_000, now, now);
  try { await mail({ to: user.email, category: "verificacao", subject: "Confirme seu email — Plataforma de Privacidade", text: `Seu código de confirmação: ${code}\n\nO código expira em 10 minutos. Informe-o nas Configurações da sua conta. Não compartilhe este código.` }); }
  catch { store.prepare("DELETE FROM email_verifications WHERE user_id=? AND code_hash=?").run(user.id, hashed); reject(503, "Não foi possível enviar o código. Tente novamente em instantes."); }
  return json({ message: "Código enviado. Confira seu email e a pasta de spam.", expiresAt: now + 600_000 });
}
export async function confirmEmailVerification(request) {
  protect(request, "verify-email-confirm", 15);
  const user = requireUser(request, { allowUnverified: true }), input = await body(request), store = authDatabase();
  const row = store.prepare("UPDATE email_verifications SET attempts=attempts+1 WHERE user_id=? AND email=? AND expires_at>? AND attempts<5 RETURNING *").get(user.id, user.email, Date.now());
  if (!row) reject(400, "Código expirado ou bloqueado. Peça um novo código.");
  if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code) || digest(user, input.code) !== row.code_hash) reject(400, "Código incorreto. Confira o código mais recente.");
  store.exec("BEGIN IMMEDIATE");
  try {
    const current = requireUser(request, { allowUnverified: true });
    if (current.email !== user.email || !store.prepare("DELETE FROM email_verifications WHERE user_id=? AND code_hash=? AND expires_at>?").run(user.id, row.code_hash, Date.now()).changes) reject(409, "O email foi alterado. Peça outro código.");
    store.prepare("INSERT INTO verified_emails(user_id,verified_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at").run(user.id, Date.now());
    recordAudit(store, user, user.id, "email.verified");
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  return json({ message: "Email confirmado com sucesso." });
}
