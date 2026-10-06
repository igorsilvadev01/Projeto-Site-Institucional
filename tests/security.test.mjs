import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { generateSync } from "otplib";
import { registrationCode, localEmail } from "./email-helper.mjs";
import { assessmentQuestions } from "../lib/assessment.js";

for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "PORTFOLIO_TRUST_PROXY", "PORTFOLIO_REQUIRE_ADMIN_MFA"]) delete process.env[name];
process.env.NODE_ENV = "development"; process.env.SITE_URL = "http://localhost";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-security-"));
process.env.PORTFOLIO_DATA_DIR = directory;
process.env.PORTFOLIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const core = await import("../lib/server/core.js"), auth = await import("../lib/server/auth.js"), mfa = await import("../lib/server/mfa.js"), verification = await import("../lib/server/email-verification.js"), operator = await import("../lib/server/operator.js");
const request = (data = {}, cookie = "") => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookie }, body: JSON.stringify(data) });
const call = (handler, data, cookie) => core.handled(handler)(request(data, cookie));
const cookieOf = response => response.headers.getSetCookie().find(value => /^(portfolio_session|portfolio_mfa|portfolio_registration)=.+?;/.test(value)).split(";")[0];
const userOf = cookie => auth.sessionUser(cookie.split("=")[1]);
const limits = () => core.db().exec("DELETE FROM rate_limits");
const password = "frase de senha segura para teste";
let admin, cookie, secret, codes;
after(() => {
  const key = Symbol.for("privacy-platform.sqlite"); globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-security-")) rmSync(directory, { recursive: true, force: true });
});

test("duas etapas: ativação exige senha, perfil admin e a mesma sessão; segredo fica criptografado", async () => {
  const pending = await call(auth.register, { name: "Admin Teste", email: "security@example.invalid", password, terms: true });
  const registered = await call(auth.confirmRegistration, { code: registrationCode(directory, "security@example.invalid") }, cookieOf(pending));
  cookie = cookieOf(registered); admin = userOf(cookie);
  assert.equal((await call(mfa.mfaSetup, { password }, cookie)).status, 403);
  operator.setAccountRole(admin.email, "admin");
  assert.equal(userOf(cookie), null);
  cookie = cookieOf(await call(auth.login, { email: admin.email, password }, cookie));
  assert.equal((await call(mfa.mfaSetup, { password: "errada" }, cookie)).status, 400);
  const setup = await call(mfa.mfaSetup, { password }, cookie);
  assert.equal(setup.status, 200); assert.equal(setup.headers.get("cache-control"), "no-store");
  const data = await setup.json(); secret = data.secret; assert.match(data.qr, /^data:image\/png;base64,/);
  assert.notEqual(core.db().prepare("SELECT secret_enc FROM mfa_enrollments").get().secret_enc, secret);
  const staleCookie = cookie;
  cookie = cookieOf(await call(auth.login, { email: admin.email, password }, cookie));
  assert.equal((await call(mfa.mfaActivate, { code: generateSync({ secret }) }, cookie)).status, 400);
  assert.equal((await call(mfa.mfaActivate, { code: generateSync({ secret }) }, staleCookie)).status, 401);
  const renewed = await call(mfa.mfaSetup, { password }, cookie); secret = (await renewed.json()).secret;
  const response = await call(mfa.mfaActivate, { code: generateSync({ secret }) }, cookie);
  assert.equal(response.status, 200); codes = (await response.json()).recoveryCodes;
  assert.equal(codes.length, 8); assert.equal(userOf(cookie).mfaEnabled, 1); assert.ok(userOf(cookie).mfaVerifiedAt);
  assert.equal(core.db().prepare("SELECT COUNT(*) AS n FROM mfa_enrollments").get().n, 0);
  assert.ok(!JSON.stringify(core.db().prepare("SELECT * FROM mfa_recovery_codes").all()).includes(codes[0]));
  assert.equal(core.db().prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='mfa.activated'").get().n, 1);
  assert.equal((await call(mfa.mfaSetup, { password }, cookie)).status, 409);
});

test("duas etapas: senha sozinha não autentica; TOTP e códigos de recuperação têm uso único", async context => {
  limits(); const now = Date.now(); context.mock.method(Date, "now", () => now + 60_000);
  let login = await call(auth.login, { email: admin.email, password }, cookie);
  assert.equal(login.status, 202); assert.equal(userOf(cookie), null);
  let challenge = cookieOf(login), token = generateSync({ secret, epoch: Math.floor((now + 60_000) / 1000) });
  assert.throws(() => auth.requireUser(request({}, challenge)), /sessão expirou/);
  const results = await Promise.all([call(mfa.mfaLogin, { code: token }, challenge), call(mfa.mfaLogin, { code: token }, challenge)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  cookie = cookieOf(results.find(r => r.status === 200));
  process.env.PORTFOLIO_REQUIRE_ADMIN_MFA = "true";
  assert.doesNotThrow(() => auth.requireAdmin(userOf(cookie)));
  login = await call(auth.login, { email: admin.email, password }); challenge = cookieOf(login);
  assert.equal((await call(mfa.mfaLogin, { code: token }, challenge)).status, 400);
  const recovered = await call(mfa.mfaLogin, { code: codes[0] }, challenge);
  assert.equal(recovered.status, 200); cookie = cookieOf(recovered);
  const another = cookieOf(await call(auth.login, { email: admin.email, password }));
  assert.equal((await call(mfa.mfaLogin, { code: codes[0] }, another)).status, 400);
  assert.equal(core.db().prepare("SELECT COUNT(*) AS n FROM mfa_recovery_codes").get().n, 7);
  assert.throws(() => auth.requireAdmin({ ...userOf(cookie), mfaVerifiedAt: 0 }), /duas etapas/);
  delete process.env.PORTFOLIO_REQUIRE_ADMIN_MFA;
});

test("duas etapas: limite de cinco tentativas, expiração e redefinição auditada pelo operador", async () => {
  limits();
  const challenge = cookieOf(await call(auth.login, { email: admin.email, password }));
  for (let i = 0; i < 5; i++) assert.equal((await call(mfa.mfaLogin, { code: "invalido" }, challenge)).status, 400);
  assert.equal((await call(mfa.mfaLogin, { code: codes[1] }, challenge)).status, 401);
  const expired = cookieOf(await call(auth.login, { email: admin.email, password }));
  core.db().prepare("UPDATE mfa_challenges SET expires_at=0").run();
  assert.equal((await call(mfa.mfaLogin, { code: codes[1] }, expired)).status, 401);
  assert.throws(() => operator.setAccountRole(admin.email, "usuario"), /LastAdmin/);
  operator.resetAccountMfa(admin.email);
  assert.equal(userOf(cookie), null); assert.equal(core.db().prepare("SELECT COUNT(*) AS n FROM user_mfa").get().n, 0);
  assert.equal(core.db().prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='mfa.reset_by_operator'").get().n, 1);
  cookie = cookieOf(await call(auth.login, { email: admin.email, password }));
  process.env.NODE_ENV = "production";
  try { assert.throws(() => auth.requireAdmin(userOf(cookie)), /duas etapas/); }
  finally { process.env.NODE_ENV = "development"; }
});

test("email alterado: confirmação é obrigatória em produção, com expiração, limite e uso único", async () => {
  limits();
  const store = core.db(); store.prepare("DELETE FROM verified_emails WHERE user_id=?").run(admin.id);
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => auth.requireUser(request({}, cookie)), /Confirme seu email/);
    assert.ok(auth.requireUser(request({}, cookie), { allowUnverified: true }));
    const result = await call(core.createAssessment, { company: "Empresa", name: "Responsável", email: admin.email, sector: "Tecnologia", consent: true, answers: Object.fromEntries(assessmentQuestions.map(item => [item.id, "no"])) }, cookie);
    assert.equal(result.status, 403);
  }
  finally { process.env.NODE_ENV = "development"; }
  assert.equal((await call(verification.sendEmailVerification, {}, cookie)).status, 200);
  assert.equal((await call(verification.sendEmailVerification, {}, cookie)).status, 429);
  let code = localEmail(directory, admin.email, /confirma[^\r\n]*: (\d{6})/)[1];
  const bad = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await call(verification.confirmEmailVerification, { code: bad }, cookie)).status, 400);
  assert.equal((await call(verification.confirmEmailVerification, { code }, cookie)).status, 400);
  store.prepare("UPDATE email_verifications SET expires_at=0,last_sent_at=0").run();
  assert.equal((await call(verification.sendEmailVerification, {}, cookie)).status, 200);
  code = localEmail(directory, admin.email, /confirma[^\r\n]*: (\d{6})/)[1];
  const results = await Promise.all([call(verification.confirmEmailVerification, { code }, cookie), call(verification.confirmEmailVerification, { code }, cookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); assert.equal(userOf(cookie).emailVerified, 1);
});
