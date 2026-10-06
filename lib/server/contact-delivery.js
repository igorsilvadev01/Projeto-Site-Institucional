import { db, mail, smtpReady } from "./core.js";
import { interests } from "../site.js";

export function deliveryDatabase() {
  const store = db();
  store.exec(`CREATE TABLE IF NOT EXISTS contact_delivery_jobs(
    reference TEXT PRIMARY KEY REFERENCES contact_requests(reference) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,locked_until INTEGER NOT NULL DEFAULT 0,last_error_code TEXT);
    CREATE INDEX IF NOT EXISTS contact_delivery_due ON contact_delivery_jobs(status,next_attempt_at);`);
  return store;
}
export function enqueueContact(store, reference) {
  store.prepare("INSERT INTO contact_delivery_jobs(reference,next_attempt_at) VALUES(?,?) ON CONFLICT(reference) DO NOTHING").run(reference, Date.now());
}
export async function deliverContact(reference) {
  const store = deliveryDatabase(), now = Date.now();
  const job = store.prepare(`UPDATE contact_delivery_jobs SET status='sending',attempts=attempts+1,locked_until=?
    WHERE reference=? AND next_attempt_at<=? AND (status IN ('pending','retry') OR (status='sending' AND locked_until<=?)) RETURNING *`)
    .get(now + 120_000, reference, now, now);
  if (!job) return false;
  const row = store.prepare("SELECT * FROM contact_requests WHERE reference=?").get(reference);
  try {
    if (!process.env.CONTACT_EMAIL && smtpReady()) throw new Error("ContactRecipientMissing");
    const value = JSON.parse(row.payload);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(row.created_at)).map(({ type, value }) => [type, value]));
    const accepted = await mail({ to: process.env.CONTACT_EMAIL || "contato@localhost", replyTo: value.email, category: "contato",
      subject: `Nova solicitação Plataforma de Privacidade — ${reference}`,
      text: `Ticket: ${reference} - Data: ${parts.year}/${parts.month}/${parts.day}\n\nNome: ${value.name}\nEmpresa: ${value.company || "Não informada"}\n\nInteresse: ${interests.find(([key]) => key === value.interest)?.[1] || value.interest}\n\n${value.message}\n\nE-mail: ${value.email}\nTelefone: ${value.phone || "Não informado"}`,
    });
    store.exec("BEGIN IMMEDIATE");
    try {
      if (accepted) store.prepare("UPDATE contact_requests SET email_delivered=1 WHERE reference=?").run(reference);
      store.prepare("UPDATE contact_delivery_jobs SET status=?,locked_until=0,last_error_code=NULL WHERE reference=? AND attempts=?").run(accepted ? "done" : "local", reference, job.attempts);
      store.exec("COMMIT");
    } catch (error) { store.exec("ROLLBACK"); throw error; }
    return accepted;
  } catch {
    const failure = store.prepare("SELECT error_code FROM email_events WHERE category='contato' AND subject LIKE ? ORDER BY created_at DESC LIMIT 1").get(`%${reference}`);
    store.prepare("UPDATE contact_delivery_jobs SET status=?,locked_until=0,next_attempt_at=?,last_error_code=? WHERE reference=? AND attempts=?")
      .run(job.attempts >= 6 ? "failed" : "retry", Date.now() + Math.min(3_600_000, 60_000 * 2 ** (job.attempts - 1)), failure?.error_code || "DELIVERY_FAILED", reference, job.attempts);
    return false;
  }
}
export async function processContactQueue(limit = 10) {
  const store = deliveryDatabase(), now = Date.now();
  const due = store.prepare("SELECT reference FROM contact_delivery_jobs WHERE next_attempt_at<=? AND (status IN ('pending','retry') OR (status='sending' AND locked_until<=?)) ORDER BY next_attempt_at LIMIT ?").all(now, now, limit);
  for (const { reference } of due) await deliverContact(reference);
  return due.length;
}
