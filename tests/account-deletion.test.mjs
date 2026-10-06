import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { registrationCode } from "./email-helper.mjs";
import { assessmentQuestions } from "../lib/assessment.js";

process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost";
delete process.env.PORTFOLIO_TRUST_PROXY;
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) delete process.env[key];
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-deletion-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const core = await import("../lib/server/core.js");
const auth = await import("../lib/server/auth.js");
const portal = await import("../lib/server/portal.js");
const request = (data, cookie = "", origin = "http://localhost") => new Request("http://localhost/api/portal/excluir-conta", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(data),
});
const call = (handler, data, cookie = "", params = {}) => core.handled(handler)(request(data, cookie), { params: Promise.resolve(params) });
const mutation = (action, data, cookie) => call(portal.portalMutation, data, cookie, { action });
let db, admin, client, member, otherAdmin, owned, retained, anonymous;
async function account(name, role = "usuario") {
  const email = `${name}@example.invalid`;
  const pending = await call(auth.register, { name, email, password: "frase longa para teste", terms: true });
  assert.equal(pending.status, 202);
  const confirmed = await call(auth.confirmRegistration, { code: registrationCode(directory, email) }, pending.headers.get("set-cookie").split(";")[0]);
  assert.equal(confirmed.status, 201);
  const cookie = confirmed.headers.get("set-cookie").split(";")[0];
  const user = auth.sessionUser(cookie.split("=")[1]);
  db.prepare("INSERT INTO user_access(user_id,role) VALUES(?,?)").run(user.id, role);
  return { ...user, role, cookie };
}
const payload = () => ({ userId: client.id, confirmationEmail: client.email });
const tables = ["users", "user_sessions", "password_resets", "verified_emails", "user_access", "assessments", "assessment_owners", "evidences", "action_progress", "client_requests", "request_reads", "client_services"];
const counts = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));

before(async () => {
  db = portal.portalDatabase();
  admin = await account("operador-exclusao", "admin");
  client = await account("cliente-exclusao", "cliente");
  member = await account("usuario-preservado");
  otherAdmin = await account("outro-administrador", "admin");
  const assessment = { company: "Empresa de teste", name: "Responsável", email: client.email, sector: "Tecnologia", consent: true, answers: Object.fromEntries(assessmentQuestions.map(item => [item.id, "no"])) };
  owned = await (await call(core.createAssessment, assessment, client.cookie)).json();
  retained = await (await call(core.createAssessment, assessment, member.cookie)).json();
  anonymous = await (await call(core.createAssessment, assessment)).json();
  db.prepare("INSERT INTO evidences(id,assessment_id,name,mime,size,category,content,created_at) VALUES('deletion-evidence',?,'prova.pdf','application/pdf',5,'other',?,?)").run(owned.id, Buffer.from("%PDF-"), Date.now());
  assert.equal((await mutation("acao", { assessmentId: owned.id, actionId: "security-1", assignee: "Equipe TI", dueDate: "", status: "andamento" }, client.cookie)).status, 200);
  assert.equal((await mutation("solicitacao", { subject: "Ajuda", message: "Solicitação de teste" }, client.cookie)).status, 200);
  const id = portal.portalData(client).requests[0].id;
  assert.equal((await mutation("resposta", { id, reply: "Resposta de teste", status: "andamento" }, admin.cookie)).status, 200);
  assert.equal((await mutation("leitura", { id, version: portal.portalData(client).requests[0].replyVersion }, client.cookie)).status, 200);
  assert.equal((await mutation("servico", { userId: client.id, title: "Consultoria", description: "Serviço de teste", status: "andamento", dueDate: "" }, admin.cookie)).status, 200);
  assert.equal((await call(auth.recover, { email: client.email })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id=?").get(client.id).n, 1);
});
after(() => {
  const key = Symbol.for("privacy-platform.sqlite"); globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-deletion-test-")) rmSync(directory, { recursive: true, force: true });
});

test("exclusão: somente administradores, confirmação correta e proteção da própria conta", async () => {
  const initial = counts();
  assert.equal((await mutation("excluir-conta", payload(), "")).status, 401);
  assert.equal((await mutation("excluir-conta", payload(), member.cookie)).status, 403);
  assert.equal((await mutation("excluir-conta", payload(), client.cookie)).status, 403);
  assert.equal((await mutation("excluir-conta", { ...payload(), confirmationEmail: admin.email }, admin.cookie)).status, 400);
  assert.equal((await mutation("excluir-conta", { userId: admin.id, confirmationEmail: admin.email }, admin.cookie)).status, 400);
  assert.equal((await mutation("excluir-conta", { ...payload(), userId: "inexistente" }, admin.cookie)).status, 404);
  for (const origin of ["", "https://evil.invalid"]) assert.equal((await core.handled(portal.portalMutation)(request(payload(), admin.cookie, origin), { params: Promise.resolve({ action: "excluir-conta" }) })).status, 403);
  assert.deepEqual(counts(), initial);
});

test("exclusão: mudança de perfil durante a leitura do pedido impede a operação", async () => {
  let streamController;
  const pending = new Request("http://localhost/api/portal/excluir-conta", { method: "POST", headers: { Origin: "http://localhost", Cookie: admin.cookie, "Content-Type": "application/json" }, body: new ReadableStream({ start(controller) { streamController = controller; } }), duplex: "half" });
  const result = core.handled(portal.portalMutation)(pending, { params: Promise.resolve({ action: "excluir-conta" }) });
  await new Promise(resolve => setImmediate(resolve));
  db.prepare("UPDATE user_access SET role='usuario' WHERE user_id=?").run(admin.id);
  streamController.enqueue(new TextEncoder().encode(JSON.stringify(payload())));
  streamController.close();
  try { assert.equal((await result).status, 403); assert.ok(db.prepare("SELECT id FROM users WHERE id=?").get(client.id)); }
  finally { db.prepare("UPDATE user_access SET role='admin' WHERE user_id=?").run(admin.id); }
});

test("exclusão: uma falha reverte a remoção de todos os dados vinculados", async () => {
  const initial = counts();
  db.exec("CREATE TRIGGER deletion_failure BEFORE DELETE ON users WHEN OLD.email='cliente-exclusao@example.invalid' BEGIN SELECT RAISE(ABORT,'deletion-test'); END;");
  try {
    assert.equal((await mutation("excluir-conta", payload(), admin.cookie)).status, 500);
    assert.deepEqual(counts(), initial);
    assert.ok(auth.sessionUser(client.cookie.split("=")[1]));
    assert.equal((await call(core.getAssessment, {}, client.cookie, { id: owned.id })).status, 200);
  } finally { db.exec("DROP TRIGGER deletion_failure"); }
});

test("exclusão: remove dados e sessões da conta, preservando outros proprietários e registros operacionais", async () => {
  const emails = db.prepare("SELECT COUNT(*) AS n FROM email_events WHERE recipient=?").get(client.email).n;
  assert.equal((await mutation("excluir-conta", { ...payload(), confirmationEmail: `  ${client.email.toUpperCase()}  ` }, admin.cookie)).status, 200);
  for (const table of ["users", "user_sessions", "password_resets", "verified_emails", "user_access", "assessment_owners", "client_requests", "request_reads", "client_services"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "users" ? "id" : "user_id"}=?`).get(client.id).n, 0, table);
  }
  for (const table of ["assessments", "evidences", "action_progress"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "assessments" ? "id" : "assessment_id"}=?`).get(owned.id).n, 0, table);
  assert.equal(auth.sessionUser(client.cookie.split("=")[1]), null);
  assert.equal((await mutation("solicitacao", { subject: "Ajuda", message: "Sessão antiga" }, client.cookie)).status, 401);
  assert.equal((await call(auth.login, { email: client.email, password: "frase longa para teste" })).status, 401);
  assert.equal((await call(core.getAssessment, {}, client.cookie, { id: owned.id })).status, 404);
  assert.equal((await call(core.getAssessment, {}, member.cookie, { id: retained.id })).status, 200);
  assert.ok(db.prepare("SELECT id FROM assessments WHERE id=?").get(anonymous.id));
  const publicRequest = new Request("http://localhost/api/test", { headers: { Authorization: `Bearer ${anonymous.token}` } });
  assert.equal((await core.handled(core.getAssessment)(publicRequest, { params: Promise.resolve({ id: anonymous.id }) })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_events WHERE recipient=?").get(client.email).n, emails);
  assert.equal((await mutation("excluir-conta", payload(), admin.cookie)).status, 404);
  assert.ok(auth.sessionUser(admin.cookie.split("=")[1]));
  assert.ok(auth.sessionUser(member.cookie.split("=")[1]));
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("exclusão: permite remover outro administrador e mantém o último administrador ativo", async () => {
  assert.equal((await mutation("excluir-conta", { userId: otherAdmin.id, confirmationEmail: otherAdmin.email }, admin.cookie)).status, 200);
  assert.equal(auth.sessionUser(otherAdmin.cookie.split("=")[1]), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_access WHERE role='admin'").get().n, 1);
  assert.equal((await mutation("excluir-conta", { userId: admin.id, confirmationEmail: admin.email }, admin.cookie)).status, 400);
  assert.equal(auth.sessionUser(admin.cookie.split("=")[1]).role, "admin");
});
