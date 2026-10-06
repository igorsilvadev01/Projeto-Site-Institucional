import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { registrationCode, localEmail } from "./email-helper.mjs";
import nodemailer from "nodemailer";

for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "PORTFOLIO_TRUST_PROXY"]) delete process.env[key];
process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-auth-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const core = await import("../lib/server/core.js");
const api = await import("../lib/server/auth.js");
const input = { name: "Pessoa de teste", email: "auth@example.invalid", password: "uma senha longa para teste", terms: true };
function invoke(action, data = {}, cookie = "", origin = "http://localhost") {
  return core.handled(api[action])(new Request(`http://localhost/api/auth/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(data),
  }));
}
const cookieOf = response => response.headers.get("set-cookie").split(";")[0];
const userOf = cookie => api.sessionUser(cookie.split("=")[1]);
const clearLimits = () => core.db().exec("DELETE FROM rate_limits");

after(() => {
  const key = Symbol.for("privacy-platform.sqlite");
  globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-auth-test-")) rmSync(directory, { recursive: true, force: true });
});

test("cadastro, login, sessão, perfil e logout", async () => {
  assert.equal((await invoke("register", { ...input, terms: false })).status, 400);
  assert.equal((await invoke("register", { ...input, password: "curta" })).status, 400);
  assert.equal((await invoke("register", input, "", "https://evil.invalid")).status, 403);
  assert.equal((await invoke("register", input, "", "")).status, 403);
  const pending = await invoke("register", { ...input, email: "AUTH@example.invalid" });
  assert.equal(pending.status, 202);
  assert.equal(core.db().prepare("SELECT id FROM users WHERE email=?").get(input.email), undefined);
  assert.equal((await invoke("login", input)).status, 401);
  const response = await invoke("confirmRegistration", { code: registrationCode(directory, input.email) }, cookieOf(pending));
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = cookieOf(response), user = userOf(cookie);
  assert.equal(user.email, input.email);
  assert.equal(user.password_hash, undefined);
  const stored = core.db().prepare("SELECT * FROM users WHERE id=?").get(user.id);
  assert.notEqual(stored.password_hash, input.password);
  assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await invoke("register", input)).status, 409);
  assert.equal((await invoke("login", { ...input, password: "errada" })).status, 401);
  assert.equal((await invoke("profile", { name: "Novo nome" })).status, 401);
  assert.equal((await invoke("profile", { name: "Novo nome" }, cookie)).status, 200);
  assert.equal(userOf(cookie).name, "Novo nome");
  const login = await invoke("login", input, cookie);
  assert.equal(login.status, 200);
  assert.equal(userOf(cookie), null);
  const nextCookie = cookieOf(login);
  assert.ok(userOf(nextCookie));
  assert.equal((await invoke("logout", {}, nextCookie)).status, 200);
  assert.equal(userOf(nextCookie), null);
  assert.equal(api.sessionUser("forged"), null);
  const expired = cookieOf(await invoke("login", input));
  core.db().prepare("UPDATE user_sessions SET expires_at=0").run();
  assert.equal(userOf(expired), null);
});

test("recuperação, token de uso único e revogação de sessões", async () => {
  clearLimits();
  const cookie = cookieOf(await invoke("login", input));
  const known = await invoke("recover", { email: input.email });
  const unknown = await invoke("recover", { email: "unknown@example.invalid" });
  assert.deepEqual(await known.json(), await unknown.json());
  const token = localEmail(directory, input.email, /redefinir-senha#([\w-]{43})/)[1];
  const digest = createHash("sha256").update(token).digest("hex");
  assert.ok(core.db().prepare("SELECT * FROM password_resets WHERE token_hash=?").get(digest));
  const password = "nova senha longa para teste";
  const outcomes = await Promise.all([invoke("resetPassword", { token, password }), invoke("resetPassword", { token, password })]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 400]);
  assert.equal(userOf(cookie), null);
  assert.equal((await invoke("login", input)).status, 401);
  const renewed = await invoke("login", { ...input, password });
  assert.equal(renewed.status, 200);
  const renewedCookie = cookieOf(renewed);
  assert.equal((await invoke("changePassword", { currentPassword: "errada", password: input.password }, renewedCookie)).status, 400);
  assert.equal((await invoke("changePassword", { currentPassword: password, password: input.password }, renewedCookie)).status, 200);
  assert.equal(userOf(renewedCookie), null);
  assert.equal((await invoke("login", input)).status, 200);
  const expiredToken = "a".repeat(43);
  core.db().prepare("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,0)").run(createHash("sha256").update(expiredToken).digest("hex"), userOf(cookieOf(await invoke("login", input))).id);
  assert.equal((await invoke("resetPassword", { token: expiredToken, password })).status, 400);
});

test("limites de tentativas e cookie seguro em produção", async () => {
  clearLimits();
  for (let i = 0; i < 10; i++) assert.equal((await invoke("login", { ...input, password: "errada" })).status, 401);
  const limited = await invoke("login", input);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  clearLimits();
  process.env.NODE_ENV = "production";
  try {
    assert.match((await invoke("login", input)).headers.get("set-cookie"), /; Secure/);
    assert.equal((await invoke("recover", { email: input.email })).status, 503);
  } finally { process.env.NODE_ENV = "development"; }
});

test("origens locais equivalentes somente em desenvolvimento", async () => {
  clearLimits();
  for (const origin of ["http://localhost", "http://127.0.0.1", "http://[::1]"]) {
    assert.equal((await invoke("register", {}, "", origin)).status, 400);
  }
  for (const origin of ["http://127.0.0.1:3001", "https://127.0.0.1", "http://localhost.evil.invalid", "https://evil.invalid", "null", ""]) {
    assert.equal((await invoke("register", {}, "", origin)).status, 403);
  }
  process.env.NODE_ENV = "production";
  try {
    assert.equal((await invoke("register", {}, "", "http://127.0.0.1")).status, 403);
    assert.equal((await invoke("register", {}, "", "http://localhost")).status, 400);
  } finally { process.env.NODE_ENV = "development"; }
});

test("confirmação de cadastro: reenvio, expiração, tentativas e uso único", async () => {
  clearLimits();
  const address = "confirm@example.invalid";
  const pending = await invoke("register", { ...input, email: address });
  assert.equal(pending.status, 202);
  const cookie = cookieOf(pending), code = registrationCode(directory, address);
  assert.equal((await invoke("confirmRegistration", { code })).status, 400);
  assert.equal((await invoke("resendRegistration", {}, cookie)).status, 429);
  core.db().prepare("UPDATE pending_registrations SET last_sent_at=0 WHERE email=?").run(address);
  assert.equal((await invoke("resendRegistration", {}, cookie)).status, 200);
  assert.equal((await invoke("confirmRegistration", { code }, cookie)).status, 400);
  const latest = registrationCode(directory, address);
  assert.equal((await invoke("confirmRegistration", { code: latest }, cookie)).status, 201);
  assert.equal((await invoke("confirmRegistration", { code: latest }, cookie)).status, 400);
  assert.equal(core.db().prepare("SELECT COUNT(*) AS total FROM verified_emails v JOIN users u ON u.id=v.user_id WHERE u.email=?").get(address).total, 1);

  const expired = await invoke("register", { ...input, email: "expired@example.invalid" });
  const expiredCode = registrationCode(directory, "expired@example.invalid");
  core.db().prepare("UPDATE pending_registrations SET expires_at=0 WHERE email=?").run("expired@example.invalid");
  assert.equal((await invoke("confirmRegistration", { code: expiredCode }, cookieOf(expired))).status, 400);

  const locked = await invoke("register", { ...input, email: "locked@example.invalid" });
  const lockedCookie = cookieOf(locked), validCode = registrationCode(directory, "locked@example.invalid");
  const wrongCode = validCode === "000000" ? "111111" : "000000";
  for (let index = 0; index < 5; index++) assert.equal((await invoke("confirmRegistration", { code: wrongCode }, lockedCookie)).status, 400);
  assert.equal((await invoke("confirmRegistration", { code: validCode }, lockedCookie)).status, 400);
  assert.equal((await invoke("resendRegistration", {}, lockedCookie)).status, 400);
  assert.equal(core.db().prepare("SELECT id FROM users WHERE email='locked@example.invalid'").get(), undefined);

  process.env.NODE_ENV = "production";
  try {
    assert.equal((await invoke("register", { ...input, email: "production@example.invalid" })).status, 503);
    assert.equal(core.db().prepare("SELECT id FROM users WHERE email='production@example.invalid'").get(), undefined);
  } finally { process.env.NODE_ENV = "development"; }
});

test("falha no envio não cria conta nem mantém cadastro confirmável", async context => {
  clearLimits();
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { throw new Error("SMTPUnavailable"); } }));
  const address = "delivery-failed@example.invalid";
  assert.equal((await invoke("register", { ...input, email: address })).status, 503);
  assert.equal(core.db().prepare("SELECT id FROM users WHERE email=?").get(address), undefined);
  assert.equal(core.db().prepare("SELECT token_hash FROM pending_registrations WHERE email=?").get(address), undefined);
});
