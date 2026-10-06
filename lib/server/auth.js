import { randomBytes, randomUUID, randomInt, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, body, email, field, guard, json, reject, mail, smtpReady } from "./core.js";

const derive = promisify(scrypt);
const hash = value => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
export const SESSION_COOKIE = "portfolio_session";
const REGISTRATION_COOKIE = "portfolio_registration";
const sessionSeconds = 7 * 24 * 60 * 60;

export function authDatabase() {
  const store = db();
  store.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, terms_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON user_sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_access (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('usuario','cliente','admin'))
    );
    CREATE TABLE IF NOT EXISTS pending_registrations (
      token_hash TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,last_sent_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,terms_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verified_emails (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,verified_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_mfa(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secret_enc TEXT NOT NULL,enabled_at INTEGER NOT NULL,last_step INTEGER NOT NULL DEFAULT -1);
    CREATE TABLE IF NOT EXISTS mfa_enrollments(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,session_hash TEXT NOT NULL,secret_enc TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mfa_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,credential_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash));
    CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,target_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_events_date ON audit_events(created_at DESC);
    CREATE TABLE IF NOT EXISTS email_verifications(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,last_sent_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
  `);
  if (!store.prepare("PRAGMA table_info(user_sessions)").all().some(column => column.name === "mfa_verified_at")) store.exec("ALTER TABLE user_sessions ADD COLUMN mfa_verified_at INTEGER NOT NULL DEFAULT 0");
  return store;
}
const database = authDatabase;

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) reject(400, "Use uma senha entre 12 e 128 caracteres.");
  return value;
}

async function passwordHash(value) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString("hex")}`;
}

export async function passwordMatches(value, stored) {
  const [salt, digest] = stored.split(":");
  const key = await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, Buffer.from(digest, "hex"));
}

function cookie(value, maxAge = sessionSeconds, name = SESSION_COOKIE) {
  const secure = process.env.NODE_ENV === "production" || process.env.SITE_URL?.startsWith("https://");
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function requestToken(request, name = SESSION_COOKIE) {
  return request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function sessionUser(value) {
  if (typeof value !== "string" || !/^[\w-]{43}$/.test(value)) return null;
  return database().prepare(`SELECT u.id,u.name,u.email,u.created_at,COALESCE(a.role,'usuario') AS role,s.mfa_verified_at AS mfaVerifiedAt,CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS mfaEnabled,CASE WHEN v.user_id IS NULL THEN 0 ELSE 1 END AS emailVerified FROM users u
    LEFT JOIN user_access a ON a.user_id=u.id
    LEFT JOIN user_mfa m ON m.user_id=u.id
    LEFT JOIN verified_emails v ON v.user_id=u.id
    JOIN user_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(hash(value), Date.now()) || null;
}

export function requireUser(request, { allowUnverified = false } = {}) {
  const user = sessionUser(requestToken(request));
  if (!user) reject(401, "Sua sessão expirou. Entre novamente.");
  if (process.env.NODE_ENV === "production" && !allowUnverified && !user.emailVerified) reject(403, "Confirme seu email nas Configurações para continuar.");
  return user;
}

export const adminMfaRequired = () => process.env.NODE_ENV === "production" || process.env.PORTFOLIO_REQUIRE_ADMIN_MFA === "true";
export const adminAccessAllowed = user => user?.role === "admin" && (!adminMfaRequired() || (user.mfaEnabled && user.mfaVerifiedAt > 0));
export function requireAdmin(user) {
  if (user.role !== "admin") reject(403, "Acesso restrito à administração.");
  if (process.env.NODE_ENV === "production" && !user.emailVerified) reject(403, "Confirme seu email nas Configurações para continuar.");
  if (!adminAccessAllowed(user)) reject(403, "Ative a autenticação em duas etapas nas Configurações e entre novamente para acessar a administração.");
}
export function recordAudit(store, actor, targetId, action, details = {}) {
  store.prepare("INSERT INTO audit_events(id,created_at,actor_id,actor_name,target_id,action,details) VALUES(?,?,?,?,?,?,?)").run(randomUUID(), Date.now(), actor.id, actor.name, targetId, action, JSON.stringify(details));
}

export function createSession(userId, request, mfaVerified = false) {
  const value = token(), store = database();
  store.prepare("DELETE FROM user_sessions WHERE expires_at<=?").run(Date.now());
  const previous = requestToken(request);
  if (previous) store.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(hash(previous));
  store.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at,mfa_verified_at) VALUES(?,?,?,?)").run(hash(value), userId, Date.now() + sessionSeconds * 1000, mfaVerified ? Date.now() : 0);
  return cookie(value);
}

export function protect(request, action, limit = 20) {
  // Mutations require an explicit origin, including requests outside the browser.
  if (!request.headers.get("origin")) reject(403, "Origem da solicitação não permitida.");
  guard(request, `auth:${action}`, limit, 15 * 60_000);
}

export async function register(request) {
  protect(request, "register", 10);
  const input = await body(request);
  const name = field(input.name, "Nome", 120), address = email(input.email);
  if (name.length < 2) reject(400, "Informe seu nome completo.");
  if (input.terms !== true) reject(400, "Aceite os Termos de Uso para criar sua conta.");
  const password = validatePassword(input.password);
  if (process.env.NODE_ENV === "production" && !smtpReady()) reject(503, "O envio de confirmação está indisponível. Tente novamente mais tarde.");
  guard(request, `auth:register-email:${address}`, 5, 3_600_000);
  if (database().prepare("SELECT id FROM users WHERE email=?").get(address)) reject(409, "Não foi possível cadastrar este e-mail. Tente entrar ou recuperar sua senha.");
  const encoded = await passwordHash(password), value = token(), now = Date.now();
  const code = String(randomInt(1_000_000)).padStart(6, "0"), digest = hash(value);
  const store = database();
  store.prepare("DELETE FROM pending_registrations WHERE expires_at<=?").run(now);
  store.prepare(`INSERT INTO pending_registrations(token_hash,email,name,password_hash,code_hash,expires_at,last_sent_at,terms_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name,
    password_hash=excluded.password_hash,code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0,terms_at=excluded.terms_at`)
    .run(digest, address, name, encoded, hash(`${value}:${code}`), now + 600_000, now, now);
  try { await sendRegistrationCode(address, code); }
  catch {
    store.prepare("DELETE FROM pending_registrations WHERE token_hash=?").run(digest);
    reject(503, "Não foi possível enviar o código. Tente cadastrar novamente em instantes.");
  }
  return json({ verificationRequired: true, message: registrationMessage() }, 202, { "Set-Cookie": cookie(value, 1800, REGISTRATION_COOKIE) });
}

function registrationMessage() {
  return !smtpReady() && process.env.NODE_ENV !== "production"
    ? "Código gerado na caixa de testes local. Nenhum e-mail externo foi enviado."
    : "Enviamos um código para seu e-mail. Confira também a pasta de spam.";
}

function sendRegistrationCode(address, code) {
  return mail({ category: "cadastro", to: address, subject: "Confirme seu cadastro — Plataforma de Privacidade", text: `Seu código de confirmação: ${code}\n\nEle expira em 10 minutos. Digite-o na tela de confirmação para criar sua conta. Não compartilhe este código.\n\nSe não solicitou o cadastro, ignore esta mensagem. Nenhuma conta será criada sem a confirmação.` });
}

function pendingRegistration(request) {
  const value = requestToken(request, REGISTRATION_COOKIE);
  if (!value || !/^[\w-]{43}$/.test(value)) return null;
  const row = database().prepare("SELECT * FROM pending_registrations WHERE token_hash=?").get(hash(value));
  return row ? { ...row, token: value } : null;
}

export async function registrationStatus(request) {
  const row = pendingRegistration(request);
  if (!row || row.expires_at <= Date.now() || row.attempts >= 5) return json({ pending: false });
  return json({ pending: true, email: row.email, expiresAt: row.expires_at, resendAt: row.last_sent_at + 60_000, message: registrationMessage() });
}

export async function resendRegistration(request) {
  protect(request, "resend-registration", 10);
  const row = pendingRegistration(request), now = Date.now();
  if (!row || row.expires_at <= now || row.attempts >= 5) reject(400, "Cadastro expirado ou bloqueado. Inicie o cadastro novamente.");
  if (now < row.last_sent_at + 60_000) reject(429, "Aguarde um minuto entre os envios.");
  guard(request, `auth:register-email:${row.email}`, 5, 3_600_000);
  let code, digest;
  do {
    code = String(randomInt(1_000_000)).padStart(6, "0");
    digest = hash(`${row.token}:${code}`);
  } while (digest === row.code_hash);
  database().prepare("UPDATE pending_registrations SET code_hash=?,last_sent_at=?,expires_at=? WHERE token_hash=?").run(digest, now, now + 600_000, row.token_hash);
  try { await sendRegistrationCode(row.email, code); }
  catch {
    database().prepare("DELETE FROM pending_registrations WHERE token_hash=? AND code_hash=?").run(row.token_hash, digest);
    reject(503, "Não foi possível enviar o código. Inicie o cadastro novamente.");
  }
  return json({ message: registrationMessage(), resendAt: now + 60_000 }, 200, { "Set-Cookie": cookie(row.token, 1800, REGISTRATION_COOKIE) });
}

export async function confirmRegistration(request) {
  protect(request, "confirm-registration", 20);
  const input = await body(request), row = pendingRegistration(request), now = Date.now();
  if (!row || row.expires_at <= now || row.attempts >= 5) reject(400, "Cadastro expirado ou bloqueado. Inicie o cadastro novamente.");
  database().prepare("UPDATE pending_registrations SET attempts=attempts+1 WHERE token_hash=?").run(row.token_hash);
  if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code) || !timingSafeEqual(Buffer.from(hash(`${row.token}:${input.code}`), "hex"), Buffer.from(row.code_hash, "hex"))) reject(400, "Código incorreto. Confira o código mais recente recebido por e-mail.");
  const store = database(), id = randomUUID();
  let session;
  store.exec("BEGIN IMMEDIATE");
  try {
    const inserted = store.prepare("INSERT INTO users(id,name,email,password_hash,created_at,terms_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING").run(id, row.name, row.email, row.password_hash, now, row.terms_at);
    if (!inserted.changes) reject(409, "Este e-mail já possui uma conta. Entre ou recupere sua senha.");
    store.prepare("INSERT INTO verified_emails(user_id,verified_at) VALUES(?,?)").run(id, now);
    store.prepare("DELETE FROM pending_registrations WHERE token_hash=?").run(row.token_hash);
    session = createSession(id, request);
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  const response = json({ message: "E-mail confirmado. Conta criada." }, 201, { "Set-Cookie": session });
  response.headers.append("Set-Cookie", cookie("", 0, REGISTRATION_COOKIE));
  return response;
}

export async function login(request) {
  protect(request, "login", 30);
  const input = await body(request), address = email(input.email);
  guard(request, `auth:account:${address}`, 10, 15 * 60_000);
  if (typeof input.password !== "string" || input.password.length > 128 || !input.password.length) reject(400, "Informe sua senha.");
  const user = database().prepare("SELECT * FROM users WHERE email=?").get(address);
  // Perform the same expensive derivation when the account does not exist.
  const valid = await passwordMatches(input.password, user?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`);
  if (!user || !valid) reject(401, "E-mail ou senha incorretos.");
  // A reset or administrative edit may have changed credentials while scrypt was running.
  const current = database().prepare("SELECT password_hash,email FROM users WHERE id=?").get(user.id);
  if (current?.password_hash !== user.password_hash || current.email !== address) reject(401, "E-mail ou senha incorretos.");
  if (database().prepare("SELECT user_id FROM user_mfa WHERE user_id=?").get(user.id)) return (await import("./mfa.js")).beginMfaLogin(user, request);
  return json({ message: "Login realizado." }, 200, { "Set-Cookie": createSession(user.id, request) });
}

export async function logout(request) {
  protect(request, "logout", 60);
  const value = requestToken(request);
  if (value) database().prepare("DELETE FROM user_sessions WHERE token_hash=?").run(hash(value));
  const challenge = requestToken(request, "portfolio_mfa");
  if (challenge) database().prepare("DELETE FROM mfa_challenges WHERE token_hash=?").run(hash(challenge));
  const response = json({ message: "Você saiu da conta." }, 200, { "Set-Cookie": cookie("", 0) });
  response.headers.append("Set-Cookie", cookie("", 0, "portfolio_mfa"));
  return response;
}

export async function profile(request) {
  protect(request, "profile");
  const user = requireUser(request, { allowUnverified: true }), input = await body(request), name = field(input.name, "Nome", 120);
  if (name.length < 2) reject(400, "Informe seu nome completo.");
  database().prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
  return json({ message: "Nome atualizado." });
}

export async function changePassword(request) {
  protect(request, "password", 10);
  const user = requireUser(request, { allowUnverified: true }), input = await body(request);
  const password = validatePassword(input.password);
  if (typeof input.currentPassword !== "string" || input.currentPassword.length > 128) reject(400, "Informe a senha atual.");
  const store = database(), stored = store.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id).password_hash;
  if (!await passwordMatches(input.currentPassword, stored)) reject(400, "A senha atual está incorreta.");
  const encoded = await passwordHash(password);
  // Synchronous transaction prevents a concurrent reset/change from being overwritten.
  store.exec("BEGIN IMMEDIATE");
  try {
    if (!store.prepare("UPDATE users SET password_hash=? WHERE id=? AND password_hash=?").run(encoded, user.id, stored).changes) reject(409, "A senha foi alterada. Entre novamente.");
    store.prepare("DELETE FROM user_sessions WHERE user_id=?").run(user.id);
    store.prepare("DELETE FROM password_resets WHERE user_id=?").run(user.id);
    store.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(user.id);
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  return json({ message: "Senha alterada. Entre novamente em seus dispositivos." }, 200, { "Set-Cookie": cookie("", 0) });
}

export async function recover(request) {
  protect(request, "recover", 10);
  const input = await body(request), address = email(input.email);
  if (process.env.NODE_ENV === "production" && (!smtpReady() || !process.env.SITE_URL?.startsWith("https://"))) reject(503, "Recuperação de senha temporariamente indisponível.");
  const store = database(), user = store.prepare("SELECT id FROM users WHERE email=?").get(address);
  store.prepare("DELETE FROM password_resets WHERE expires_at<=?").run(Date.now());
  if (user) {
    const value = token(), digest = hash(value);
    store.prepare("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at").run(digest, user.id, Date.now() + 30 * 60_000);
    const base = new URL(process.env.SITE_URL || request.url).origin;
    try {
      await mail({ category: "recuperacao", to: address, subject: "Redefina sua senha — Plataforma de Privacidade", text: `Você solicitou uma nova senha. Abra o link abaixo, válido por 30 minutos e para um único uso:\n\n${base}/redefinir-senha#${value}\n\nSe não foi você, ignore esta mensagem. Sua senha permanece a mesma.` });
    } catch {
      store.prepare("DELETE FROM password_resets WHERE token_hash=?").run(digest);
      console.error("Envio de recuperação de senha indisponível.");
    }
  }
  return json({ message: !smtpReady() && process.env.NODE_ENV !== "production"
    ? "Se houver uma conta com este e-mail, as instruções estarão na caixa de testes local. Nenhum e-mail externo foi enviado."
    : "Se houver uma conta com este e-mail, enviaremos as instruções de recuperação. Confira também o spam." });
}

export async function resetPassword(request) {
  protect(request, "reset", 15);
  const input = await body(request), password = validatePassword(input.password);
  if (typeof input.token !== "string" || !/^[\w-]{43}$/.test(input.token)) reject(400, "Link inválido ou expirado. Solicite uma nova recuperação.");
  const encoded = await passwordHash(password), store = database();
  store.exec("BEGIN IMMEDIATE");
  try {
    const reset = store.prepare("DELETE FROM password_resets WHERE token_hash=? AND expires_at>? RETURNING user_id").get(hash(input.token), Date.now());
    if (!reset) reject(400, "Link inválido ou expirado. Solicite uma nova recuperação.");
    store.prepare("UPDATE users SET password_hash=? WHERE id=?").run(encoded, reset.user_id);
    store.prepare("DELETE FROM user_sessions WHERE user_id=?").run(reset.user_id);
    store.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(reset.user_id);
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  return json({ message: "Senha redefinida. Você já pode entrar com a nova senha." }, 200, { "Set-Cookie": cookie("", 0) });
}
