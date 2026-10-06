import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { createSmtpTransport, smtpReady } from "./smtp.js";
import { clientIdentity } from "./client-ip.js";
export { smtpReady } from "./smtp.js";
import { assessmentQuestions, calculateAssessment } from "../assessment.js";
import { interests } from "../site.js";

// Dados de operação são externos ao bundle e precisam de um volume persistente.
const dataDir = () => path.resolve(/* turbopackIgnore: true */ process.env.PORTFOLIO_DATA_DIR || path.join(process.cwd(), ".data"));
export function db() {
  const key = Symbol.for("privacy-platform.sqlite");
  if (globalThis[key]) return globalThis[key];
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(path.join(dataDir(), "portfolio.sqlite"));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS contact_requests(reference TEXT PRIMARY KEY,email TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,email_delivered INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS subscribers(email TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,confirm_hash TEXT,confirm_expires_at INTEGER,cancel_hash TEXT UNIQUE,consent_at INTEGER NOT NULL,subscribed_at INTEGER,unsubscribed_at INTEGER,last_confirmation_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY,company TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,sector TEXT NOT NULL,answers TEXT NOT NULL,report TEXT NOT NULL,token_hash TEXT NOT NULL,created_at INTEGER NOT NULL,consent_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS evidences(id TEXT PRIMARY KEY,assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,category TEXT NOT NULL,content BLOB NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS evidence_assessment ON evidences(assessment_id);
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS email_events(
      id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,completed_at INTEGER,recipient TEXT NOT NULL,
      subject TEXT NOT NULL,category TEXT NOT NULL,status TEXT NOT NULL,
      message_id TEXT,smtp_code INTEGER,error_code TEXT,error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS email_events_created ON email_events(created_at DESC);
    CREATE TABLE IF NOT EXISTS assessment_owners(assessment_id TEXT PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,user_id TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS owned_assessments_user ON assessment_owners(user_id);`);
  globalThis[key] = database;
  return database;
}

class HttpError extends Error {
  constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; }
}
export const reject = (status, message, headers = {}) => { throw new HttpError(status, message, headers); };
export const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
export const handled = (handler) => async (...args) => {
  try { return await handler(...args); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, error.headers);
    console.error("Falha interna da API Plataforma de Privacidade:", error?.name || "UnknownError");
    return json({ error: "Não foi possível concluir a operação. Tente novamente em instantes." }, 500);
  }
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
function tokenMatches(value, stored) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value) || typeof stored !== "string") return false;
  const a = Buffer.from(hash(value), "hex"), b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function field(value, label, max = 200, required = true, multiline = false) {
  if (value == null) value = "";
  if (typeof value !== "string") reject(400, `${label}: informe um texto válido.`);
  const result = value.trim();
  if (required && !result) reject(400, `${label}: preencha este campo.`);
  if (result.length > max || (multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/).test(result)) reject(400, `${label}: conteúdo inválido ou muito longo.`);
  return result;
}
export function email(value) {
  const result = field(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) || /[<>(),;:\\"\[\]]/.test(result)) reject(400, "Informe um e-mail válido.");
  return result;
}
function consent(input) {
  if (input.consent !== true) reject(400, "Confirme a autorização para o tratamento dos dados deste formulário.");
  if (input.website !== undefined && input.website !== "") reject(400, "Não foi possível validar o formulário.");
}
export function guard(request, action, maximum = 20, windowMs = 60_000, remoteAddress) {
  const origin = request.headers.get("origin"), allowed = new Set(process.env.NODE_ENV === "production" ? [] : [new URL(request.url).origin]);
  if (process.env.SITE_URL) { try { allowed.add(new URL(process.env.SITE_URL).origin); } catch {} }
  if (process.env.NODE_ENV === "production" && !["GET", "HEAD"].includes(request.method) && !origin) reject(403, "Origem da solicitação não permitida.");
  // Next may represent a loopback request as localhost even when the browser
  // opened 127.0.0.1. Only equate loopback hosts in development; retain ports
  // and protocols, and never trust arbitrary Host/forwarded headers here.
  if (process.env.NODE_ENV === "development") {
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    for (const value of [...allowed]) {
      const url = new URL(value);
      if (loopback.includes(url.hostname)) {
        for (const hostname of loopback) {
          const alias = new URL(url);
          alias.hostname = hostname;
          allowed.add(alias.origin);
        }
      }
    }
  }
  if ((origin && !allowed.has(origin)) || (!origin && request.headers.get("sec-fetch-site") === "cross-site")) reject(403, "Origem da solicitação não permitida.");
  const identity = clientIdentity(request, remoteAddress);
  if (process.env.NODE_ENV === "production" && process.env.PORTFOLIO_TRUST_PROXY === "true" && identity === "local") reject(503, "Não foi possível identificar a conexão. Verifique o proxy do servidor.");
  const now = Date.now(), key = hash(`${action}:${identity}`), database = db();
  const row = database.prepare(`INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_start<=? THEN 1 ELSE rate_limits.count+1 END,
    window_start=CASE WHEN rate_limits.window_start<=? THEN excluded.window_start ELSE rate_limits.window_start END RETURNING count,window_start`).get(key, now, now - windowMs, now - windowMs);
  database.prepare("DELETE FROM rate_limits WHERE window_start<?").run(now - 86_400_000);
  if (row.count > maximum) throw new HttpError(429, "Muitas tentativas. Aguarde um pouco antes de tentar novamente.", { "Retry-After": String(Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000))) });
}
async function bytes(request, max) {
  if (Number(request.headers.get("content-length")) > max) reject(413, "O conteúdo enviado excede o tamanho permitido.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); reject(413, "O conteúdo enviado excede o tamanho permitido."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
export async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) reject(415, "Envie os dados no formato JSON.");
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bytes(request, 32 * 1024))); }
  catch (error) { if (error instanceof HttpError) throw error; reject(400, "Os dados enviados são inválidos."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(400, "Os dados enviados são inválidos.");
  return value;
}

export async function mail({ to, subject, text, replyTo, category = "outro" }) {
  const database = db(), id = randomUUID();
  database.prepare("INSERT INTO email_events(id,created_at,recipient,subject,category,status) VALUES(?,?,?,?,?,'sending')")
    .run(id, Date.now(), to, subject, category);
  const from = process.env.MAIL_FROM || "Plataforma de Privacidade <nao-responda@localhost>";
  try {
    if (smtpReady()) {
      const transport = createSmtpTransport();
      const sent = await transport.sendMail({ from, to, subject, text, replyTo });
      if (!sent.accepted?.length) throw new Error("MailNotAccepted");
      database.prepare("UPDATE email_events SET status='accepted',completed_at=?,message_id=?,smtp_code=? WHERE id=?")
        .run(Date.now(), sent.messageId || null, /^250\b/.test(sent.response || "") ? 250 : null, id);
      return true;
    }
    if (process.env.NODE_ENV === "production") throw new Error("MailNotConfigured");
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const sent = await transport.sendMail({ from, to, subject, text, replyTo });
    const directory = path.join(dataDir(), "outbox");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.eml`), sent.message, { flag: "wx", mode: 0o600 });
    database.prepare("UPDATE email_events SET status='local',completed_at=?,message_id=? WHERE id=?").run(Date.now(), sent.messageId || null, id);
    return false;
  } catch (error) {
    // Apenas diagnósticos conhecidos: respostas brutas podem conter dados sensíveis.
    const explanations = {
      EAUTH: "Autenticação recusada pelo servidor SMTP.",
      ESOCKET: "Falha na conexão segura com o servidor SMTP.",
      ECONNECTION: "Não foi possível conectar ao servidor SMTP.",
      ETIMEDOUT: "O servidor SMTP excedeu o tempo de resposta.",
      EDNS: "Não foi possível localizar o servidor SMTP.",
      EENVELOPE: "O remetente ou destinatário foi recusado pelo SMTP.",
      EMESSAGE: "Não foi possível preparar a mensagem.",
      MailNotConfigured: "O SMTP não está configurado para envio em produção.",
      MailNotAccepted: "O SMTP não aceitou nenhum destinatário.",
    };
    const code = Object.hasOwn(explanations, error.code) ? error.code : Object.hasOwn(explanations, error.message) ? error.message : "UNKNOWN";
    database.prepare("UPDATE email_events SET status='failed',completed_at=?,smtp_code=?,error_code=?,error_message=? WHERE id=?")
      .run(Date.now(), Number.isInteger(error.responseCode) && error.responseCode >= 100 && error.responseCode <= 599 ? error.responseCode : null,
        code, explanations[code] || "Falha no envio. Verifique a configuração SMTP e a disponibilidade do servidor.", id);
    throw error;
  }
}

export async function contact(request, { clientIp } = {}) {
  guard(request, "contact", 20, 60_000, clientIp);
  const input = await body(request); consent(input);
  const value = { name: field(input.name, "Nome", 120), email: email(input.email), company: field(input.company, "Empresa", 180, false), phone: field(input.phone, "Telefone", 40, false), interest: field(input.interest, "Interesse", 120), message: field(input.message, "Mensagem", 5000, true, true), consent: true };
  if (value.name.length < 2 || value.message.length < 10) reject(400, "Informe seu nome e uma mensagem com pelo menos 10 caracteres.");
  if (!interests.some(([key]) => key === value.interest)) reject(400, "Selecione um assunto válido.");
  if (value.phone && !/^[+\d\s().-]{7,40}$/.test(value.phone)) reject(400, "Informe um telefone válido.");
  const reference = `PORTFOLIO-${randomBytes(8).toString("hex").toUpperCase()}`, createdAt = Date.now();
  const database = db(), cooldownMs = 5 * 60_000;
  const cooldownKey = hash(`contact-cooldown:${clientIdentity(request, clientIp)}`);
  const { deliveryDatabase, enqueueContact, deliverContact } = await import("./contact-delivery.js");
  deliveryDatabase();
  // Reserva o intervalo e registra o contato na mesma transação, antes do SMTP.
  database.exec("BEGIN IMMEDIATE");
  try {
    const reserved = database.prepare(`INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
      ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1
      WHERE rate_limits.window_start<=? RETURNING window_start`).get(cooldownKey, createdAt, createdAt - cooldownMs);
    if (!reserved) {
      const previous = database.prepare("SELECT window_start FROM rate_limits WHERE key=?").get(cooldownKey);
      const remaining = Math.max(1, Math.ceil((previous.window_start + cooldownMs - createdAt) / 1000));
      throw new HttpError(429, "Você já enviou uma solicitação. Aguarde o intervalo de 5 minutos antes de enviar outra.", { "Retry-After": String(remaining) });
    }
    database.prepare("INSERT INTO contact_requests(reference,email,payload,created_at) VALUES(?,?,?,?)").run(reference, value.email, JSON.stringify(value), createdAt);
    enqueueContact(database, reference);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  const emailDelivered = await deliverContact(reference);
  return json({ reference, emailDelivered, cooldownSeconds: cooldownMs / 1000, message: "Solicitação registrada. Guarde sua referência." }, 201);
}

function subscriptionMessage() {
  return !smtpReady() && process.env.NODE_ENV !== "production"
    ? "Solicitação registrada em modo local. A confirmação fica disponível na caixa de testes do responsável pelo site; nenhum e-mail externo foi enviado."
    : "Se o endereço informado puder receber a confirmação, enviaremos as instruções. Verifique também a pasta de spam.";
}
export async function subscribe(request) {
  guard(request, "newsletter", 5, 3_600_000);
  const input = await body(request); consent(input);
  const address = email(input.email), name = field(input.name, "Nome", 120, false);
  if (process.env.NODE_ENV === "production" && (!smtpReady() || !process.env.SITE_URL)) reject(503, "A confirmação por e-mail está temporariamente indisponível. Tente novamente mais tarde.");
  const database = db(), now = Date.now(), existing = database.prepare("SELECT status,last_confirmation_at FROM subscribers WHERE email=?").get(address);
  if (existing?.status === "subscribed" || (existing?.status === "pending" && now - existing.last_confirmation_at < 600_000)) return json({ message: subscriptionMessage() }, 202);
  const confirmation = token(), cancellation = token(), confirmationHash = hash(confirmation);
  let base;
  try {
    base = new URL(process.env.SITE_URL || request.url).origin;
    if (!/^https?:\/\//.test(base)) throw new Error();
  } catch { reject(503, "A confirmação por e-mail está temporariamente indisponível."); }
  database.prepare(`INSERT INTO subscribers(email,name,status,confirm_hash,confirm_expires_at,cancel_hash,consent_at,last_confirmation_at) VALUES(?,?,'pending',?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,status='pending',confirm_hash=excluded.confirm_hash,confirm_expires_at=excluded.confirm_expires_at,cancel_hash=excluded.cancel_hash,consent_at=excluded.consent_at,last_confirmation_at=excluded.last_confirmation_at,subscribed_at=NULL,unsubscribed_at=NULL`).run(address, name, confirmationHash, now + 86_400_000, hash(cancellation), now, now);
  try {
    await mail({ category: "newsletter", to: address, subject: "Confirme sua inscrição na newsletter Plataforma de Privacidade", text: `Olá${name ? " " + name : ""}!\n\nVocê solicitou receber a newsletter da Plataforma de Privacidade. Confirme sua inscrição abrindo o endereço abaixo e clicando no botão de confirmação:\n${base}/newsletter/confirmar?token=${confirmation}\n\nO link expira em 24 horas. Abrir a página, por si só, não confirma a inscrição. Se você não fez esta solicitação, ignore esta mensagem.\n\nPara cancelar esta solicitação ou sua inscrição:\n${base}/newsletter/cancelar?token=${cancellation}\n\nPlataforma de Privacidade — Privacidade: ${base}/politica-de-privacidade` });
  } catch {
    database.prepare("UPDATE subscribers SET last_confirmation_at=0 WHERE email=? AND confirm_hash=?").run(address, confirmationHash);
    reject(503, "Não foi possível enviar a confirmação. Tente novamente mais tarde.");
  }
  return json({ message: subscriptionMessage() }, 202);
}
function validToken(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) reject(400, "Link inválido. Verifique o endereço recebido por e-mail.");
  return value;
}
export async function confirmSubscription(request) {
  guard(request, "newsletter-confirm");
  const value = validToken((await body(request)).token), database = db(), now = Date.now();
  const row = database.prepare("SELECT email,status,confirm_hash,confirm_expires_at FROM subscribers WHERE confirm_hash=?").get(hash(value));
  if (!row || row.status !== "pending" || row.confirm_expires_at < now || !tokenMatches(value, row.confirm_hash)) reject(410, "Este link expirou ou já foi utilizado. Solicite uma nova inscrição.");
  const updated = database.prepare("UPDATE subscribers SET status='subscribed',subscribed_at=?,confirm_hash=NULL,confirm_expires_at=NULL WHERE email=? AND status='pending' AND confirm_hash=? AND confirm_expires_at>=?").run(now, row.email, hash(value), now);
  if (!updated.changes) reject(410, "Este link expirou, já foi utilizado ou a solicitação foi cancelada.");
  return json({ message: "Inscrição confirmada. Você poderá cancelar a qualquer momento pelo link recebido por e-mail." });
}
export async function cancelSubscription(request) {
  guard(request, "newsletter-cancel");
  const value = validToken((await body(request)).token), database = db();
  const row = database.prepare("SELECT email,cancel_hash FROM subscribers WHERE cancel_hash=?").get(hash(value));
  if (!row || !tokenMatches(value, row.cancel_hash)) reject(410, "Este link de cancelamento não é válido. Use o link mais recente recebido por e-mail.");
  const updated = database.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,confirm_hash=NULL,confirm_expires_at=NULL WHERE email=? AND cancel_hash=?").run(Date.now(), row.email, hash(value));
  if (!updated.changes) reject(410, "Este link foi substituído por uma nova solicitação. Use o link mais recente.");
  return json({ message: "Inscrição cancelada. Este endereço não receberá novas newsletters." });
}

export async function createAssessment(request) {
  guard(request, "assessment-create", 20, 3_600_000);
  const input = await body(request); consent(input);
  const company = field(input.company, "Empresa", 180), name = field(input.name, "Nome", 120), address = email(input.email), sector = field(input.sector, "Setor", 120, false);
  let calculated;
  try { calculated = calculateAssessment(input.answers); } catch (error) { reject(400, error.message); }
  if (Object.keys(input.answers).some(key => !assessmentQuestions.some(question => question.id === key))) reject(400, "A avaliação contém respostas desconhecidas.");
  const answers = Object.fromEntries(assessmentQuestions.map(question => [question.id, input.answers[question.id]]));
  const id = randomUUID(), access = token(), now = Date.now();
  const { sessionUser, requestToken, requireUser } = await import("./auth.js");
  const user = sessionUser(requestToken(request)), database = db();
  if (user) requireUser(request);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO assessments(id,company,name,email,sector,answers,report,token_hash,created_at,consent_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, company, name, address, sector, JSON.stringify(answers), JSON.stringify(calculated), hash(access), now, now);
    if (user) database.prepare("INSERT INTO assessment_owners(assessment_id,user_id) VALUES(?,?)").run(id, user.id);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return json({ id, token: user ? undefined : access }, 201);
}
async function authorizedAssessment(request, id) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) reject(404, "Avaliação não encontrada.");
  const row = db().prepare("SELECT * FROM assessments WHERE id=?").get(id);
  const authorization = request.headers.get("authorization") || "", access = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const owner = db().prepare("SELECT user_id FROM assessment_owners WHERE assessment_id=?").get(id);
  const { sessionUser, requestToken, requireUser } = await import("./auth.js");
  const user = owner ? sessionUser(requestToken(request)) : null;
  if (user) requireUser(request);
  if (!row || (owner ? user?.id !== owner.user_id : !tokenMatches(access, row.token_hash))) reject(404, "Avaliação não encontrada ou acesso não autorizado.");
  return row;
}
export async function getAssessment(request, { params }) {
  guard(request, "assessment-read", 120);
  const { id } = await params, row = await authorizedAssessment(request, id);
  const evidences = db().prepare("SELECT id,name,size,category,created_at FROM evidences WHERE assessment_id=? ORDER BY created_at DESC").all(id).map(item => ({ id: item.id, name: item.name, size: item.size, category: item.category, createdAt: new Date(item.created_at).toISOString() }));
  return json({ id: row.id, company: row.company, name: row.name, sector: row.sector, createdAt: new Date(row.created_at).toISOString(), answers: JSON.parse(row.answers), ...JSON.parse(row.report), evidences });
}
export async function uploadEvidence(request, { params }) {
  guard(request, "evidence-upload", 20, 600_000);
  const { id } = await params; await authorizedAssessment(request, id);
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data;/i.test(contentType)) reject(415, "Envie um arquivo pelo formulário de evidências.");
  let form;
  try { form = await new Response(await bytes(request, 5 * 1024 * 1024 + 32 * 1024), { headers: { "Content-Type": contentType } }).formData(); }
  catch (error) { if (error instanceof HttpError) throw error; reject(400, "O arquivo enviado é inválido."); }
  const file = form.get("file"), category = form.get("category");
  if (!["security", "privacy", "other"].includes(category)) reject(400, "Escolha uma categoria válida para a evidência.");
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) reject(400, "Selecione um arquivo não vazio.");
  if (file.size > 5 * 1024 * 1024) reject(413, "O arquivo deve ter no máximo 5 MB.");
  const content = Buffer.from(await file.arrayBuffer());
  let mime;
  if (content.length >= 5 && content.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) mime = "application/pdf";
  else if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = "image/png";
  else if (content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255) mime = "image/jpeg";
  else reject(400, "São aceitos somente arquivos PDF, PNG e JPEG válidos.");
  if (file.type && file.type !== mime) reject(400, "O tipo informado não corresponde ao conteúdo do arquivo.");
  const extensionPattern = mime === "application/pdf" ? /\.pdf$/i : mime === "image/png" ? /\.png$/i : /\.jpe?g$/i;
  if (!extensionPattern.test(file.name)) reject(400, "A extensão do arquivo não corresponde ao conteúdo enviado.");
  const name = String(file.name || "evidencia").replace(/[\u0000-\u001F\u007F-\u009F/\\]/g, "_").trim().slice(0, 180) || "evidencia";
  const evidenceId = randomUUID(), now = Date.now(), database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    if (database.prepare("SELECT COUNT(*) AS total FROM evidences WHERE assessment_id=?").get(id).total >= 5) reject(409, "Esta avaliação já possui 5 evidências. Remova uma antes de adicionar outra.");
    database.prepare("INSERT INTO evidences(id,assessment_id,name,mime,size,category,content,created_at) VALUES(?,?,?,?,?,?,?,?)").run(evidenceId, id, name, mime, content.length, category, content, now);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return json({ id: evidenceId, name, size: content.length, category, createdAt: new Date(now).toISOString() }, 201);
}
export async function downloadEvidence(request, { params }) {
  guard(request, "evidence-download", 120);
  const { id, evidenceId } = await params; await authorizedAssessment(request, id);
  const row = db().prepare("SELECT name,mime,content FROM evidences WHERE id=? AND assessment_id=?").get(evidenceId, id);
  if (!row) reject(404, "Evidência não encontrada.");
  const extension = row.mime === "application/pdf" ? "pdf" : row.mime === "image/png" ? "png" : "jpg";
  const encoded = encodeURIComponent(row.name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(row.content), { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename="evidencia.${extension}"; filename*=UTF-8''${encoded}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
export async function deleteEvidence(request, { params }) {
  guard(request, "evidence-delete");
  const { id, evidenceId } = await params; await authorizedAssessment(request, id);
  const result = db().prepare("DELETE FROM evidences WHERE id=? AND assessment_id=?").run(evidenceId, id);
  if (!result.changes) reject(404, "Evidência não encontrada.");
  return json({ message: "Evidência excluída." });
}
