import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { registrationCode, localEmail } from "./email-helper.mjs";
import { assessmentQuestions } from "../lib/assessment.js";

process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost";
delete process.env.PORTFOLIO_TRUST_PROXY;
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) delete process.env[key];
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-editing-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const core = await import("../lib/server/core.js");
const auth = await import("../lib/server/auth.js");
const portal = await import("../lib/server/portal.js");
const password = "frase longa para teste";
const request = (data, cookie = "", origin = "http://localhost") => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(data) });
const call = (handler, data, cookie = "", params = {}) => core.handled(handler)(request(data, cookie), { params: Promise.resolve(params) });
const edit = (data, cookie = admin.cookie) => call(portal.portalMutation, data, cookie, { action: "editar-conta" });
let db, admin, member, client, otherAdmin, report, resetToken;
const payload = user => {
  const current = portal.adminData(admin, { tab: "usuarios", q: user.email }).users.find(row => row.id === user.id);
  return { userId: user.id, name: current.name, email: current.email, role: current.role, version: current.version };
};
async function account(name, role = "usuario") {
  const email = `${name}@example.invalid`;
  const pending = await call(auth.register, { name, email, password, terms: true });
  assert.equal(pending.status, 202);
  const confirmed = await call(auth.confirmRegistration, { code: registrationCode(directory, email) }, pending.headers.get("set-cookie").split(";")[0]);
  assert.equal(confirmed.status, 201);
  const cookie = confirmed.headers.get("set-cookie").split(";")[0];
  const user = auth.sessionUser(cookie.split("=")[1]);
  db.prepare("INSERT INTO user_access(user_id,role) VALUES(?,?)").run(user.id, role);
  return { ...user, role, cookie };
}
before(async () => {
  db = portal.portalDatabase();
  admin = await account("operador-edicao", "admin");
  member = await account("usuario-edicao");
  client = await account("cliente-edicao", "cliente");
  otherAdmin = await account("outro-admin-edicao", "admin");
  report = await (await call(core.createAssessment, { company: "Empresa preservada", name: client.name, email: client.email, sector: "Tecnologia", consent: true, answers: Object.fromEntries(assessmentQuestions.map(item => [item.id, "no"])) }, client.cookie)).json();
  assert.ok(report.id);
  assert.equal((await call(portal.portalMutation, { subject: "Atendimento preservado", message: "Não remover" }, client.cookie, { action: "solicitacao" })).status, 200);
  assert.equal((await call(auth.recover, { email: client.email })).status, 200);
  resetToken = localEmail(directory, client.email, /redefinir-senha#([\w-]{43})/)[1];
});
after(() => {
  const key = Symbol.for("privacy-platform.sqlite"); globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-editing-test-")) rmSync(directory, { recursive: true, force: true });
});

test("edição administrativa: autenticação, origem, campos válidos e preservação de perfis Admin", async () => {
  const data = { ...payload(member), name: "Nome editado" };
  assert.equal((await edit(data, "")).status, 401);
  assert.equal((await edit(data, member.cookie)).status, 403);
  assert.equal((await edit(data, client.cookie)).status, 403);
  for (const origin of ["", "https://evil.invalid"]) assert.equal((await core.handled(portal.portalMutation)(request(data, admin.cookie, origin), { params: Promise.resolve({ action: "editar-conta" }) })).status, 403);
  for (const invalid of [{ name: "A" }, { name: "X".repeat(121) }, { email: "email-invalido" }, { role: "admin" }, { role: "desconhecido" }, { version: "" }]) assert.equal((await edit({ ...data, ...invalid })).status, 400);
  assert.equal((await edit({ ...data, email: client.email })).status, 409);
  assert.equal((await edit({ ...data, userId: "inexistente" })).status, 404);
  assert.equal((await edit({ ...payload(admin), role: "usuario" })).status, 400);
  assert.equal((await edit({ ...payload(otherAdmin), role: "cliente" })).status, 400);
  assert.equal(db.prepare("SELECT name FROM users WHERE id=?").get(member.id).name, member.name);
  assert.equal(auth.sessionUser(client.cookie.split("=")[1]).role, "cliente");
});

test("edição administrativa: nomes com acentos, sessões preservadas e alterações concorrentes", async () => {
  const original = payload(member), verification = db.prepare("SELECT verified_at FROM verified_emails WHERE user_id=?").get(member.id).verified_at;
  assert.equal((await edit({ ...original, name: "  João da Conceição  " })).status, 200);
  const current = auth.sessionUser(member.cookie.split("=")[1]);
  assert.equal(current.name, "João da Conceição");
  assert.equal(current.email, member.email);
  assert.equal(db.prepare("SELECT verified_at FROM verified_emails WHERE user_id=?").get(member.id).verified_at, verification);
  const stale = await edit({ ...original, name: "Não sobrescrever" });
  assert.equal(stale.status, 409);
  assert.equal(stale.headers.get("X-Portal-Account-Conflict"), "stale");
  assert.equal(db.prepare("SELECT name FROM users WHERE id=?").get(member.id).name, "João da Conceição");
  assert.equal((await edit({ ...payload(otherAdmin), name: "Administração Técnica" })).status, 200);
  assert.equal(auth.sessionUser(otherAdmin.cookie.split("=")[1]).role, "admin");
});

test("edição administrativa: não ocupa um email com cadastro em confirmação", async () => {
  const address = "cadastro-pendente@example.invalid";
  assert.equal((await call(auth.register, { name: "Cadastro pendente", email: address, password, terms: true })).status, 202);
  assert.equal((await edit({ ...payload(member), email: address })).status, 409);
  assert.equal(db.prepare("SELECT email FROM users WHERE id=?").get(member.id).email, member.email);
  assert.ok(db.prepare("SELECT token_hash FROM pending_registrations WHERE email=?").get(address));
});

test("edição administrativa: perda de acesso durante a leitura do pedido impede alteração", async () => {
  let streamController;
  const pending = new Request("http://localhost/api/test", { method: "POST", headers: { Origin: "http://localhost", Cookie: admin.cookie, "Content-Type": "application/json" }, body: new ReadableStream({ start(controller) { streamController = controller; } }), duplex: "half" });
  const data = { ...payload(member), name: "Não alterar sem acesso" };
  const result = core.handled(portal.portalMutation)(pending, { params: Promise.resolve({ action: "editar-conta" }) });
  await new Promise(resolve => setImmediate(resolve));
  db.prepare("UPDATE user_access SET role='usuario' WHERE user_id=?").run(admin.id);
  streamController.enqueue(new TextEncoder().encode(JSON.stringify(data))); streamController.close();
  try { assert.equal((await result).status, 403); assert.equal(db.prepare("SELECT name FROM users WHERE id=?").get(member.id).name, "João da Conceição"); }
  finally { db.prepare("UPDATE user_access SET role='admin' WHERE user_id=?").run(admin.id); }
});

test("edição administrativa: falhas revertem dados, verificação e revogação de sessões", async () => {
  const original = payload(client);
  db.exec(`CREATE TRIGGER editing_failure BEFORE DELETE ON user_sessions WHEN OLD.user_id='${client.id}' BEGIN SELECT RAISE(ABORT,'editing-test'); END;`);
  try {
    assert.equal((await edit({ ...original, name: "Não persistir", email: "rollback@example.invalid", role: "usuario" })).status, 500);
    assert.deepEqual(payload(client), original);
    assert.ok(db.prepare("SELECT user_id FROM verified_emails WHERE user_id=?").get(client.id));
    assert.ok(db.prepare("SELECT user_id FROM password_resets WHERE user_id=?").get(client.id));
    assert.ok(auth.sessionUser(client.cookie.split("=")[1]));
  } finally { db.exec("DROP TRIGGER editing_failure"); }
});

test("edição administrativa: email e perfil atualizados, sessões e recuperação revogadas, histórico preservado", async () => {
  const original = payload(client);
  const storedPassword = db.prepare("SELECT password_hash FROM users WHERE id=?").get(client.id).password_hash;
  const emails = db.prepare("SELECT COUNT(*) AS n FROM email_events").get().n;
  const response = await edit({ ...original, name: "Cláudia São José", email: "  NOVO-CLIENTE@example.invalid  ", role: "usuario", password: "ignorar tentativa de alterar senha" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionsRevoked, true);
  const current = db.prepare("SELECT name,email,password_hash FROM users WHERE id=?").get(client.id);
  assert.equal(current.name, "Cláudia São José");
  assert.equal(current.email, "novo-cliente@example.invalid");
  assert.equal(current.password_hash, storedPassword);
  assert.equal(auth.sessionUser(client.cookie.split("=")[1]), null);
  for (const table of ["user_sessions", "password_resets", "verified_emails"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(client.id).n, 0);
  assert.equal((await call(auth.resetPassword, { token: resetToken, password })).status, 400);
  assert.equal((await call(auth.login, { email: client.email, password })).status, 401);
  const login = await call(auth.login, { email: current.email, password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(auth.sessionUser(cookie.split("=")[1]).role, "usuario");
  assert.equal((await call(core.getAssessment, {}, cookie, { id: report.id })).status, 200);
  assert.equal(db.prepare("SELECT user_id FROM assessment_owners WHERE assessment_id=?").get(report.id).user_id, client.id);
  assert.equal(db.prepare("SELECT email FROM assessments WHERE id=?").get(report.id).email, client.email);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM client_requests WHERE user_id=?").get(client.id).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_events").get().n, emails);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("edição administrativa: mudança apenas de perfil encerra sessões sem apagar confirmação", async () => {
  assert.equal((await edit({ ...payload(member), role: "cliente" })).status, 200);
  assert.equal(auth.sessionUser(member.cookie.split("=")[1]), null);
  assert.ok(db.prepare("SELECT user_id FROM verified_emails WHERE user_id=?").get(member.id));
  assert.equal(db.prepare("SELECT role FROM user_access WHERE user_id=?").get(member.id).role, "cliente");
});

test("edição administrativa: permite atualizar o próprio nome e email sem perder perfil Admin", async () => {
  assert.equal((await edit({ ...payload(admin), name: "Igor Administração" })).status, 200);
  assert.equal(auth.sessionUser(admin.cookie.split("=")[1]).name, "Igor Administração");
  const response = await edit({ ...payload(admin), email: "admin-novo@example.invalid" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).requiresLogin, true);
  assert.equal(auth.sessionUser(admin.cookie.split("=")[1]), null);
  const login = await call(auth.login, { email: "admin-novo@example.invalid", password });
  assert.equal(login.status, 200);
  assert.equal(auth.sessionUser(login.headers.get("set-cookie").split(";")[0].split("=")[1]).role, "admin");
});
