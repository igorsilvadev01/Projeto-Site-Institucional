import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import nodemailer from "nodemailer";

// Sem conexão externa e sem acessar os dados reais do site.
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "CONTACT_EMAIL", "PORTFOLIO_TRUST_PROXY"]) delete process.env[key];
process.env.NODE_ENV = "development";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-smtp-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const core = await import("../lib/server/core.js");
const input = { name: "João Gonçalves", email: "visitante@example.invalid", company: "Consultoria em proteção de dados", phone: "11999999999", interest: "privacidade", message: "Gostaria de uma avaliação técnica, com informações sobre segurança, adequação e privacidade.", consent: true, website: "", to: "intruso@example.invalid" };
let requestNumber = 0;
const contact = () => core.handled(core.contact)(new Request("http://localhost/api/contato", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(input),
}), { clientIp: `192.0.2.${++requestNumber}` });
function configure() {
  Object.assign(process.env, {
    SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_SECURE: "false",
    SMTP_USER: "remetente@example.invalid", SMTP_PASS: "abcd efgh ijkl mnop",
    MAIL_FROM: "Plataforma de Privacidade <remetente@example.invalid>", CONTACT_EMAIL: "responsavel@example.invalid",
  });
}
after(() => {
  const key = Symbol.for("privacy-platform.sqlite");
  globalThis[key]?.close(); delete globalThis[key];
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("portfolio-smtp-test-")) rmSync(directory, { recursive: true, force: true });
});

test("SMTP autenticado exige senha; configuração incompleta não abre conexão", async context => {
  configure(); process.env.SMTP_PASS = "";
  assert.equal(core.smtpReady(), false);
  context.mock.method(nodemailer, "createTransport", options => {
    assert.equal(options.streamTransport, true);
    return { sendMail: async () => ({ message: Buffer.from("Mensagem local") }) };
  });
  const response = await contact();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).emailDelivered, false);
  const log = core.db().prepare("SELECT * FROM email_events ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(log.status, "local");
  assert.equal(log.category, "contato");
  assert.ok(log.completed_at >= log.created_at);
});

test("contato envia todos os dados ao destinatário do servidor e permite responder ao visitante", async context => {
  configure();
  const mimeTransport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  let message, raw;
  context.mock.method(nodemailer, "createTransport", options => {
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.auth, { user: process.env.SMTP_USER, pass: "abcdefghijklmnop" });
    return { sendMail: async value => {
      message = value;
      raw = (await mimeTransport.sendMail(value)).message.toString("utf8");
      return { accepted: [value.to], messageId: "<teste@example.invalid>", response: "250 OK accepted" };
    } };
  });
  const response = await contact();
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.emailDelivered, true);
  assert.equal(message.to, process.env.CONTACT_EMAIL);
  assert.equal(message.from, process.env.MAIL_FROM);
  assert.equal(message.replyTo, input.email);
  assert.ok(message.subject.includes(result.reference));
  for (const value of [input.name, input.email, input.company, input.phone, input.message, result.reference]) assert.ok(message.text.includes(value));
  // Verifica os bytes do e-mail, além do texto passado ao Nodemailer.
  assert.match(raw, /Content-Type: text\/plain; charset=utf-8/i);
  const split = raw.search(/\r?\n\r?\n/);
  const headers = raw.slice(0, split), encodedBody = raw.slice(split).trim();
  const decodedBody = /Content-Transfer-Encoding: base64/i.test(headers)
    ? Buffer.from(encodedBody.replace(/\s/g, ""), "base64").toString("utf8")
    : Buffer.from(encodedBody.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8");
  for (const value of [input.name, input.company, input.message, "Adequação à LGPD", "Ticket"]) assert.ok(decodedBody.includes(value));
  assert.equal(JSON.parse(core.db().prepare("SELECT payload FROM contact_requests WHERE reference=?").get(result.reference).payload).name, input.name);
  assert.equal(core.db().prepare("SELECT email_delivered FROM contact_requests WHERE reference=?").get(result.reference).email_delivered, 1);
  const log = core.db().prepare("SELECT * FROM email_events WHERE subject=?").get(message.subject);
  assert.equal(log.status, "accepted");
  assert.equal(log.recipient, process.env.CONTACT_EMAIL);
  assert.equal(log.message_id, "<teste@example.invalid>");
  assert.equal(log.smtp_code, 250);
  assert.ok(log.completed_at >= log.created_at);
  assert.equal(JSON.stringify(log).includes(input.message), false);
  assert.equal(JSON.stringify(log).includes(process.env.SMTP_PASS), false);
});

test("falha SMTP preserva os dados e não marca a notificação como entregue", async context => {
  configure();
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { throw Object.assign(new Error("Secret password 123456 and raw SMTP response"), { code: "EAUTH", responseCode: 535 }); } }));
  const response = await contact();
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.emailDelivered, false);
  const stored = core.db().prepare("SELECT payload,email_delivered FROM contact_requests WHERE reference=?").get(result.reference);
  assert.equal(stored.email_delivered, 0);
  assert.equal(JSON.parse(stored.payload).message, input.message);
  const log = core.db().prepare("SELECT * FROM email_events WHERE subject LIKE ?").get(`%${result.reference}`);
  assert.equal(log.status, "failed");
  assert.equal(log.error_code, "EAUTH");
  assert.equal(log.smtp_code, 535);
  assert.match(log.error_message, /Autenticação recusada/);
  assert.equal(JSON.stringify(log).includes("123456"), false);
});

test("SMTP sem destinatários aceitos não informa entrega", async context => {
  configure();
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => ({ accepted: [] }) }));
  const response = await contact();
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.emailDelivered, false);
  assert.equal(core.db().prepare("SELECT email_delivered FROM contact_requests WHERE reference=?").get(result.reference).email_delivered, 0);
  assert.equal(core.db().prepare("SELECT error_code FROM email_events WHERE subject LIKE ?").get(`%${result.reference}`).error_code, "MailNotAccepted");
});

test("SMTP ausente em produção registra falha sem expor o conteúdo da mensagem", async () => {
  process.env.SMTP_HOST = "";
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(core.mail({ to: "destino@example.invalid", category: "cadastro", subject: "Código de cadastro", text: "Código privado: 654321" }), /MailNotConfigured/);
    const log = core.db().prepare("SELECT * FROM email_events WHERE recipient=?").get("destino@example.invalid");
    assert.equal(log.status, "failed");
    assert.equal(log.category, "cadastro");
    assert.equal(log.error_code, "MailNotConfigured");
    assert.equal(JSON.stringify(log).includes("654321"), false);
  } finally { process.env.NODE_ENV = "development"; }
});
