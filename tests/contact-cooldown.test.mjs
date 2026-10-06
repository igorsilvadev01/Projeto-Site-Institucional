import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { clientIdentity } from "../lib/server/client-ip.js";

for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "CONTACT_EMAIL", "PORTFOLIO_TRUST_PROXY"]) delete process.env[key];
process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-cooldown-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const core = await import("../lib/server/core.js");
const input = { name: "Teste de intervalo", email: "intervalo@example.invalid", company: "Teste", phone: "", interest: "privacidade", message: "Solicitação de teste do intervalo entre envios.", consent: true, website: "" };
const request = (data = input, headers = {}) => new Request("http://localhost/api/contato", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost", ...headers }, body: JSON.stringify(data),
});
const invoke = (ip, data = input, headers = {}) => core.handled(core.contact)(request(data, headers), { clientIp: ip });
const files = () => readdirSync(path.join(directory, "outbox")).filter(file => file.endsWith(".eml")).length;

after(() => {
  const key = Symbol.for("privacy-platform.sqlite");
  globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-cooldown-test-")) rmSync(directory, { recursive: true, force: true });
});

test("um envio por IP a cada 5 minutos; bloqueios não enviam e-mail nem prolongam o intervalo", async context => {
  const start = Date.now();
  let now = start;
  context.mock.method(Date, "now", () => now);
  assert.equal((await invoke("192.0.2.1")).status, 201);
  const initialFiles = files();
  const initialContacts = core.db().prepare("SELECT COUNT(*) AS total FROM contact_requests").get().total;
  now = start + 60_000;
  const blocked = await invoke("192.0.2.1");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "240");
  assert.equal(files(), initialFiles);
  assert.equal(core.db().prepare("SELECT COUNT(*) AS total FROM contact_requests").get().total, initialContacts);
  assert.equal((await invoke("192.0.2.2")).status, 201);
  now = start + 299_999;
  const almost = await invoke("192.0.2.1");
  assert.equal(almost.status, 429);
  assert.equal(almost.headers.get("Retry-After"), "1");
  now = start + 300_000;
  assert.equal((await invoke("192.0.2.1")).status, 201);
});

test("campos inválidos não consomem o intervalo de envio", async () => {
  assert.equal((await invoke("192.0.2.3", { ...input, consent: false })).status, 400);
  assert.equal((await invoke("192.0.2.3", { ...input, message: "curta" })).status, 400);
  assert.equal((await invoke("192.0.2.3")).status, 201);
});

test("solicitações simultâneas do mesmo IP geram apenas um contato e um e-mail", async () => {
  const initialFiles = files();
  const results = await Promise.all([invoke("192.0.2.4"), invoke("192.0.2.4"), invoke("192.0.2.4")]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 429, 429]);
  assert.equal(files(), initialFiles + 1);
});

test("o intervalo persiste ao reabrir o banco e ao mudar de e-mail", async () => {
  assert.equal((await invoke("192.0.2.5")).status, 201);
  const key = Symbol.for("privacy-platform.sqlite");
  globalThis[key].close(); delete globalThis[key];
  assert.equal((await invoke("192.0.2.5", { ...input, email: "outro@example.invalid" })).status, 429);
});

test("IP forjado nos cabeçalhos não contorna o intervalo", async () => {
  assert.equal((await invoke("192.0.2.6", input, { "X-Forwarded-For": "198.51.100.1" })).status, 201);
  assert.equal((await invoke("192.0.2.6", input, { "X-Forwarded-For": "198.51.100.2", "X-Real-IP": "198.51.100.3" })).status, 429);
});

test("IPv4 e formas equivalentes de IPv6 usam a mesma identificação", async () => {
  assert.equal(clientIdentity(request(), "::ffff:192.0.2.7"), "192.0.2.7");
  assert.equal(clientIdentity(request(), "::ffff:c000:207"), "192.0.2.7");
  assert.equal((await invoke("192.0.2.7")).status, 201);
  assert.equal((await invoke("::ffff:c000:207")).status, 429);
  assert.equal((await invoke("2001:0db8:0:0:0:0:0:1")).status, 201);
  assert.equal((await invoke("2001:db8::1")).status, 429);
});

test("proxy configurado identifica visitantes distintos e rejeita IP inválido", context => {
  const previous = process.env.PORTFOLIO_TRUST_PROXY;
  context.after(() => { if (previous === undefined) delete process.env.PORTFOLIO_TRUST_PROXY; else process.env.PORTFOLIO_TRUST_PROXY = previous; });
  process.env.PORTFOLIO_TRUST_PROXY = "true";
  assert.equal(clientIdentity(request(input, { "X-Forwarded-For": "198.51.100.1, 127.0.0.1" }), "127.0.0.1"), "198.51.100.1");
  assert.equal(clientIdentity(request(input, { "X-Forwarded-For": "198.51.100.2" }), "127.0.0.1"), "198.51.100.2");
  assert.equal(clientIdentity(request(input, { "X-Forwarded-For": "invalid" }), "127.0.0.1"), "127.0.0.1");
  process.env.NODE_ENV = "production";
  try {
    assert.equal(clientIdentity(request(input, { "X-Forwarded-For": "invalid" }), "192.0.2.100"), "local");
    assert.equal(clientIdentity(request(input, { "X-Forwarded-For": "198.51.100.1" }), "192.0.2.100"), "198.51.100.1");
  } finally { process.env.NODE_ENV = "development"; }
});
