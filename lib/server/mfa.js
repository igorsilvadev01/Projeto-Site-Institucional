import { randomBytes, createHash } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { authDatabase, requireUser, requestToken, createSession, protect, passwordMatches, recordAudit } from "./auth.js";
import { body, field, json, reject } from "./core.js";
import { encryptSecret, decryptSecret } from "./secrets.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const MFA_COOKIE = "portfolio_mfa";
const cookie = (value, seconds) => `${MFA_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.NODE_ENV === "production" || process.env.SITE_URL?.startsWith("https://") ? "; Secure" : ""}`;

export function beginMfaLogin(user, request) {
  const store = authDatabase(), challenge = randomBytes(32).toString("base64url");
  store.prepare("DELETE FROM mfa_challenges WHERE expires_at<=? OR user_id=?").run(Date.now(), user.id);
  store.prepare("INSERT INTO mfa_challenges(token_hash,user_id,credential_hash,expires_at) VALUES(?,?,?,?)").run(hash(challenge), user.id, hash(`${user.email}:${user.password_hash}`), Date.now() + 300_000);
  const previous = requestToken(request);
  if (previous) store.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(hash(previous));
  const response = json({ mfaRequired: true, message: "Digite o código do aplicativo autenticador ou um código de recuperação." }, 202, { "Set-Cookie": cookie(challenge, 300) });
  response.headers.append("Set-Cookie", `portfolio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" || process.env.SITE_URL?.startsWith("https://") ? "; Secure" : ""}`);
  return response;
}

export async function mfaSetup(request) {
  protect(request, "mfa-setup", 5);
  const user = requireUser(request), input = await body(request), store = authDatabase();
  if (user.role !== "admin") reject(403, "Recurso destinado a administradores.");
  if (store.prepare("SELECT user_id FROM user_mfa WHERE user_id=?").get(user.id)) reject(409, "A autenticação em duas etapas já está ativa.");
  const stored = store.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id).password_hash;
  if (typeof input.password !== "string" || input.password.length > 128 || !await passwordMatches(input.password, stored)) reject(400, "A senha atual está incorreta.");
  const current = requireUser(request);
  if (current.role !== "admin" || store.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id)?.password_hash !== stored) reject(409, "A conta foi alterada. Entre novamente.");
  const secret = generateSecret();
  store.prepare("INSERT INTO mfa_enrollments(user_id,session_hash,secret_enc,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET session_hash=excluded.session_hash,secret_enc=excluded.secret_enc,expires_at=excluded.expires_at")
    .run(user.id, hash(requestToken(request)), encryptSecret(secret), Date.now() + 600_000);
  return json({ secret, qr: await QRCode.toDataURL(generateURI({ issuer: "Plataforma de Privacidade", label: user.email, secret }), { width: 240, margin: 2 }), message: "Adicione a conta ao aplicativo e confirme o código. Esta configuração expira em 10 minutos." });
}

function recoveryCodes(store, userId) {
  const codes = Array.from({ length: 8 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g).join("-"));
  store.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=?").run(userId);
  for (const code of codes) store.prepare("INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES(?,?)").run(userId, hash(code.replaceAll("-", "")));
  return codes;
}

export async function mfaActivate(request) {
  protect(request, "mfa-activate", 10);
  const user = requireUser(request), input = await body(request), store = authDatabase();
  if (user.role !== "admin") reject(403, "Recurso destinado a administradores.");
  const enrollment = store.prepare("SELECT * FROM mfa_enrollments WHERE user_id=? AND session_hash=? AND expires_at>?").get(user.id, hash(requestToken(request)), Date.now());
  if (!enrollment) reject(400, "Configuração expirada. Inicie novamente.");
  if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code)) reject(400, "Informe o código de seis dígitos.");
  const result = verifySync({ secret: decryptSecret(enrollment.secret_enc), token: input.code, epochTolerance: 30 });
  if (!result.valid) reject(400, "Código incorreto. Confira o aplicativo e o horário do seu celular.");
  let codes;
  store.exec("BEGIN IMMEDIATE");
  try {
    const current = requireUser(request);
    if (current.role !== "admin") reject(403, "Recurso destinado a administradores.");
    if (store.prepare("SELECT user_id FROM user_mfa WHERE user_id=?").get(user.id)) reject(409, "A autenticação em duas etapas já está ativa.");
    if (!store.prepare("DELETE FROM mfa_enrollments WHERE user_id=? AND secret_enc=? AND session_hash=? AND expires_at>?").run(user.id, enrollment.secret_enc, hash(requestToken(request)), Date.now()).changes) reject(409, "Configuração alterada. Inicie novamente.");
    store.prepare("INSERT INTO user_mfa(user_id,secret_enc,enabled_at,last_step) VALUES(?,?,?,?)").run(user.id, enrollment.secret_enc, Date.now(), result.timeStep);
    codes = recoveryCodes(store, user.id);
    store.prepare("DELETE FROM user_sessions WHERE user_id=? AND token_hash!=?").run(user.id, hash(requestToken(request)));
    store.prepare("UPDATE user_sessions SET mfa_verified_at=? WHERE token_hash=?").run(Date.now(), hash(requestToken(request)));
    store.prepare("DELETE FROM password_resets WHERE user_id=?").run(user.id);
    recordAudit(store, user, user.id, "mfa.activated");
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  return json({ recoveryCodes: codes, message: "Autenticação em duas etapas ativada. Guarde os códigos de recuperação em local seguro; eles são exibidos uma única vez." });
}

export async function mfaLogin(request) {
  protect(request, "mfa-login", 20);
  const input = await body(request), value = requestToken(request, MFA_COOKIE), store = authDatabase();
  if (!value || !/^[\w-]{43}$/.test(value)) reject(401, "A confirmação expirou. Entre novamente.");
  const challenge = store.prepare("UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=? AND expires_at>? AND attempts<5 RETURNING *").get(hash(value), Date.now());
  if (!challenge) reject(401, "A confirmação expirou ou atingiu o limite de tentativas. Entre novamente.");
  const user = store.prepare("SELECT u.*,m.secret_enc,m.last_step FROM users u JOIN user_mfa m ON m.user_id=u.id WHERE u.id=?").get(challenge.user_id);
  if (!user || challenge.credential_hash !== hash(`${user.email}:${user.password_hash}`)) reject(401, "A conta foi alterada. Entre novamente.");
  const code = field(input.code, "Código", 32).toUpperCase().replace(/[\s-]/g, "");
  const result = /^\d{6}$/.test(code) ? verifySync({ secret: decryptSecret(user.secret_enc), token: code, epochTolerance: 30, afterTimeStep: user.last_step }) : { valid: false };
  const recovery = /^[A-F0-9]{20}$/.test(code) && store.prepare("SELECT code_hash FROM mfa_recovery_codes WHERE user_id=? AND code_hash=?").get(user.id, hash(code));
  if (!result.valid && !recovery) reject(400, "Código inválido ou já utilizado. Use o código atual do aplicativo ou outro código de recuperação.");
  let session;
  store.exec("BEGIN IMMEDIATE");
  try {
    const current = store.prepare("SELECT u.email,u.password_hash,m.secret_enc FROM users u JOIN user_mfa m ON m.user_id=u.id WHERE u.id=?").get(user.id);
    if (!current || current.secret_enc !== user.secret_enc || hash(`${current.email}:${current.password_hash}`) !== challenge.credential_hash) reject(401, "A conta foi alterada. Entre novamente.");
    if (!store.prepare("DELETE FROM mfa_challenges WHERE token_hash=? AND expires_at>? AND attempts<=5").run(hash(value), Date.now()).changes) reject(401, "A confirmação expirou. Entre novamente.");
    if (recovery) {
      if (!store.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=? AND code_hash=?").run(user.id, hash(code)).changes) reject(400, "Código já utilizado.");
    } else if (!store.prepare("UPDATE user_mfa SET last_step=? WHERE user_id=? AND last_step<?").run(result.timeStep, user.id, result.timeStep).changes) reject(400, "Código já utilizado. Aguarde o próximo código.");
    session = createSession(user.id, request, true);
    recordAudit(store, user, user.id, recovery ? "mfa.recovery_used" : "mfa.login");
    store.exec("COMMIT");
  } catch (error) { store.exec("ROLLBACK"); throw error; }
  const response = json({ message: "Login confirmado." }, 200, { "Set-Cookie": session });
  response.headers.append("Set-Cookie", cookie("", 0));
  return response;
}
