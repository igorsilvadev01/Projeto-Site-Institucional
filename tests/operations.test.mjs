import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import nodemailer from "nodemailer";
import { productionProblems } from "../lib/server/preflight.js";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-operations-"));
process.env.PORTFOLIO_DATA_DIR = path.join(directory, "data"); process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost"; process.env.PORTFOLIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");
for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "PORTFOLIO_TRUST_PROXY"]) delete process.env[name];
const core = await import("../lib/server/core.js"), delivery = await import("../lib/server/contact-delivery.js"), operations = await import("../lib/server/operations.js"), backups = await import("../lib/server/backups.js");
after(() => {
  const key = Symbol.for("privacy-platform.sqlite"); globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-operations-")) rmSync(directory, { recursive: true, force: true });
});
test("fila de contatos: falha persiste, reserva evita duplicidade e retentativa confirma aceite", async context => {
  process.env.SMTP_HOST = "smtp.example.invalid"; process.env.MAIL_FROM = "Portal <sender@example.invalid>"; process.env.CONTACT_EMAIL = "recipient@example.invalid";
  let sends = 0, available = false;
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { sends++; if (!available) throw Object.assign(new Error(), { code: "ECONNECTION" }); await new Promise(resolve => setTimeout(resolve, 10)); return { accepted: ["recipient@example.invalid"], messageId: "test", response: "250 OK" }; } }));
  const response = await core.handled(core.contact)(new Request("http://localhost/api/contato", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Verificação", email: "visitor@example.invalid", company: "Empresa", interest: "privacidade", message: "Mensagem válida de teste", consent: true }) }), { clientIp: "192.0.2.1" });
  assert.equal(response.status, 201); const { reference, emailDelivered } = await response.json(); assert.equal(emailDelivered, false);
  let store = delivery.deliveryDatabase(), row = store.prepare("SELECT * FROM contact_delivery_jobs WHERE reference=?").get(reference);
  assert.equal(row.status, "retry"); assert.equal(row.attempts, 1); assert.equal(row.last_error_code, "ECONNECTION");
  await delivery.processContactQueue(); assert.equal(sends, 1);
  const key = Symbol.for("privacy-platform.sqlite"); globalThis[key].close(); delete globalThis[key]; store = delivery.deliveryDatabase();
  store.prepare("UPDATE contact_delivery_jobs SET next_attempt_at=0").run(); available = true;
  const results = await Promise.all([delivery.deliverContact(reference), delivery.deliverContact(reference)]);
  assert.deepEqual(results.sort(), [false, true]); assert.equal(sends, 2);
  assert.equal(store.prepare("SELECT email_delivered FROM contact_requests WHERE reference=?").get(reference).email_delivered, 1);
  assert.equal(store.prepare("SELECT status FROM contact_delivery_jobs WHERE reference=?").get(reference).status, "done");
});
test("fila de contatos: reserva vencida é recuperada e seis falhas encerram as tentativas", async context => {
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { throw Object.assign(new Error(), { code: "EAUTH" }); } }));
  const store = delivery.deliveryDatabase();
  const reference = store.prepare("SELECT reference FROM contact_requests LIMIT 1").get().reference;
  store.prepare("UPDATE contact_requests SET email_delivered=0").run();
  store.prepare("UPDATE contact_delivery_jobs SET status='sending',attempts=5,locked_until=0,next_attempt_at=0").run();
  assert.equal(await delivery.deliverContact(reference), false);
  assert.equal(store.prepare("SELECT status FROM contact_delivery_jobs WHERE reference=?").get(reference).status, "failed");
  await operations.operationTick({ backup: false });
  assert.ok(store.prepare("SELECT updated_at FROM operation_state WHERE name='worker'").get().updated_at);
});
test("reenvio manual é exclusivo do administrador, auditado e apenas agenda uma nova tentativa", async () => {
  const auth = await import("../lib/server/auth.js"), portal = await import("../lib/server/portal.js");
  const store = portal.portalDatabase();
  store.prepare("INSERT INTO users(id,name,email,password_hash,created_at,terms_at) VALUES('retry-admin','Operador teste','admin@example.invalid','unused',?,?)").run(Date.now(), Date.now());
  store.prepare("INSERT INTO user_access(user_id,role) VALUES('retry-admin','admin')").run();
  const cookie = auth.createSession("retry-admin", new Request("http://localhost"));
  const reference = store.prepare("SELECT reference FROM contact_delivery_jobs WHERE status='failed'").get().reference;
  const invoke = value => core.handled(portal.portalMutation)(new Request("http://localhost/api/portal/reenviar-contato", { method: "POST", headers: { Origin: "http://localhost", Cookie: value, "Content-Type": "application/json" }, body: JSON.stringify({ reference }) }), { params: Promise.resolve({ action: "reenviar-contato" }) });
  assert.equal((await invoke("")).status, 401);
  assert.equal((await invoke(cookie)).status, 200);
  assert.equal(store.prepare("SELECT status FROM contact_delivery_jobs WHERE reference=?").get(reference).status, "pending");
  assert.equal(store.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='contact.retry_requested'").get().n, 1);
  assert.equal((await invoke(cookie)).status, 409);
});
test("backup: cópia consistente, criptografia, espelho, retenção e restauração validada sem sobrescrever dados", async () => {
  const store = core.db(), location = path.join(directory, "backups"), mirror = path.join(directory, "mirror");
  const result = await backups.createBackup(store, { directory: location, mirror, retention: 2 });
  const file = path.join(location, result.filename), contents = readFileSync(file);
  assert.equal(contents.subarray(0, 8).toString(), "PORTBK01"); assert.ok(!contents.includes(Buffer.from("Mensagem válida")));
  assert.deepEqual(readFileSync(path.join(mirror, result.filename)), contents);
  assert.equal(readdirSync(location).filter(name => name.endsWith(".sqlite")).length, 0);
  const target = path.join(directory, "restored"); await backups.restoreBackup(file, target);
  const restored = new DatabaseSync(path.join(target, "portfolio.sqlite"));
  try { assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM contact_requests").get().n, store.prepare("SELECT COUNT(*) AS n FROM contact_requests").get().n); }
  finally { restored.close(); }
  await assert.rejects(backups.restoreBackup(file, target), /EEXIST/);
  const invalidTarget = path.join(directory, "wrong-key");
  await assert.rejects(backups.restoreBackup(file, invalidTarget, { key: randomBytes(32) }));
  assert.deepEqual(readdirSync(invalidTarget), []);
  writeFileSync(path.join(location, "keep.txt"), "preservar");
  await backups.createBackup(store, { directory: location, mirror, retention: 2 }); await backups.createBackup(store, { directory: location, mirror, retention: 2 });
  assert.equal(readdirSync(location).filter(name => name.endsWith(".enc")).length, 2); assert.equal(readFileSync(path.join(location, "keep.txt"), "utf8"), "preservar");
});
test("processo de manutenção registra backup diário e não repete cópia antes de 24 horas", async () => {
  delete process.env.SMTP_HOST;
  process.env.PORTFOLIO_BACKUP_DIR = path.join(directory, "worker-backups");
  process.env.PORTFOLIO_BACKUP_MIRROR_DIR = path.join(directory, "worker-mirror");
  await operations.operationTick();
  const store = operations.operationsDatabase(), row = store.prepare("SELECT value FROM operation_state WHERE name='backup'").get();
  assert.equal(JSON.parse(row.value).mirrored, true);
  assert.equal(readdirSync(process.env.PORTFOLIO_BACKUP_DIR).length, 1);
  await operations.operationTick();
  assert.equal(readdirSync(process.env.PORTFOLIO_BACKUP_DIR).length, 1);
  assert.equal(store.prepare("SELECT COUNT(*) AS n FROM operation_state WHERE name='backup-lease'").get().n, 0);
});
test("produção: configuração incompleta, origem forjada e IP desconhecido são bloqueados", async () => {
  assert.ok(productionProblems({}, { filesystem: false }).length >= 8);
  const env = { SITE_URL: "https://portfolio.example.invalid", PORTFOLIO_DOMAIN: "portfolio.example.invalid", PORTFOLIO_TRUST_PROXY: "true", SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "user", SMTP_PASS: "test", MAIL_FROM: "test@example.invalid", CONTACT_EMAIL: "test@example.invalid", PORTFOLIO_ENCRYPTION_KEY: randomBytes(32).toString("base64"), PORTFOLIO_CONTROLLER_NAME: "Empresa de teste", PORTFOLIO_CONTROLLER_CNPJ: "00000000000000", PORTFOLIO_PRIVACY_EMAIL: "privacy@example.invalid", PORTFOLIO_LEGAL_APPROVED: "true", PORTFOLIO_DATA_DIR: path.join(directory, "data"), PORTFOLIO_BACKUP_DIR: path.join(directory, "backups"), PORTFOLIO_BACKUP_MIRROR_DIR: path.join(directory, "mirror") };
  assert.deepEqual(productionProblems(env), []);
  assert.ok(productionProblems({ ...env, SITE_URL: "http://localhost:3000" }, { filesystem: false }).length);
  process.env.NODE_ENV = "production"; process.env.PORTFOLIO_TRUST_PROXY = "true"; process.env.SITE_URL = env.SITE_URL;
  try {
    const forged = new Request("https://evil.invalid/api/contact", { headers: { Origin: "https://evil.invalid", "X-Forwarded-For": "192.0.2.1" } });
    assert.throws(() => core.guard(forged, "test"), /Origem/);
    assert.throws(() => core.guard(new Request(`${env.SITE_URL}/api/contact`, { headers: { Origin: env.SITE_URL } }), "test"), /proxy/);
  } finally { process.env.NODE_ENV = "development"; process.env.SITE_URL = "http://localhost"; delete process.env.PORTFOLIO_TRUST_PROXY; }
});
